package main

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

// SpawnEntry is one NPC in a spawn point's weighted spawngroup — one spawnentry row.
type SpawnEntry struct {
	NPCID    int64
	NPCName  string // resolved against the database this was fetched from; if Orphaned, recovered from the OTHER database instead
	Chance   int64
	Orphaned bool // true if npcID didn't resolve to a real npc_types row in the database this was fetched from
}

// SpawnPoint is one spawn2 row plus its linked spawngroup settings and full spawnentry roster.
// Unlike NPC, identity across databases is coordinates (Fields["x"/"y"/"z"]), not Id — see the
// Spawn point identity note in CLAUDE.md for why.
type SpawnPoint struct {
	Id                  int64
	SpawnGroupId        int64
	SpawnGroupFields    map[string]interface{} // dynamic spawngroup columns, minus id — includes "name"; nil if SpawnGroupMissing
	SpawnGroupMissing   bool                   // true if SpawnGroupId doesn't correspond to any real spawngroup row — a dangling reference, see SyncSpawnPoints
	PathgridMissing     bool                   // true if Fields["pathgrid"] is nonzero but doesn't correspond to any real grid row for this zone in this same database — see CompareSpawns
	LocationSharedCount int                    // OTHER spawn2 rows (this zone/version) sharing this spawngroupID — drives the "shared ×N" badge
	Fields              map[string]interface{} // dynamic spawn2 columns, minus id/spawngroupID
	SpawnEntries        []SpawnEntry
}

// SpawnDiffRow mirrors NPCDiffRow, but matched by coordinate (see SpawnPoint) not ID.
type SpawnDiffRow struct {
	Status             string // "new" | "modified" | "removed" | "match"
	Source             *SpawnPoint
	Sink               *SpawnPoint
	FieldsDiffer       bool // true if Source/Sink spawn2 columns (its own fields) differ — the only thing "modified" status actually lets Sync fix
	SpawnEntriesDiffer bool // true if Source/Sink spawn entries composition differs — never auto-synced, always flagged for manual review

	// Status can be "modified" from FieldsDiffer alone, SpawnEntriesDiffer alone, or both — exposing them
	// separately lets the frontend tell "this row has something Sync can actually change" apart from
	// "this row only differs in its spawn entries, which Sync will never touch." Collapsing both into
	// one "modified" bucket let a user select/sync a spawn-entries-only row, get a no-op UPDATE, and believe
	// they'd handled it when the real (unsyncable) difference was still sitting there.

	// SpawnGroupCollisionRisk is only ever computed for Status == "new" rows: true if Source's raw
	// SpawnGroupId already exists as a real spawngroup row on the SINK, before this spawn2 row has
	// ever been synced there. Categorically different from SpawnPoint.SpawnGroupMissing (a
	// same-database check — does this side's own referenced id exist in this side's own data):
	// this is a cross-database check, and a sink spawngroup already sitting at source's exact
	// auto-increment number, for a location the sink never had before, is essentially never a
	// legitimate coincidence — flagged as a likely collision with unrelated content, not treated
	// as "the group's already there, nothing to do." Warning only, never blocks syncing the spawn2
	// row itself — see annotateSpawnGroupCollisionRisk.
	SpawnGroupCollisionRisk bool
}

type SpawnSyncOptions struct {
	ZoneShortName  string
	ZoneVersion    int8
	ZoneIdNumber   int64 // zone.zoneidnumber — used to check which grids already exist on the sink, see fetchZoneGridIds/pathgrid handling in updateSpawn2/SyncSpawnPoints
	DryRun         bool
	SpawnIds       []int64      // sink spawn2.id — "modified" rows being synced (UPDATE spawn2's own columns only, spawngroupID untouched)
	NewSpawnCoords [][3]float64 // source (x,y,z) — "new" rows being synced (plain INSERT of spawn2's own columns, spawngroupID copied verbatim from source — see SyncSpawnPoints)
}

// SkippedSpawn mirrors SkippedNPC's "declined, not failed" shape for the spawn-points tab —
// separate type rather than reusing SkippedNPC, since a skip here is about a location, not an NPC.
type SkippedSpawn struct {
	X, Y, Z float64
	Reason  string
}

