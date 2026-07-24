package main

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

type NPC struct {
	Id            int64
	HasSpawnPoint bool // false = discovered via zone-ID-range fallback only (quest-spawned, no static spawn2 row)
	// MissingReferences flags, by field name (npc_faction_id/npc_spells_id/merchant_id), any
	// nonzero FK column that doesn't resolve to a real row in THIS NPC's own database — see
	// annotateMissingReferences. Same "verbatim-copied local surrogate ID, likely dangling after
	// a sync" situation as spawn2.spawngroupID (SpawnPoint.SpawnGroupMissing), just for npc_types'
	// own reference columns. Only set (non-nil) when at least one field is actually missing.
	MissingReferences map[string]bool
	Fields            map[string]interface{}
}

type NPCDiffRow struct {
	Status string
	Source *NPC
	Sink   *NPC
}

type SyncOptions struct {
	ZoneShortName string
	ZoneVersion   int8
	ZoneIdNumber  int64
	SyncNPCTypes  bool
	DryRun        bool
	NPCIds        []int64 // empty means all NPCs in zone
}

// SyncResult no longer carries any spawn-point-creation fields — Sync() only ever touches
// npc_types now. Spawn point creation belongs exclusively to the Spawn Points tab
// (SyncSpawnPoints), so an NPC's own row syncs regardless of whether it has a spawn point yet —
// see the "Per-NPC spawn point creation" removal note in CLAUDE.md's Sync Design section.
type SyncResult struct {
	DryRun     bool
	NPCsSynced []int64
	Skipped    []SkippedNPC // NPCs deliberately not synced (not found in source) — every NPCId ends up in exactly one of NPCsSynced or Skipped
	TODOItems  []TODOItem
	Errors     []string // genuine unexpected failures only — never used for a deliberate skip, see SkippedNPC
}

// SkippedNPC is an NPC Sync() deliberately declined to touch — not a failure, the safety
// mechanism doing its job. Structured (not a formatted string) so the frontend can render it
// inline next to the NPC it applies to instead of a disconnected wall of text.
type SkippedNPC struct {
	NPCID  int64
	Name   string
	Reason string
}

func (a *App) GetNPCsForZone(shortName string, version int8, zoneIdNumber int64, isSource bool) ([]NPC, error) {
	db := a.sourceDB
	if !isSource {
		db = a.sinkDB
	}
	idLow := zoneIdNumber * 1000
	idHigh := idLow + 1000
	// Two independently-cheap branches, combined with UNION ALL rather than one query with a
	// LEFT JOIN + correlated NOT EXISTS: that shape forces MySQL to scan and subquery against
	// every row of npc_types (the whole database's NPCs, not just this zone). Branch 1 mirrors
	// the original query (starts from spawn2 filtered to this zone — a handful of rows — and
	// joins up). Branch 2 starts from an indexed primary-key range scan on npc_types.id (at
	// most 1000 candidate rows) before the NOT EXISTS check ever runs. The branches can never
	// overlap by construction (branch 2 explicitly excludes anything with a spawn point
	// anywhere), so UNION ALL is safe without a dedup pass.
	rows, err := db.QueryContext(a.ctx, `
		(SELECT nt.*, 1 AS has_spawn_point
		 FROM npc_types nt
		     JOIN spawnentry se ON se.npcID = nt.id
		     JOIN spawngroup sg ON sg.id = se.spawngroupID
		     JOIN spawn2 s ON s.spawngroupID = sg.id
		 WHERE s.zone = ? AND s.version = ?
		 GROUP BY nt.id)
		UNION ALL
		(SELECT nt.*, 0 AS has_spawn_point
		 FROM npc_types nt
		 WHERE nt.id >= ? AND nt.id < ?
		   AND NOT EXISTS (
		       SELECT 1 FROM spawnentry se2
		           JOIN spawngroup sg2 ON sg2.id = se2.spawngroupID
		           JOIN spawn2 s2 ON s2.spawngroupID = sg2.id
		       WHERE se2.npcID = nt.id
		   ))
		ORDER BY Name
		`, shortName, version, idLow, idHigh)
	if err != nil {
		return nil, err
	}
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var npcs []NPC

	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}

		fields := make(map[string]interface{})
		for i, col := range cols {
			if b, ok := values[i].([]byte); ok {
				fields[col] = string(b)
			} else {
				fields[col] = values[i]
			}
		}

		hasSpawnPoint := toInt64(fields["has_spawn_point"]) != 0
		delete(fields, "has_spawn_point")

		npc := NPC{
			Id:            toInt64(fields["id"]),
			HasSpawnPoint: hasSpawnPoint,
			Fields:        fields,
		}
		npcs = append(npcs, npc)
	}
	return npcs, nil
}

