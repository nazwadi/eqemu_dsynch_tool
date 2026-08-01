package main

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

// referenceContentTarget describes one shared reference table this primitive can overwrite the
// CONTENT of — the complement to idalign.go's idAlignmentTarget, which only ever renames a row's
// id and never touches its fields. See CLAUDE.md's "Shared reference table sync, phase 2" for the
// design (why this is standalone from the NPC sync flow, and why the safety gate is a usage-count
// warning rather than a block).
type referenceContentTarget struct {
	headerTable    string // "" if there's no separate header row (merchantlist has none)
	childTable     string // npc_faction_entries / npc_spells_entries / merchantlist / loottable_entries
	childParentCol string // FK column in childTable equal to the anchoring id on this side
	npcFKColumn    string // column on npc_types referencing this same id — the usage-count query
}

// referenceContentTargets is the fixed set of tables this primitive knows how to sync content for.
// spawngroup has its own dedicated SyncSpawnGroup (zone-scoped usage block, not a warning) and
// isn't a candidate here; lootdrop is deliberately excluded too — it already has AlignId/
// CreateLootDrop for its own content, and loottable's own entry here only ever copies lootdrop_id
// references verbatim, never lootdrop content itself (see SyncReferenceContent's own comment).
var referenceContentTargets = map[string]referenceContentTarget{
	"npc_faction":        {"npc_faction", "npc_faction_entries", "npc_faction_id", "npc_faction_id"},
	"npc_spells":         {"npc_spells", "npc_spells_entries", "npc_spells_id", "npc_spells_id"},
	"merchantlist":       {"", "merchantlist", "merchantid", "merchant_id"},
	"loottable":          {"loottable", "loottable_entries", "loottable_id", "loottable_id"},
	"npc_spells_effects": {"npc_spells_effects", "npc_spells_effects_entries", "npc_spells_effects_id", "npc_spells_effects_id"},
}

type SyncReferenceContentOptions struct {
	Target   string // key into referenceContentTargets
	SourceId int64  // source's own id for this content — content is read from here
	SinkId   int64  // sink's own id — stays the same; only its CONTENT is overwritten, never renamed
	DryRun   bool
}

type SyncReferenceContentResult struct {
	DryRun        bool
	SinkId        int64
	UsageCount    int  // OTHER NPCs on the sink referencing SinkId via npcFKColumn — warning only, never blocks
	EntriesBefore int  // sink's current child-row count at SinkId
	EntriesAfter  int  // source's child-row count at SourceId — what EntriesBefore becomes
	HeaderChanged bool // whether the header row's own fields differ (always false when there's no header table)
}

