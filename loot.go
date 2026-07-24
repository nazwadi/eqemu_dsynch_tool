package main

import (
	"context"
	"database/sql"
	"fmt"
)

// LootDropEntry is one item within a lootdrop — the leaf level, keyed by the portable item_id
// (items.id has no AUTO_INCREMENT, same trust tier as faction_id/spellid).
type LootDropEntry struct {
	ItemID   int64
	ItemName string
	Fields   map[string]interface{} // lootdrop_entries columns, minus lootdrop_id/item_id
}

// LootDrop is one lootdrop_id's own fields plus its full item list. lootdrop.id is a local
// surrogate (AUTO_INCREMENT, confirmed via SHOW CREATE TABLE on both databases) — same
// untrustworthy-across-databases category as spawngroup.id, shown for reference only, never
// matched against the other database's lootdrop.id.
type LootDrop struct {
	Id          int64
	Fields      map[string]interface{} // lootdrop columns, minus id
	SharedCount int                    // OTHER loottables in this same database referencing this lootdrop_id, not counting the one currently being viewed — mirrors SpawnPoint.LocationSharedCount's "shared ×N" signal
	Entries     []LootDropEntry
}

// LootTableEntry is one loottable_entries row: a reference to one LootDrop plus this loottable's
// own weighting for it (multiplier/droplimit/mindrop/probability).
type LootTableEntry struct {
	LootDropId int64
	Fields     map[string]interface{} // loottable_entries columns, minus loottable_id/lootdrop_id
	Drop       *LootDrop              // nil if lootdrop_id doesn't resolve to a real lootdrop row (orphaned reference, same "recover from the other side" gap as spawn2 spawn entries — not attempted yet, just shown as missing)
}

// LootTable is one loottable_id's own fields plus its full ordered entries. loottable.id is also
// a local surrogate, same reasoning as LootDrop.
type LootTable struct {
	Id      int64
	Fields  map[string]interface{} // loottable columns, minus id
	Entries []LootTableEntry
}

// NPCLootComparison is the read-only source-vs-sink view behind the Loot tab. Anchored either by
// an NPC (npc_types.id is portable, so it resolves each side's own loottable_id independently —
// same pattern as NPCFactionComparison/NPCSpellsComparison/NPCMerchantComparison) or by a raw
// loottable_id typed directly for one side via GetLootTable.
//
// Deliberately does NOT try to pair SourceTable's and SinkTable's LootDrops against each other:
// unlike spawngroup (which at least has spawn2 coordinates as an anchor), lootdrop has nothing
// linking it across databases — no coordinates, and lootdrop.name is exactly as unreliable as
// spawngroup.name was (cosmetic, locally auto-generated, no shared naming discipline between two
// independently-evolved databases). So this renders two independent trees side by side rather
// than claiming a lootdrop-level correspondence it can't actually verify — the same restraint
// already applied to alt_currency (dropped rather than guessed) and ambiguous spawngroup matches
// (flagged, not resolved). Matching lootdrops by comparing their full item-set content is a
// possible future improvement, deliberately not attempted in this first pass.
type NPCLootComparison struct {
	SourceId    int64 // this NPC's loottable_id on source; 0 if it has no loot table there
	SinkId      int64
	SourceTable *LootTable // nil if SourceId == 0 or doesn't resolve to a real loottable row
	SinkTable   *LootTable
}

// fetchLootTableHeader fetches one loottable row's own fields (minus id), or nil if that id
// doesn't exist — same shape as fetchNPCFactionHeader/fetchNPCSpellsHeader.
func fetchLootTableHeader(ctx context.Context, db *sql.DB, id int64) (map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM loottable WHERE id = ?", id)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}
	if len(result) == 0 {
		return nil, nil
	}
	delete(result[0], "id")
	return result[0], nil
}

// lootDropSharedCounts returns, for each id in dropIds, how many loottable_entries rows
// reference it in this database — i.e. how many loottables (including the caller's own) use this
// lootdrop. loottable_entries' primary key is (loottable_id, lootdrop_id), so a plain COUNT(*) is
// already a count of distinct loottables, no DISTINCT needed.
func lootDropSharedCounts(ctx context.Context, db *sql.DB, dropIds []int64) (map[int64]int, error) {
	counts := make(map[int64]int, len(dropIds))
	if len(dropIds) == 0 {
		return counts, nil
	}
	placeholders, args := inClausePlaceholders(dropIds)
	rows, err := db.QueryContext(ctx,
		"SELECT lootdrop_id, COUNT(*) FROM loottable_entries WHERE lootdrop_id IN ("+placeholders+") GROUP BY lootdrop_id",
		args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var count int
		if err := rows.Scan(&id, &count); err != nil {
			return nil, err
		}
		counts[id] = count
	}
	return counts, rows.Err()
}