func (a *App) CompareZones(shortName string, version int8, zoneIdNumber int64) ([]NPCDiffRow, error) {
	// Call GetNPCsForZone for source and sink
	sourceNpcs, err := a.GetNPCsForZone(shortName, version, zoneIdNumber, true)
	if err != nil {
		return nil, err
	}
	sinkNpcs, err := a.GetNPCsForZone(shortName, version, zoneIdNumber, false)
	if err != nil {
		return nil, err
	}
	if err := annotateMissingReferences(a.ctx, a.sourceDB, sourceNpcs); err != nil {
		return nil, err
	}
	if err := annotateMissingReferences(a.ctx, a.sinkDB, sinkNpcs); err != nil {
		return nil, err
	}
	// Build a map of sink NPCs by ID
	m := make(map[int64]NPC)
	for _, sinkNpc := range sinkNpcs {
		m[sinkNpc.Id] = sinkNpc
	}
	// Walk source - categorize each as match,modified, or new
	diff := make([]NPCDiffRow, 0)
	seen := make(map[int64]bool)
	if len(sourceNpcs) > 0 && len(sinkNpcs) > 0 {
		if len(sourceNpcs[0].Fields) != len(sinkNpcs[0].Fields) {
			fmt.Printf("Schema mismatch: source=%d cols, sink=%d cols\n",
				len(sourceNpcs[0].Fields), len(sinkNpcs[0].Fields))
		}
	}
	for _, sourceNpc := range sourceNpcs {
		sinkNpc, exists := m[sourceNpc.Id]
		if exists {
			seen[sinkNpc.Id] = true
			result := mapsEqual(sourceNpc.Fields, sinkNpc.Fields)
			if result {
				// match
				diff = append(diff, NPCDiffRow{
					Status: "match",
					Source: &sourceNpc,
					Sink:   &sinkNpc,
				})
			} else {
				// modified
				diff = append(diff, NPCDiffRow{
					Status: "modified",
					Source: &sourceNpc,
					Sink:   &sinkNpc,
				})
			}
		} else {
			diff = append(diff, NPCDiffRow{
				Status: "new",
				Source: &sourceNpc,
				Sink:   nil,
			})
		}
	}
	// Walk sink map — find any IDs not seen in source → removed
	for _, sinkNpc := range sinkNpcs {
		if !seen[sinkNpc.Id] {
			diff = append(diff, NPCDiffRow{
				Status: "removed",
				Source: nil,
				Sink:   &sinkNpc,
			})
		}
	}

	return diff, nil
}

// referenceFKColumns lists the npc_types FK columns that have a working comparison drawer (see
// lib/npcHelpers.js's referenceComparisonTypes) and the table/column each one's value is expected
// to resolve against in the SAME database it was read from. loottable_id has no drawer in the
// NPC detail panel's References section (see the Loot tab instead) but is still checked here —
// loottable.id is a local surrogate exactly like npc_faction.id, so the same dangling-after-sync
// risk applies. alt_currency_id is unused (0 rows) on every server checked so far, so it's the
// only one still excluded. merchantlist has no single-row "id" the way npc_faction/npc_spells do
// — npc_types.merchant_id points straight at merchantlist rows (see NPCMerchantComparison) — so
// its existence check is "does merchantlist have ANY row with this merchantid" via a DISTINCT
// query, not a primary-key lookup. Note the two tables spell it differently: npc_types.merchant_id
// (underscore) vs merchantlist.merchantid (no underscore) — confirmed via SHOW COLUMNS on both
// after this mismatch caused a real, shipped bug (see Repo Meta): code had used "merchantid" for
// the npc_types side too, so every npc_types.Fields["merchantid"] lookup silently returned nothing.
var referenceFKColumns = map[string]struct{ table, column string }{
	"npc_faction_id": {"npc_faction", "id"},
	"npc_spells_id":  {"npc_spells", "id"},
	"merchant_id":    {"merchantlist", "merchantid"},
	"loottable_id":   {"loottable", "id"},
}

// annotateMissingReferences flags, per NPC, any of referenceFKColumns whose nonzero value doesn't
// resolve to a real row in THIS SAME database — these FK columns are local surrogate IDs (see
// CLAUDE.md's identity trust model), copied verbatim by upsertNPC() same as every other npc_types
// column, so after a sync a sink NPC's npc_faction_id/npc_spells_id/merchant_id is very likely
// pointing at nothing (or the wrong row) in the sink's own reference tables. Batched into exactly
// 3 queries regardless of zone size — mirrors getSpawnPointsForZone's IN-clause batching. Only
// called from CompareZones (not GetNPCsForZone itself, which Sync() also uses and has no need for
// this), so Sync() doesn't pay for checks it never displays.
func annotateMissingReferences(ctx context.Context, db *sql.DB, npcs []NPC) error {
	idSets := make(map[string]map[int64]bool, len(referenceFKColumns))
	for field := range referenceFKColumns {
		idSets[field] = make(map[int64]bool)
	}
	for _, npc := range npcs {
		for field := range referenceFKColumns {
			if id := toInt64(npc.Fields[field]); id != 0 {
				idSets[field][id] = true
			}
		}
	}

	existing := make(map[string]map[int64]bool, len(referenceFKColumns))
	for field, target := range referenceFKColumns {
		found, err := existingIds(ctx, db, target.table, target.column, idSets[field])
		if err != nil {
			return err
		}
		existing[field] = found
	}

	for i := range npcs {
		var missing map[string]bool
		for field := range referenceFKColumns {
			id := toInt64(npcs[i].Fields[field])
			if id != 0 && !existing[field][id] {
				if missing == nil {
					missing = make(map[string]bool)
				}
				missing[field] = true
			}
		}
		npcs[i].MissingReferences = missing
	}
	return nil
}