type SpawnSyncResult struct {
	DryRun  bool
	Created int // new spawn points created, or would be on dry run
	Updated int // existing spawn points updated, or would be on dry run
	Skipped []SkippedSpawn
	Errors  []string
}

// spawnCoordKey is the shared coordinate-matching key for a SpawnPoint — extracted so
// CompareSpawns, SyncSpawnPoints, CompareSpawnGroups, and SyncSpawnGroup don't each redefine the
// same closure. See toFloat64's float32 case for why correct handling here specifically matters.
func spawnCoordKey(p SpawnPoint) [3]float64 {
	return [3]float64{toFloat64(p.Fields["x"]), toFloat64(p.Fields["y"]), toFloat64(p.Fields["z"])}
}

// annotatePathgridMissing flags each point's PathgridMissing — mirrors annotateMissingReferences'
// shape for spawn2's own dangling-reference case. Purely a read-only diagnostic: unlike
// spawngroupID, pathgrid is NOT copied verbatim on sync (updateSpawn2/SyncSpawnPoints still only
// copy it when the target grid already exists on the sink, see their own comments) — this reports
// on whatever pathgrid value is already sitting on the row, however it got there.
func annotatePathgridMissing(points []SpawnPoint, gridIds map[int64]bool) {
	for i := range points {
		pg := toInt64(points[i].Fields["pathgrid"])
		points[i].PathgridMissing = pg != 0 && !gridIds[pg]
	}
}

// CompareSpawns diffs spawn2 rows for a zone/version, matched by exact (x,y,z) coordinate —
// spawn2/spawngroup IDs aren't meaningful across databases (see Spawn point identity in
// CLAUDE.md), the same reason per-NPC spawn creation matches by coordinate instead of ID.
// Spawn entries (spawngroup+spawnentry) differences never affect Status directly beyond "modified" —
// they’re surfaced via SpawnEntriesDiffer instead, since spawn entries composition is never auto-synced (see
// SyncSpawnPoints) regardless of whether the row itself is new or modified.
//
// zoneIdNumber (added alongside PathgridMissing) is only needed to check pathgrid against each
// database's own `grid` rows — grid is keyed by zoneid, not zone.short_name, so it can't be
// derived from shortName/version the way everything else here is.
func (a *App) CompareSpawns(shortName string, version int8, zoneIdNumber int64) ([]SpawnDiffRow, error) {
	sourcePoints, err := getSpawnPointsForZone(a.ctx, a.sourceDB, shortName, version)
	if err != nil {
		return nil, err
	}
	sinkPoints, err := getSpawnPointsForZone(a.ctx, a.sinkDB, shortName, version)
	if err != nil {
		return nil, err
	}
	if err := resolveOrphanedSpawnEntryNames(a.ctx, sinkPoints, a.sourceDB); err != nil {
		return nil, err
	}
	if err := resolveOrphanedSpawnEntryNames(a.ctx, sourcePoints, a.sinkDB); err != nil {
		return nil, err
	}

	sourceGridIds, err := fetchZoneGridIds(a.ctx, a.sourceDB, zoneIdNumber)
	if err != nil {
		return nil, err
	}
	sinkGridIds, err := fetchZoneGridIds(a.ctx, a.sinkDB, zoneIdNumber)
	if err != nil {
		return nil, err
	}
	annotatePathgridMissing(sourcePoints, sourceGridIds)
	annotatePathgridMissing(sinkPoints, sinkGridIds)

	sinkByCoord := make(map[[3]float64]SpawnPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkByCoord[spawnCoordKey(p)] = p
	}

	var diff []SpawnDiffRow
	seen := make(map[[3]float64]bool)
	for _, sp := range sourcePoints {
		key := spawnCoordKey(sp)
		sinkPoint, exists := sinkByCoord[key]
		row := SpawnDiffRow{Source: &sp}
		if !exists {
			row.Status = "new"
			diff = append(diff, row)
			continue
		}
		seen[key] = true
		row.Sink = &sinkPoint
		row.FieldsDiffer = !mapsEqual(sp.Fields, sinkPoint.Fields)
		row.SpawnEntriesDiffer = !spawnEntriesEqual(sp.SpawnEntries, sinkPoint.SpawnEntries)
		if !row.FieldsDiffer && !row.SpawnEntriesDiffer {
			row.Status = "match"
		} else {
			row.Status = "modified"
		}
		diff = append(diff, row)
	}
	for _, sk := range sinkPoints {
		if !seen[spawnCoordKey(sk)] {
			diff = append(diff, SpawnDiffRow{Status: "removed", Sink: &sk})
		}
	}

	if err := annotateSpawnGroupCollisionRisk(a.ctx, a.sinkDB, diff); err != nil {
		return nil, err
	}

	return diff, nil
}