// fetchLootDrops batch-fetches every lootdrop in dropIds — headers, their lootdrop_entries,
// resolved item names, and each drop's SharedCount — in 4 queries total regardless of how many
// drops or items are involved, mirroring getSpawnPointsForZone's batching shape. A dropId with
// lootdrop_entries rows but no header row (a dangling lootdrop_id — nothing enforces referential
// integrity here) still gets a LootDrop entry, just with nil Fields, rather than silently losing
// those entries. dropIds always comes from the caller's own loottable_entries (see
// fetchLootTable), so every count from lootDropSharedCounts is guaranteed >= 1 — the caller's own
// reference — before subtracting 1 to get "OTHER loottables"; no need to pass the caller's own
// loottable id in just to exclude it.
func fetchLootDrops(ctx context.Context, db *sql.DB, dropIds []int64) (map[int64]*LootDrop, error) {
	drops := make(map[int64]*LootDrop, len(dropIds))
	if len(dropIds) == 0 {
		return drops, nil
	}
	placeholders, args := inClausePlaceholders(dropIds)

	headerRows, err := db.QueryContext(ctx, "SELECT * FROM lootdrop WHERE id IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	headers, err := scanDynamicRows(headerRows)
	_ = headerRows.Close()
	if err != nil {
		return nil, err
	}
	for _, h := range headers {
		id := toInt64(h["id"])
		drops[id] = &LootDrop{Id: id, Fields: withoutFields(h, "id")}
	}

	sharedCounts, err := lootDropSharedCounts(ctx, db, dropIds)
	if err != nil {
		return nil, err
	}
	getDrop := func(dropId int64) *LootDrop {
		drop, ok := drops[dropId]
		if !ok {
			drop = &LootDrop{Id: dropId}
			drops[dropId] = drop
		}
		return drop
	}
	for dropId, count := range sharedCounts {
		shared := count - 1 // exclude the caller's own loottable — see the function comment
		if shared < 0 {
			shared = 0
		}
		getDrop(dropId).SharedCount = shared
	}

	entryRows, err := db.QueryContext(ctx, "SELECT * FROM lootdrop_entries WHERE lootdrop_id IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	entries, err := scanDynamicRows(entryRows)
	_ = entryRows.Close()
	if err != nil {
		return nil, err
	}
	names, err := resolveItemNames(ctx, db, entries, "item_id")
	if err != nil {
		return nil, err
	}
	for _, e := range entries {
		dropId := toInt64(e["lootdrop_id"])
		drop := getDrop(dropId)
		itemId := toInt64(e["item_id"])
		drop.Entries = append(drop.Entries, LootDropEntry{
			ItemID:   itemId,
			ItemName: names[itemId],
			Fields:   withoutFields(e, "lootdrop_id", "item_id"),
		})
	}
	return drops, nil
}

// fetchLootTable fetches one loottable_id's full tree — header fields, loottable_entries, and
// each entry's full lootdrop (header + items) — from one database, in a fixed number of queries
// regardless of tree size. Returns nil if the id doesn't resolve to a real loottable row.
func fetchLootTable(ctx context.Context, db *sql.DB, id int64) (*LootTable, error) {
	fields, err := fetchLootTableHeader(ctx, db, id)
	if err != nil {
		return nil, err
	}
	if fields == nil {
		return nil, nil
	}

	rows, err := db.QueryContext(ctx, "SELECT * FROM loottable_entries WHERE loottable_id = ?", id)
	if err != nil {
		return nil, err
	}
	entryRows, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}

	dropIdSet := make(map[int64]bool, len(entryRows))
	for _, e := range entryRows {
		dropIdSet[toInt64(e["lootdrop_id"])] = true
	}
	dropIds := make([]int64, 0, len(dropIdSet))
	for dropId := range dropIdSet {
		dropIds = append(dropIds, dropId)
	}
	drops, err := fetchLootDrops(ctx, db, dropIds)
	if err != nil {
		return nil, err
	}

	table := &LootTable{Id: id, Fields: fields}
	for _, e := range entryRows {
		dropId := toInt64(e["lootdrop_id"])
		table.Entries = append(table.Entries, LootTableEntry{
			LootDropId: dropId,
			Fields:     withoutFields(e, "loottable_id", "lootdrop_id"),
			Drop:       drops[dropId], // nil if dropId doesn't resolve — see fetchLootDrops
		})
	}
	return table, nil
}

// CompareNPCLoot fetches the loot table tree a specific NPC links to on each side, by that side's
// own raw loottable_id — same anchor-via-NPC reasoning as CompareNPCFaction/CompareNPCSpells/
// CompareNPCMerchant. See NPCLootComparison for why the two trees are never paired against each
// other.
func (a *App) CompareNPCLoot(sourceLoottableId, sinkLoottableId int64) (NPCLootComparison, error) {
	result := NPCLootComparison{SourceId: sourceLoottableId, SinkId: sinkLoottableId}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	if sourceLoottableId != 0 {
		table, err := fetchLootTable(a.ctx, a.sourceDB, sourceLoottableId)
		if err != nil {
			return result, err
		}
		result.SourceTable = table
	}
	if sinkLoottableId != 0 {
		table, err := fetchLootTable(a.ctx, a.sinkDB, sinkLoottableId)
		if err != nil {
			return result, err
		}
		result.SinkTable = table
	}

	return result, nil
}

// GetLootTable is the raw-ID lookup path for the Loot tab's "search by loot table ID" mode — a
// one-sided tree view, since loottable_id isn't portable across databases (see NPCLootComparison)
// and a typed-in id only means something on the database it was typed against.
func (a *App) GetLootTable(isSource bool, loottableId int64) (*LootTable, error) {
	db := a.sourceDB
	if !isSource {
		db = a.sinkDB
	}
	if db == nil {
		if isSource {
			return nil, fmt.Errorf("source database not connected")
		}
		return nil, fmt.Errorf("sink database not connected")
	}
	return fetchLootTable(a.ctx, db, loottableId)
}