func buildTODOItems(sourceNpc NPC, sinkNpc *NPC, zoneShortName string, zoneVersion int8) []TODOItem {
	fkFields := []struct {
		field   string
		todoTyp string
	}{
		{"loottable_id", "loottable"},
		{"npc_spells_id", "spells"},
		{"npc_faction_id", "faction"},
		{"merchant_id", "merchant"},
		{"alt_currency_id", "alt_currency"},
	}
	name := fmt.Sprintf("%v", sourceNpc.Fields["name"])
	var items []TODOItem
	for _, fk := range fkFields {
		sourceID := toInt64(sourceNpc.Fields[fk.field])
		if sourceID == 0 {
			continue
		}
		var sinkID int64
		if sinkNpc != nil {
			sinkID = toInt64(sinkNpc.Fields[fk.field])
		}
		items = append(items, TODOItem{
			Type:        fk.todoTyp,
			SourceID:    sourceID,
			SinkID:      sinkID,
			NPCID:       sourceNpc.Id,
			NPCName:     name,
			ZoneName:    zoneShortName,
			ZoneVersion: zoneVersion,
		})
	}
	return items
}

func upsertNPC(ctx context.Context, tx *sql.Tx, fields map[string]interface{}, sinkColumns map[string]bool) error {
	var columns []string
	for col := range fields {
		if sinkColumns[col] {
			columns = append(columns, col)
		}
	}
	sort.Strings(columns)

	placeholders := make([]string, len(columns))
	values := make([]interface{}, len(columns))
	updateClauses := make([]string, 0, len(columns)-1)
	for i, col := range columns {
		placeholders[i] = "?"
		values[i] = fields[col]
		if col != "id" {
			updateClauses = append(updateClauses, fmt.Sprintf("%s=VALUES(%s)", col, col))
		}
	}

	query := fmt.Sprintf(
		"INSERT INTO npc_types (%s) VALUES (%s) ON DUPLICATE KEY UPDATE %s",
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
		strings.Join(updateClauses, ", "),
	)
	_, err := tx.ExecContext(ctx, query, values...)
	return err
}

func (a *App) Sync(options SyncOptions) (SyncResult, error) {
	result := SyncResult{DryRun: options.DryRun}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}
	if !options.SyncNPCTypes {
		return result, nil
	}

	sourceNpcs, err := a.GetNPCsForZone(options.ZoneShortName, options.ZoneVersion, options.ZoneIdNumber, true)
	if err != nil {
		return result, err
	}
	sinkNpcs, err := a.GetNPCsForZone(options.ZoneShortName, options.ZoneVersion, options.ZoneIdNumber, false)
	if err != nil {
		return result, err
	}
	sourceById := make(map[int64]NPC, len(sourceNpcs))
	for _, npc := range sourceNpcs {
		sourceById[npc.Id] = npc
	}
	sinkById := make(map[int64]NPC, len(sinkNpcs))
	for _, npc := range sinkNpcs {
		sinkById[npc.Id] = npc
	}

	var sinkColumns map[string]bool
	var tx *sql.Tx
	if !options.DryRun {
		sinkColumns, err = getSinkColumns(a.ctx, a.sinkDB, "npc_types")
		if err != nil {
			return result, err
		}
		tx, err = a.sinkDB.BeginTx(a.ctx, nil)
		if err != nil {
			return result, err
		}
	}

	for _, id := range options.NPCIds {
		sourceNpc, ok := sourceById[id]
		if !ok {
			result.Skipped = append(result.Skipped, SkippedNPC{
				NPCID:  id,
				Name:   fmt.Sprintf("NPC %d", id),
				Reason: "not found in source zone data",
			})
			continue
		}
		var sinkNpc *NPC
		if npc, ok := sinkById[id]; ok {
			sinkNpc = &npc
		}

		result.TODOItems = append(result.TODOItems, buildTODOItems(sourceNpc, sinkNpc, options.ZoneShortName, options.ZoneVersion)...)

		if options.DryRun {
			result.NPCsSynced = append(result.NPCsSynced, id)
			continue
		}

		if err := upsertNPC(a.ctx, tx, sourceNpc.Fields, sinkColumns); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("NPC %d: %w", id, err)
		}

		result.NPCsSynced = append(result.NPCsSynced, id)
	}

	if !options.DryRun {
		if err := tx.Commit(); err != nil {
			return result, err
		}
		if err := appendTODOItems(result.TODOItems); err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("failed to save TODO items: %v", err))
		}
	}

	return result, nil
}