// annotateSpawnGroupCollisionRisk flags SpawnDiffRow.SpawnGroupCollisionRisk for every "new" row
// whose source spawngroupID already exists as a real spawngroup row on the sink — see the field's
// own comment for why that's treated as a likely collision, not a coincidence. Batched into one
// existence check regardless of how many "new" rows there are, same shape as existingIds' other
// callers.
func annotateSpawnGroupCollisionRisk(ctx context.Context, sinkDB *sql.DB, diff []SpawnDiffRow) error {
	idSet := make(map[int64]bool)
	for _, row := range diff {
		if row.Status == "new" && row.Source != nil {
			idSet[row.Source.SpawnGroupId] = true
		}
	}
	existing, err := existingIds(ctx, sinkDB, "spawngroup", "id", idSet)
	if err != nil {
		return err
	}
	for i := range diff {
		if diff[i].Status == "new" && diff[i].Source != nil {
			diff[i].SpawnGroupCollisionRisk = existing[diff[i].Source.SpawnGroupId]
		}
	}
	return nil
}

// getSpawnPointsForZone fetches every spawn2 row for a zone/version from one database, along
// with each one's spawngroup settings and full spawnentry roster (NPC names resolved against
// this same database — see resolveOrphanedSpawnEntryNames for the cross-database fallback). Batches
// into exactly 3 queries regardless of how many spawn points the zone has: one for spawn2, one
// for the distinct spawngroups referenced, one for all their spawn entries. N+1-per-spawn-point
// here would repeat the exact mistake already made and fixed once this session for quest-spawn
// detection — a zone can easily have hundreds of spawn2 rows.
func getSpawnPointsForZone(ctx context.Context, db *sql.DB, shortName string, version int8) ([]SpawnPoint, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM spawn2 WHERE zone = ? AND version = ?", shortName, version)
	if err != nil {
		return nil, err
	}
	spawn2Rows, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}
	if len(spawn2Rows) == 0 {
		return nil, nil
	}

	groupIdSet := make(map[int64]bool)
	sharedCount := make(map[int64]int)
	for _, s2 := range spawn2Rows {
		gid := toInt64(s2["spawngroupID"])
		groupIdSet[gid] = true
		sharedCount[gid]++
	}
	groupIds := make([]int64, 0, len(groupIdSet))
	for id := range groupIdSet {
		groupIds = append(groupIds, id)
	}
	placeholders, args := inClausePlaceholders(groupIds)

	sgRows, err := db.QueryContext(ctx, "SELECT * FROM spawngroup WHERE id IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	spawnGroupRows, err := scanDynamicRows(sgRows)
	_ = sgRows.Close()
	if err != nil {
		return nil, err
	}
	spawnGroupFieldsById := make(map[int64]map[string]interface{}, len(spawnGroupRows))
	for _, sg := range spawnGroupRows {
		gid := toInt64(sg["id"])
		fields := make(map[string]interface{}, len(sg))
		for k, v := range sg {
			if k == "id" {
				continue
			}
			fields[k] = v
		}
		spawnGroupFieldsById[gid] = fields
	}

	peRows, err := db.QueryContext(ctx, `
		SELECT se.spawngroupID, se.npcID, se.chance, nt.name AS npc_name
		FROM spawnentry se
		    LEFT JOIN npc_types nt ON nt.id = se.npcID
		WHERE se.spawngroupID IN (`+placeholders+`)
		`, args...)
	if err != nil {
		return nil, err
	}
	spawnEntryDynRows, err := scanDynamicRows(peRows)
	_ = peRows.Close()
	if err != nil {
		return nil, err
	}
	spawnEntriesByGroup := make(map[int64][]SpawnEntry)
	for _, se := range spawnEntryDynRows {
		gid := toInt64(se["spawngroupID"])
		orphaned := se["npc_name"] == nil
		name := ""
		if !orphaned {
			name = fmt.Sprintf("%v", se["npc_name"])
		}
		spawnEntriesByGroup[gid] = append(spawnEntriesByGroup[gid], SpawnEntry{
			NPCID:    toInt64(se["npcID"]),
			NPCName:  name,
			Chance:   toInt64(se["chance"]),
			Orphaned: orphaned,
		})
	}

	points := make([]SpawnPoint, 0, len(spawn2Rows))
	for _, s2 := range spawn2Rows {
		gid := toInt64(s2["spawngroupID"])
		fields := make(map[string]interface{}, len(s2))
		for k, v := range s2 {
			if k == "id" || k == "spawngroupID" {
				continue
			}
			fields[k] = v
		}
		groupFields, groupExists := spawnGroupFieldsById[gid]
		points = append(points, SpawnPoint{
			Id:                  toInt64(s2["id"]),
			SpawnGroupId:        gid,
			SpawnGroupFields:    groupFields,
			SpawnGroupMissing:   !groupExists,
			LocationSharedCount: sharedCount[gid] - 1, // "other" locations, not counting this one
			Fields:              fields,
			SpawnEntries:        spawnEntriesByGroup[gid],
		})
	}
	return points, nil
}

