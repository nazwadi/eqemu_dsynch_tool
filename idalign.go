package main

import (
	"context"
	"database/sql"
	"fmt"
)

// idAlignmentTarget describes one local-surrogate-ID table this primitive can operate on: its own
// child-entries table (fully owned content, moved wholesale with the row when relocating a
// squatter) and every external table/column that merely references the id (repointed in place,
// content untouched). See CLAUDE.md's "ID alignment" section for the concept and why this is a
// rename-and-relocate operation, not a content overwrite like RelocateSpawnGroup.
type idAlignmentTarget struct {
	table          string  // e.g. "lootdrop"
	childTable     string  // e.g. "lootdrop_entries" — this row's own content
	childParentCol string  // e.g. "lootdrop_id" — the FK column in childTable pointing back at table.id
	externalRefs   []fkRef // other tables/columns referencing table.id, e.g. loottable_entries.lootdrop_id
}

type fkRef struct{ table, column string }

// idAlignmentTargets is the fixed set of tables this primitive knows how to align. spawngroup is
// deliberately NOT here — it keeps its own dedicated RelocateSpawnGroup, which has a zone-scoped
// carve-out these four targets have no equivalent for (see idalign.go's own design note in
// CLAUDE.md for why unconditional repoint is correct here, not just simpler).
var idAlignmentTargets = map[string]idAlignmentTarget{
	"lootdrop":    {"lootdrop", "lootdrop_entries", "lootdrop_id", []fkRef{{"loottable_entries", "lootdrop_id"}}},
	"loottable":   {"loottable", "loottable_entries", "loottable_id", []fkRef{{"npc_types", "loottable_id"}}},
	"npc_faction": {"npc_faction", "npc_faction_entries", "npc_faction_id", []fkRef{{"npc_types", "npc_faction_id"}}},
	"npc_spells":  {"npc_spells", "npc_spells_entries", "npc_spells_id", []fkRef{{"npc_types", "npc_spells_id"}}},
}

type AlignIdOptions struct {
	Target   string // key into idAlignmentTargets
	SourceId int64  // sink's row will be renumbered to this
	SinkId   int64  // sink's current id for the same logical content, being renamed away from
	DryRun   bool
}

type AlignIdResult struct {
	DryRun                 bool
	RenamedFrom, RenamedTo int64
	SquatterSummary        string // best-effort label ("name" field if the target row has one, else "record #N") — "" if SourceId was free, nothing evicted
	SquatterEvicted        bool
	NewSquatterId          int64 // where the squatter ends up — 0 on dry run or if no squatter
	ReferencesRepointed    int   // rows across childTable + externalRefs currently pointing at SinkId that will move to SourceId
}

// AlignId renumbers a sink row's local surrogate ID (SinkId) to match source's id for the same
// logical content (SourceId), preserving the sink row's own current field content untouched —
// only its identity changes, plus every reference to it. If SourceId is already occupied by
// unrelated content on the sink (a squatter), that squatter is relocated to a fresh id first so
// the rename can proceed cleanly, reusing the same eviction shape RelocateSpawnGroup pioneered.
//
// Deliberately does not create content that doesn't exist on the sink under any id yet
// (SinkId == 0 is rejected) — this is a rename of an existing row, not a sync/create action.
func (a *App) AlignId(options AlignIdOptions) (AlignIdResult, error) {
	result := AlignIdResult{DryRun: options.DryRun, RenamedFrom: options.SinkId, RenamedTo: options.SourceId}

	target, ok := idAlignmentTargets[options.Target]
	if !ok {
		return result, fmt.Errorf("unknown ID alignment target %q", options.Target)
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}
	if options.SourceId == options.SinkId {
		return result, fmt.Errorf("source and sink %s ids already match (#%d) — nothing to align", options.Target, options.SourceId)
	}
	if options.SinkId == 0 {
		return result, fmt.Errorf("no sink %s id given to rename from", options.Target)
	}

	sinkRow, err := fetchRowById(a.ctx, a.sinkDB, target.table, options.SinkId)
	if err != nil {
		return result, err
	}
	if sinkRow == nil {
		return result, fmt.Errorf("no %s #%d exists on the sink to align", options.Target, options.SinkId)
	}

	squatterFields, err := fetchRowById(a.ctx, a.sinkDB, target.table, options.SourceId)
	if err != nil {
		return result, err
	}
	if squatterFields != nil {
		result.SquatterEvicted = true
		if name, ok := squatterFields["name"]; ok && fmt.Sprintf("%v", name) != "" {
			result.SquatterSummary = fmt.Sprintf("%v", name)
		} else {
			result.SquatterSummary = fmt.Sprintf("record #%d", options.SourceId)
		}
	}

	refCount, err := countReferences(a.ctx, a.sinkDB, target, options.SinkId)
	if err != nil {
		return result, err
	}
	result.ReferencesRepointed = refCount

	if options.DryRun {
		return result, nil
	}

	sinkColumns, err := getSinkColumns(a.ctx, a.sinkDB, target.table)
	if err != nil {
		return result, err
	}

	tx, err := a.sinkDB.BeginTx(a.ctx, nil)
	if err != nil {
		return result, err
	}

	if squatterFields != nil {
		newId, err := relocateRow(a.ctx, tx, target, options.SourceId, squatterFields, sinkColumns)
		if err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("relocating squatter %s #%d: %w", options.Target, options.SourceId, err)
		}
		result.NewSquatterId = newId
	}

	// SourceId is free now — rename the sink's existing row onto it directly, preserving its own
	// field content untouched.
	if _, err := tx.ExecContext(a.ctx,
		fmt.Sprintf("UPDATE %s SET id = ? WHERE id = ?", target.table),
		options.SourceId, options.SinkId,
	); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("renaming %s #%d to #%d: %w", options.Target, options.SinkId, options.SourceId, err)
	}

	if err := repointReferences(a.ctx, tx, target, options.SinkId, options.SourceId); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("repointing references from #%d to #%d: %w", options.SinkId, options.SourceId, err)
	}

	if err := tx.Commit(); err != nil {
		return result, err
	}
	return result, nil
}