// SyncReferenceContent overwrites a shared reference row's CONTENT on the sink to match source —
// the complement to AlignId, which only ever renames a row's id and leaves its content untouched.
// SinkId is never renumbered here; only what's stored under it changes. Standalone from the NPC
// sync flow (triggered from the comparison drawers/Loot tab directly), since a shared row can be
// referenced by many NPCs at once — UsageCount surfaces that before the write, same "flag, don't
// block" philosophy as SpawnGroupCollisionRisk/OtherZoneUsage elsewhere in this app.
//
// loottable's entries carry lootdrop_id verbatim from source — lootdrop.id is a local surrogate,
// not portable, so this only produces useful content once the referenced lootdrop ids already
// match between source and sink (via AlignId/CreateLootDrop). Not enforced here; the frontend
// confirm modal states it plainly, same as CreateLootDrop's own "won't wire up loottable_entries"
// caveat elsewhere.
func (a *App) SyncReferenceContent(options SyncReferenceContentOptions) (SyncReferenceContentResult, error) {
	result := SyncReferenceContentResult{DryRun: options.DryRun, SinkId: options.SinkId}

	target, ok := referenceContentTargets[options.Target]
	if !ok {
		return result, fmt.Errorf("unknown reference content target %q", options.Target)
	}
	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}
	if options.SourceId == 0 {
		return result, fmt.Errorf("no source %s id to sync content from", options.Target)
	}
	if options.SinkId == 0 {
		return result, fmt.Errorf("no sink %s id to sync content into", options.Target)
	}

	var usageCount int
	if err := a.sinkDB.QueryRowContext(a.ctx,
		fmt.Sprintf("SELECT COUNT(*) FROM npc_types WHERE %s = ?", target.npcFKColumn), options.SinkId,
	).Scan(&usageCount); err != nil {
		return result, err
	}
	result.UsageCount = usageCount

	var sourceHeader map[string]interface{}
	var sinkHeaderExists bool
	if target.headerTable != "" {
		fields, err := fetchRowById(a.ctx, a.sourceDB, target.headerTable, options.SourceId)
		if err != nil {
			return result, err
		}
		if fields == nil {
			return result, fmt.Errorf("no source %s #%d exists", target.headerTable, options.SourceId)
		}
		sourceHeader = fields

		sinkFields, err := fetchRowById(a.ctx, a.sinkDB, target.headerTable, options.SinkId)
		if err != nil {
			return result, err
		}
		sinkHeaderExists = sinkFields != nil
		result.HeaderChanged = !sinkHeaderExists || !mapsEqual(withoutFields(sourceHeader, "id"), withoutFields(sinkFields, "id"))
	}

	sourceEntries, err := fetchChildRows(a.ctx, a.sourceDB, target.childTable, target.childParentCol, options.SourceId)
	if err != nil {
		return result, err
	}
	result.EntriesAfter = len(sourceEntries)

	sinkEntries, err := fetchChildRows(a.ctx, a.sinkDB, target.childTable, target.childParentCol, options.SinkId)
	if err != nil {
		return result, err
	}
	result.EntriesBefore = len(sinkEntries)

	if options.DryRun {
		return result, nil
	}

	tx, err := a.sinkDB.BeginTx(a.ctx, nil)
	if err != nil {
		return result, err
	}

	if target.headerTable != "" {
		headerColumns, err := getSinkColumns(a.ctx, tx, target.headerTable)
		if err != nil {
			_ = tx.Rollback()
			return result, err
		}
		if sinkHeaderExists {
			if err := updateRowById(a.ctx, tx, target.headerTable, options.SinkId, sourceHeader, headerColumns); err != nil {
				_ = tx.Rollback()
				return result, fmt.Errorf("updating %s #%d: %w", target.headerTable, options.SinkId, err)
			}
		} else if _, err := insertRow(a.ctx, tx, target.headerTable, sourceHeader, headerColumns, map[string]interface{}{
			"id": options.SinkId,
		}); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("creating %s #%d: %w", target.headerTable, options.SinkId, err)
		}
	}

	if _, err := tx.ExecContext(a.ctx,
		fmt.Sprintf("DELETE FROM %s WHERE %s = ?", target.childTable, target.childParentCol), options.SinkId,
	); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("clearing existing %s rows for #%d: %w", target.childTable, options.SinkId, err)
	}

	childColumns, err := getSinkColumns(a.ctx, tx, target.childTable)
	if err != nil {
		_ = tx.Rollback()
		return result, err
	}
	for _, entry := range sourceEntries {
		// "id" stripped unconditionally (some child tables, e.g. npc_spells_entries, have their
		// own surrogate id column; others don't, where this is a no-op) — same discipline
		// idalign.go's copyChildRows already uses. childParentCol is supplied via overrides,
		// pointing at SinkId; every other column (faction_id/spellid/item/lootdrop_id, value
		// columns, etc.) is real content and travels through untouched.
		fields := withoutFields(entry, "id", target.childParentCol)
		if _, err := insertRow(a.ctx, tx, target.childTable, fields, childColumns, map[string]interface{}{
			target.childParentCol: options.SinkId,
		}); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("inserting %s row for #%d: %w", target.childTable, options.SinkId, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return result, err
	}
	return result, nil
}

// updateRowById updates an existing row's own columns (minus id) to fields' values — mirrors
// updateSpawnGroupFields'/updateSpawn2's sorted-columns UPDATE-building shape, generalized since
// this call site has no column exclusions (unlike those two, which each exclude a specific
// cosmetic/dangling column for their own domain reasons).
func updateRowById(ctx context.Context, tx *sql.Tx, table string, id int64, fields map[string]interface{}, sinkColumns map[string]bool) error {
	var columns []string
	for col := range fields {
		if col == "id" {
			continue
		}
		if sinkColumns[col] {
			columns = append(columns, col)
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
		values[i] = fields[col]
	}
	values[len(columns)] = id

	query := fmt.Sprintf("UPDATE %s SET %s WHERE id = ?", table, strings.Join(setClauses, ", "))
	_, err := tx.ExecContext(ctx, query, values...)
	return err
}