// resolveOrphanedSpawnEntryNames looks up any spawn entry that didn't resolve against the database it
// was fetched from (Orphaned=true) in the OTHER database instead. This is the concrete answer
// to "what did a corrupted spawnentry used to point to": if the NPC was deleted in exactly one
// of the two databases, the other one is still the intact copy, not a guess. If neither database
// can resolve it, NPCName is left empty — genuinely lost, not something to fabricate.
func resolveOrphanedSpawnEntryNames(ctx context.Context, points []SpawnPoint, otherDB *sql.DB) error {
	missingSet := make(map[int64]bool)
	for _, p := range points {
		for _, pe := range p.SpawnEntries {
			if pe.Orphaned {
				missingSet[pe.NPCID] = true
			}
		}
	}
	if len(missingSet) == 0 {
		return nil
	}
	ids := make([]int64, 0, len(missingSet))
	for id := range missingSet {
		ids = append(ids, id)
	}
	placeholders, args := inClausePlaceholders(ids)

	rows, err := otherDB.QueryContext(ctx, "SELECT id, name FROM npc_types WHERE id IN ("+placeholders+")", args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	names := make(map[int64]string)
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return err
		}
		names[id] = name
	}
	if err := rows.Err(); err != nil {
		return err
	}

	for i := range points {
		for j := range points[i].SpawnEntries {
			if points[i].SpawnEntries[j].Orphaned {
				if name, ok := names[points[i].SpawnEntries[j].NPCID]; ok {
					points[i].SpawnEntries[j].NPCName = name
				}
			}
		}
	}
	return nil
}

// spawnEntriesEqual compares two spawn points' spawn entries by (NPCID -> Chance), ignoring order. Safe to key
// by NPCID alone since spawnentry's primary key is (spawngroupID, npcID) — no duplicates within
// one spawngroup's roster.
func spawnEntriesEqual(a, b []SpawnEntry) bool {
	if len(a) != len(b) {
		return false
	}
	chanceByNPC := make(map[int64]int64, len(b))
	for _, pe := range b {
		chanceByNPC[pe.NPCID] = pe.Chance
	}
	for _, pe := range a {
		chance, ok := chanceByNPC[pe.NPCID]
		if !ok || chance != pe.Chance {
			return false
		}
	}
	return true
}