// countReferences counts, across target's childTable and every externalRef, how many rows
// currently reference id — the dry-run preview's ReferencesRepointed figure.
func countReferences(ctx context.Context, db *sql.DB, target idAlignmentTarget, id int64) (int, error) {
	total := 0
	tables := append([]fkRef{{target.childTable, target.childParentCol}}, target.externalRefs...)
	for _, ref := range tables {
		var count int
		err := db.QueryRowContext(ctx,
			fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s = ?", ref.table, ref.column), id,
		).Scan(&count)
		if err != nil {
			return 0, err
		}
		total += count
	}
	return total, nil
}

// relocateRow moves the row currently at oldId in target.table to a freshly-assigned id — copies
// its own fields, copies its own child rows (fetchChildRows + insertRow, "id" stripped
// unconditionally since some child tables have their own surrogate id column and some don't —
// see fetchChildRows' comment), repoints every externalRef from oldId to the new id, then deletes
// the now-vacated old row and its children. Returns the new id.
func relocateRow(ctx context.Context, tx *sql.Tx, target idAlignmentTarget, oldId int64, fields map[string]interface{}, sinkColumns map[string]bool) (int64, error) {
	newId, err := insertRow(ctx, tx, target.table, fields, sinkColumns, nil)
	if err != nil {
		return 0, err
	}

	if err := copyChildRows(ctx, tx, target, oldId, newId, sinkColumns); err != nil {
		return 0, err
	}

	for _, ref := range target.externalRefs {
		if _, err := tx.ExecContext(ctx,
			fmt.Sprintf("UPDATE %s SET %s = ? WHERE %s = ?", ref.table, ref.column, ref.column),
			newId, oldId,
		); err != nil {
			return 0, err
		}
	}

	if _, err := tx.ExecContext(ctx, fmt.Sprintf("DELETE FROM %s WHERE %s = ?", target.childTable, target.childParentCol), oldId); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("DELETE FROM %s WHERE id = ?", target.table), oldId); err != nil {
		return 0, err
	}

	return newId, nil
}

// copyChildRows copies every childTable row referencing oldId to reference newId instead, as
// fresh inserted rows (not an UPDATE) — the parent row itself is being recreated at a new id, so
// its children need to exist there too, independent of whatever row ends up occupying oldId next.
func copyChildRows(ctx context.Context, tx *sql.Tx, target idAlignmentTarget, oldId, newId int64, sinkColumns map[string]bool) error {
	children, err := fetchChildRows(ctx, tx, target.childTable, target.childParentCol, oldId)
	if err != nil {
		return err
	}
	childColumns, err := getSinkColumns(ctx, tx, target.childTable)
	if err != nil {
		return err
	}
	for _, child := range children {
		// "id" stripped unconditionally — some of these child tables (npc_spells_entries,
		// confirmed) have their own surrogate id column, which would collide on reinsert if left
		// in; others don't, where this is simply a no-op. childParentCol is stripped too since
		// it's supplied via overrides below, pointing at the new parent id.
		fields := withoutFields(child, "id", target.childParentCol)
		if _, err := insertRow(ctx, tx, target.childTable, fields, childColumns, map[string]interface{}{
			target.childParentCol: newId,
		}); err != nil {
			return err
		}
	}
	return nil
}

// repointReferences updates target's childTable and every externalRef so rows currently
// referencing oldId reference newId instead — the sink row's own content is untouched, only the
// numeric id it's filed under changes, so a plain UPDATE (not delete-and-reinsert) is correct and
// preserves every referencing row's own real content exactly.
func repointReferences(ctx context.Context, tx *sql.Tx, target idAlignmentTarget, oldId, newId int64) error {
	refs := append([]fkRef{{target.childTable, target.childParentCol}}, target.externalRefs...)
	for _, ref := range refs {
		if _, err := tx.ExecContext(ctx,
			fmt.Sprintf("UPDATE %s SET %s = ? WHERE %s = ?", ref.table, ref.column, ref.column),
			newId, oldId,
		); err != nil {
			return err
		}
	}
	return nil
}