// sinkSpawnPointExists reports whether the sink already has a spawn2 row at this exact
// location in this zone/version — the signal used to detect "this spawn point already
// exists, possibly serving a different NPC now" and skip rather than guess.
func (a *App) sinkSpawnPointExists(shortName string, version int8, x, y, z float64) (int64, error) {
	var id int64
	err := a.sinkDB.QueryRowContext(a.ctx,
		"SELECT id FROM spawn2 WHERE zone = ? AND version = ? AND x = ? AND y = ? AND z = ? LIMIT 1",
		shortName, version, x, y, z,
	).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	return id, nil
}

// updateSpawn2 updates an existing sink spawn2 row's own columns to match source. Never touches
// spawngroupID — spawn entries composition differences are always flagged (see CompareSpawns'
// SpawnEntriesDiffer), never applied by this function, since a spawngroup can be shared by other spawn2
// rows this call knows nothing about. pathgrid was unconditionally excluded until the Grids tab
// shipped (2026-07-19) and made grid.id trustworthy within a zone — now it's copied whenever
// source says "no patrol" (0, always safe) or the grid it references actually exists on the sink
// for this zone (sinkGridIds, see fetchZoneGridIds); otherwise it's left out of the update
// entirely, same as before this check existed, so a still-missing grid doesn't get pointed at a
// patrol path that doesn't exist there.
func updateSpawn2(ctx context.Context, tx *sql.Tx, sinkId int64, sourceFields map[string]interface{}, sinkColumns map[string]bool, sinkGridIds map[int64]bool) error {
	var columns []string
	for col := range sourceFields {
		if col == "pathgrid" {
			continue
		}
		if sinkColumns[col] {
			columns = append(columns, col)
		}
	}
	if sinkColumns["pathgrid"] {
		pathgrid := toInt64(sourceFields["pathgrid"])
		if pathgrid == 0 || sinkGridIds[pathgrid] {
			columns = append(columns, "pathgrid")
		}
	}
	sort.Strings(columns)

	if len(columns) == 0 {
		return nil
	}
	setClauses := make([]string, len(columns))
	values := make([]interface{}, len(columns)+1)
	for i, col := range columns {
		setClauses[i] = col + " = ?"
		values[i] = sourceFields[col]
	}
	values[len(columns)] = sinkId

	query := fmt.Sprintf("UPDATE spawn2 SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	_, err := tx.ExecContext(ctx, query, values...)
	return err
}

// SyncSpawnPoints is the Spawn Points tab's own sync action — deliberately separate from Sync(),
// same reasoning as the TODO tab being its own self-contained concern rather than merged into
// NPC sync: keeps each transaction's blast radius scoped to one kind of change. Same dry-run/
// execute duality as Sync(). "Modified" rows only ever update spawn2's own columns (never
// spawngroupID — see updateSpawn2); "new" rows insert spawn2 verbatim, including its raw
// spawngroupID value copied straight from source. That value has no cross-database meaning (see
// CLAUDE.md's "Spawn point identity" notes) and will almost always be dangling on the sink — this
// is deliberate, not a bug: this tab's job is syncing the spawn2 table, full stop, the same way
// Sync() upserts npc_types regardless of whether other tables it references exist yet. A dangling
// spawngroupID surfaces as SpawnPoint.SpawnGroupMissing (row flag + detail view, not a block) and
// is resolved separately via SyncSpawnGroup, which now creates the missing spawngroup on demand —
// see its own comment for how that closes the loop.
func (a *App) SyncSpawnPoints(options SpawnSyncOptions) (SpawnSyncResult, error) {
	result := SpawnSyncResult{DryRun: options.DryRun}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	sourcePoints, err := getSpawnPointsForZone(a.ctx, a.sourceDB, options.ZoneShortName, options.ZoneVersion)
	if err != nil {
		return result, err
	}
	sinkPoints, err := getSpawnPointsForZone(a.ctx, a.sinkDB, options.ZoneShortName, options.ZoneVersion)
	if err != nil {
		return result, err
	}

	sourceByCoord := make(map[[3]float64]SpawnPoint, len(sourcePoints))
	for _, p := range sourcePoints {
		sourceByCoord[spawnCoordKey(p)] = p
	}
	sinkById := make(map[int64]SpawnPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkById[p.Id] = p
	}

	var spawn2Columns map[string]bool
	var sinkGridIds map[int64]bool
	var tx *sql.Tx
	if !options.DryRun {
		spawn2Columns, err = getSinkColumns(a.ctx, a.sinkDB, "spawn2")
		if err != nil {
			return result, err
		}
		sinkGridIds, err = fetchZoneGridIds(a.ctx, a.sinkDB, options.ZoneIdNumber)
		if err != nil {
			return result, err
		}
		tx, err = a.sinkDB.BeginTx(a.ctx, nil)
		if err != nil {
			return result, err
		}
	}

	for _, sinkId := range options.SpawnIds {
		sinkPoint, ok := sinkById[sinkId]
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf("spawn2 #%d: not found in sink zone data", sinkId))
			continue
		}
		sourcePoint, ok := sourceByCoord[spawnCoordKey(sinkPoint)]
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf("spawn2 #%d: no matching source spawn point at its coordinates", sinkId))
			continue
		}
		if options.DryRun {
			result.Updated++
			continue
		}
		if err := updateSpawn2(a.ctx, tx, sinkId, sourcePoint.Fields, spawn2Columns, sinkGridIds); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("spawn2 #%d: %w", sinkId, err)
		}
		result.Updated++
	}

	// claimed tracks coordinates already committed to being created earlier in this same call —
	// sinkSpawnPointExists() can't see this transaction's own uncommitted writes, and dry runs
	// have no transaction to check at all.
	claimed := make(map[[3]float64]bool)
	for _, coord := range options.NewSpawnCoords {
		sourcePoint, ok := sourceByCoord[coord]
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf(
				"spawn point at (%.2f, %.2f, %.2f): not found in source zone data", coord[0], coord[1], coord[2]))
			continue
		}
		if existingId, err := a.sinkSpawnPointExists(options.ZoneShortName, options.ZoneVersion, coord[0], coord[1], coord[2]); err != nil {
			return result, err
		} else if existingId != 0 {
			result.Skipped = append(result.Skipped, SkippedSpawn{
				X: coord[0], Y: coord[1], Z: coord[2],
				Reason: fmt.Sprintf("matches existing sink spawn2 #%d — needs manual reconciliation", existingId),
			})
			continue
		}
		if claimed[coord] {
			result.Skipped = append(result.Skipped, SkippedSpawn{
				X: coord[0], Y: coord[1], Z: coord[2], Reason: "already being created elsewhere in this same sync",
			})
			continue
		}
		claimed[coord] = true
		if options.DryRun {
			result.Created++
			continue
		}
		// pathgrid copies verbatim only when it's safe to: source says "no patrol" (0, always
		// safe), or the grid it references actually exists on the sink for this zone (checked via
		// sinkGridIds) — otherwise falls back to 0, same treatment updateSpawn2 already gives it.
		// spawngroupID, unlike pathgrid, is copied verbatim unconditionally — see the function
		// comment above for why a dangling value here is the intended behavior, not an oversight.
		pathgrid := int64(0)
		if pg := toInt64(sourcePoint.Fields["pathgrid"]); pg != 0 && sinkGridIds[pg] {
			pathgrid = pg
		}
		if _, err := insertRow(a.ctx, tx, "spawn2", sourcePoint.Fields, spawn2Columns, map[string]interface{}{
			"spawngroupID": sourcePoint.SpawnGroupId,
			"zone":         options.ZoneShortName,
			"version":      options.ZoneVersion,
			"pathgrid":     pathgrid,
		}); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("spawn point at (%.2f, %.2f, %.2f): %w", coord[0], coord[1], coord[2], err)
		}
		result.Created++
	}

	if !options.DryRun {
		if err := tx.Commit(); err != nil {
			return result, err
		}
	}

	return result, nil
}
