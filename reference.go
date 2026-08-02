package main

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
)

// NPCFactionEntryDiff is one faction_id row from npc_faction_entries, merged across source and
// sink by faction_id — the portable, shared-content identity (faction_list.id has no
// AUTO_INCREMENT, confirmed via SHOW CREATE TABLE — same category of trust as npc_types.id, not a
// locally-generated surrogate like npc_faction.id itself). SourceExists/SinkExists distinguish "no
// entry for this faction at all" from "an entry that happens to be all zeros."
type NPCFactionEntryDiff struct {
	FactionID      int64
	FactionName    string
	SourceExists   bool
	SourceValue    int64
	SourceNPCValue int64
	SourceTemp     int64
	SinkExists     bool
	SinkValue      int64
	SinkNPCValue   int64
	SinkTemp       int64
	Differs        bool
}

// NPCFactionComparison is the read-only source-vs-sink view behind the References section's
// "npc_faction_id" reference — the first of what should eventually cover every FK type
// buildTODOItems() already flags (see "What gets queued as TODO" in CLAUDE.md). Deliberately its
// own concrete type, not a generic "reference comparison" shape shared across all of them: each
// FK's target is a genuinely different structure under the hood (loot's two-level
// loottable→lootdrop nesting alone rules out one shared shape), so forcing them together now would
// mean guessing at unconfirmed schema instead of reusing verified structure. What IS shared across
// future reference types is the trigger mechanism and drawer chrome on the frontend, not this type.
type NPCFactionComparison struct {
	SourceId     int64 // this NPC's npc_faction_id on source; 0 if it has no faction link there
	SinkId       int64
	SourceFields map[string]interface{} // npc_faction header row, minus id — nil if SourceId == 0
	SinkFields   map[string]interface{}
	Entries      []NPCFactionEntryDiff
}

// NPCSpellsEntryDiff is one spellid row from npc_spells_entries, merged across source and sink by
// spellid — portable shared content from spells_new (spells_new.id has no AUTO_INCREMENT,
// confirmed via SHOW CREATE TABLE, same trust category as faction_id/npc_types.id). Unlike
// NPCFactionEntryDiff, entry fields are a dynamic map rather than hardcoded struct fields:
// npc_spells_entries has 16 columns (several with real type drift between source and sink already
// found — see EQEmu Schema Notes) and no single "the important column" the way faction's
// value/npc_value/temp are, so this follows spawn2's Behavior-section approach instead —
// drift-tolerant, not a rigid allowlist.
type NPCSpellsEntryDiff struct {
	SpellID      int64
	SpellName    string
	SourceExists bool
	SourceFields map[string]interface{} // npc_spells_entries columns, minus id/npc_spells_id/spellid
	SinkExists   bool
	SinkFields   map[string]interface{}
	Differs      bool
}

// NPCSpellsComparison is the read-only source-vs-sink view behind the References section's
// "npc_spells_id" reference — see NPCFactionComparison for why each reference type gets its own
// concrete type instead of a shared generic shape. SourceFields/SinkFields include parent_list —
// deliberately shown as a plain field, not resolved or walked: an NPC's spell list can chain to a
// parent (sometimes a generic per-class default, sometimes raid-specific), and auto-following that
// risks pulling in spells that aren't really this encounter's own. Seeing the parent_list value is
// enough to know there's more to look at, without this tool guessing how far to follow it.
type NPCSpellsComparison struct {
	SourceId     int64
	SinkId       int64
	SourceFields map[string]interface{} // npc_spells header row, minus id
	SinkFields   map[string]interface{}
	Entries      []NPCSpellsEntryDiff
}

// NPCMerchantEntryDiff is one item row from merchantlist, merged across source and sink by item —
// portable shared content from items (items.id has no AUTO_INCREMENT, confirmed via SHOW CREATE
// TABLE, same trust category as faction_id/spellid). Not slot: merchantlist's primary key is
// (merchantid, slot), but its UNIQUE KEY is (merchantid, item) — the database itself treats item
// as "this merchant can't sell the same item twice," the real identity, while slot reads more like
// a display-order value. slot stays as an ordinary comparable field within SourceFields/SinkFields
// rather than becoming the merge key.
type NPCMerchantEntryDiff struct {
	ItemID       int64
	ItemName     string
	SourceExists bool
	SourceFields map[string]interface{} // merchantlist columns, minus merchantid/item
	SinkExists   bool
	SinkFields   map[string]interface{}
	Differs      bool
}

// NPCMerchantComparison is the read-only source-vs-sink view behind the References section's
// "merchant_id" reference. Unlike npc_faction/npc_spells, merchantlist has no separate header/
// parent row — npc_types.merchant_id points straight at merchantlist rows (by merchantlist's own
// "merchantid" column — the two tables spell it differently, confirmed via SHOW COLUMNS on both),
// so there's no "profile" to fetch, just each side's rows by merchantid, diffed directly.
type NPCMerchantComparison struct {
	SourceId int64 // this NPC's merchant_id on source; 0 if it has no merchant link there
	SinkId   int64
	Entries  []NPCMerchantEntryDiff
}

// CompareNPCFaction fetches the npc_faction header + npc_faction_entries a specific NPC links to
// on each side, by that side's own raw npc_faction_id — not matched by ID the way spawngroup is,
// because there's nothing to match: the NPC itself (already resolved via the portable npc_types.id
// this whole app is built on) is the anchor, so each side's linked row is simply "whatever that
// side currently has," fetched independently and diffed by content. Entries are merged by
// faction_id, which — unlike npc_faction_id itself — is portable shared content (see
// NPCFactionEntryDiff), the same SpawnEntry-style merge-by-portable-id shape already used for
// spawnentry (merged by npcID).
func (a *App) CompareNPCFaction(sourceFactionId, sinkFactionId int64) (NPCFactionComparison, error) {
	result := NPCFactionComparison{SourceId: sourceFactionId, SinkId: sinkFactionId}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	// Each side's header+entries+name-resolution pipeline runs concurrently — same latency
	// reasoning as the Compare* zone-diff functions, see runParallel's own comment.
	var sourceFields, sinkFields map[string]interface{}
	var sourceEntries, sinkEntries []map[string]interface{}
	var sourceNames, sinkNames map[int64]string
	err := runParallel(
		func() error {
			if sourceFactionId == 0 {
				return nil
			}
			fields, err := fetchNPCFactionHeader(a.ctx, a.sourceDB, sourceFactionId)
			if err != nil {
				return err
			}
			sourceFields = fields
			entries, err := fetchNPCFactionEntries(a.ctx, a.sourceDB, sourceFactionId)
			if err != nil {
				return err
			}
			sourceEntries = entries
			names, err := resolveFactionNames(a.ctx, a.sourceDB, sourceEntries)
			if err != nil {
				return err
			}
			sourceNames = names
			return nil
		},
		func() error {
			if sinkFactionId == 0 {
				return nil
			}
			fields, err := fetchNPCFactionHeader(a.ctx, a.sinkDB, sinkFactionId)
			if err != nil {
				return err
			}
			sinkFields = fields
			entries, err := fetchNPCFactionEntries(a.ctx, a.sinkDB, sinkFactionId)
			if err != nil {
				return err
			}
			sinkEntries = entries
			names, err := resolveFactionNames(a.ctx, a.sinkDB, sinkEntries)
			if err != nil {
				return err
			}
			sinkNames = names
			return nil
		},
	)
	if err != nil {
		return result, err
	}
	result.SourceFields = sourceFields
	result.SinkFields = sinkFields

	byFaction := make(map[int64]*NPCFactionEntryDiff)
	for _, e := range sourceEntries {
		id := toInt64(e["faction_id"])
		byFaction[id] = &NPCFactionEntryDiff{
			FactionID:      id,
			FactionName:    sourceNames[id],
			SourceExists:   true,
			SourceValue:    toInt64(e["value"]),
			SourceNPCValue: toInt64(e["npc_value"]),
			SourceTemp:     toInt64(e["temp"]),
		}
	}
	for _, e := range sinkEntries {
		id := toInt64(e["faction_id"])
		diff, ok := byFaction[id]
		if !ok {
			diff = &NPCFactionEntryDiff{FactionID: id}
			byFaction[id] = diff
		}
		if diff.FactionName == "" {
			diff.FactionName = sinkNames[id]
		}
		diff.SinkExists = true
		diff.SinkValue = toInt64(e["value"])
		diff.SinkNPCValue = toInt64(e["npc_value"])
		diff.SinkTemp = toInt64(e["temp"])
	}
	for _, diff := range byFaction {
		diff.Differs = diff.SourceExists != diff.SinkExists ||
			diff.SourceValue != diff.SinkValue ||
			diff.SourceNPCValue != diff.SinkNPCValue ||
			diff.SourceTemp != diff.SinkTemp
		result.Entries = append(result.Entries, *diff)
	}
	sort.Slice(result.Entries, func(i, j int) bool {
		return result.Entries[i].FactionID < result.Entries[j].FactionID
	})

	return result, nil
}

func fetchNPCFactionHeader(ctx context.Context, db *sql.DB, id int64) (map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM npc_faction WHERE id = ?", id)
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

func fetchNPCFactionEntries(ctx context.Context, db *sql.DB, npcFactionId int64) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM npc_faction_entries WHERE npc_faction_id = ?", npcFactionId)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	return result, err
}

// resolveFactionNames looks up faction_list.name for every faction_id referenced in entries,
// against the SAME database the entries came from — mirroring resolveOrphanedSpawnEntryNames' principle
// of resolving against the source of truth for that side, even though faction_list is expected to
// be identical canonical content on both databases (confirmed via SHOW CREATE TABLE), rather than
// assuming that and always querying one fixed side.
func resolveFactionNames(ctx context.Context, db *sql.DB, entries []map[string]interface{}) (map[int64]string, error) {
	names := make(map[int64]string)
	if len(entries) == 0 {
		return names, nil
	}
	idSet := make(map[int64]bool, len(entries))
	for _, e := range entries {
		idSet[toInt64(e["faction_id"])] = true
	}
	ids := make([]int64, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	placeholders, args := inClausePlaceholders(ids)
	rows, err := db.QueryContext(ctx, "SELECT id, name FROM faction_list WHERE id IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		names[id] = name
	}
	return names, rows.Err()
}

// NPCFactionListEntry is one row in the database-wide npc_faction browse list — id, name, and
// entry count only, cheap enough to fetch for every row in a single query. Backs the Factions
// tab's two independent columns (see ListNPCFactions) — deliberately NOT anchored to any zone or
// NPC, and deliberately NOT paired against the other side here: npc_faction.id is a local
// surrogate (it's one of idAlignmentTargets' own targets specifically because it isn't portable),
// and even the NPC that would normally anchor a cross-database match (npc_types.id) turned out not
// to be reliably portable either (confirmed against real source/sink data, 2026-08-02) — so unlike
// every other diff list in this app, there is no signal left to auto-match by. Source and sink
// lists are independent by construction, the same restraint NPCLootComparison's two unpaired
// lootdrop trees already established: the user recognizes a match by name/content and arms it
// manually (AlignId), this app doesn't guess at the correspondence.
type NPCFactionListEntry struct {
	Id         int64
	Name       string
	EntryCount int
}

// ListNPCFactions fetches every npc_faction row on one side, with its own entry count — the
// Factions tab's whole-database browse list. See NPCFactionListEntry's own comment for why this
// returns one side's list independently rather than any kind of paired/diffed result.
//
// Deliberately does NOT also compute a per-row NPC usage count here, even though that's a natural
// companion to EntryCount — real, shipped performance bug, found immediately after shipping
// (2026-08-02): npc_faction_entries.npc_faction_id is indexed (leading column of its own PRIMARY
// KEY), so EntryCount's correlated subquery is cheap, but npc_types.npc_faction_id has NO index at
// all. A "how many npc_types rows reference this id" subquery run once per npc_faction row (~1,600
// rows on the database this was checked against) meant ~1,600 full scans of npc_types (~21,000
// rows) — about 35 million row scans just to paint the list, on both databases, which is what made
// the tab appear to hang. NPC usage (GetNPCFactionDetail's UsedBy list) stays exactly where it
// already was: fetched lazily, only for the one row a user actually expands — that was always fast
// specifically because it's bounded to one id at a time, never the whole list at once. The lesson
// generalizes: an eager per-row aggregate over an unindexed foreign key is a real cost, not a free
// upgrade, even when the underlying single-row query is fast in isolation.
func (a *App) ListNPCFactions(isSource bool) ([]NPCFactionListEntry, error) {
	db := a.sinkDB
	if isSource {
		db = a.sourceDB
	}
	if db == nil {
		return nil, fmt.Errorf("database not connected")
	}
	rows, err := db.QueryContext(a.ctx,
		"SELECT nf.id, nf.name, "+
			"(SELECT COUNT(*) FROM npc_faction_entries nfe WHERE nfe.npc_faction_id = nf.id) "+
			"FROM npc_faction nf ORDER BY nf.name",
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var list []NPCFactionListEntry
	for rows.Next() {
		var e NPCFactionListEntry
		var name sql.NullString
		if err := rows.Scan(&e.Id, &name, &e.EntryCount); err != nil {
			return nil, err
		}
		e.Name = name.String
		list = append(list, e)
	}
	return list, rows.Err()
}

// NPCFactionEntryDetail is one faction_id row from npc_faction_entries, one-sided — the Factions
// tab's inline row-expansion content, plain content rather than a source-vs-sink diff (there's no
// "other side" to diff against here; see NPCFactionListEntry for why the two sides are never
// paired at this level).
type NPCFactionEntryDetail struct {
	FactionID   int64
	FactionName string
	Value       int64
	NPCValue    int64
	Temp        int64
}

// NPCFactionDetail is one npc_faction row's own fields plus its full entries, one-sided — the
// Factions tab's raw-ID lookup, necessarily one-sided the same way GetLootTable's is: npc_faction.id
// only means something on the database it came from.
// NPCFactionUsage is one NPC referencing a given npc_faction row, plus every zone/version that NPC
// has a real spawn2 presence in — the concrete "why does this exist" signal (added 2026-08-02,
// direct response to "I can see source has 7 Trakanon%-named factions and sink has 1, but I can't
// tell why — seeing what NPCs/zones are associated would give me insight"). Zones is via the same
// spawnentry->spawngroup->spawn2 chain getSpawnPointsForZone already walks, batched across every
// referencing NPC in one query rather than one query per NPC. Empty Zones means a quest-spawned NPC
// (no static spawn point anywhere) or one with no spawn2 presence in this database at all — shown
// as such, not guessed at via the zoneIdNumber-range convention; that's a discovery heuristic for a
// different problem (see GetNPCsForZone), not something to assert as fact here.
type NPCFactionUsage struct {
	NPCID   int64
	NPCName string
	Zones   []string // "short_name (vN)" for every zone/version this NPC has a real spawn2 row in
}

// fetchNPCFactionUsage finds every NPC referencing npcFactionId on one database, then batches a
// second query to find every zone/version each of those NPCs actually spawns in. Two queries
// regardless of how many NPCs reference the faction, mirroring getSpawnPointsForZone's own
// "batch, don't loop" discipline.
func fetchNPCFactionUsage(ctx context.Context, db *sql.DB, npcFactionId int64) ([]NPCFactionUsage, error) {
	npcRows, err := db.QueryContext(ctx, "SELECT id, name FROM npc_types WHERE npc_faction_id = ? ORDER BY name", npcFactionId)
	if err != nil {
		return nil, err
	}
	var usage []NPCFactionUsage
	ids := make(map[int64]bool)
	for npcRows.Next() {
		var u NPCFactionUsage
		if err := npcRows.Scan(&u.NPCID, &u.NPCName); err != nil {
			_ = npcRows.Close()
			return nil, err
		}
		usage = append(usage, u)
		ids[u.NPCID] = true
	}
	if err := npcRows.Err(); err != nil {
		_ = npcRows.Close()
		return nil, err
	}
	_ = npcRows.Close()
	if len(usage) == 0 {
		return nil, nil
	}

	idList := make([]int64, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}
	placeholders, args := inClausePlaceholders(idList)
	zoneRows, err := db.QueryContext(ctx,
		"SELECT DISTINCT se.npcID, s.zone, s.version FROM spawnentry se "+
			"JOIN spawngroup sg ON sg.id = se.spawngroupID "+
			"JOIN spawn2 s ON s.spawngroupID = sg.id "+
			"WHERE se.npcID IN ("+placeholders+")",
		args...,
	)
	if err != nil {
		return nil, err
	}
	zonesByNpc := make(map[int64][]string)
	for zoneRows.Next() {
		var npcId int64
		var zone string
		var version int8
		if err := zoneRows.Scan(&npcId, &zone, &version); err != nil {
			_ = zoneRows.Close()
			return nil, err
		}
		zonesByNpc[npcId] = append(zonesByNpc[npcId], fmt.Sprintf("%s (v%d)", zone, version))
	}
	if err := zoneRows.Err(); err != nil {
		_ = zoneRows.Close()
		return nil, err
	}
	_ = zoneRows.Close()

	for i := range usage {
		usage[i].Zones = zonesByNpc[usage[i].NPCID]
	}
	return usage, nil
}

type NPCFactionDetail struct {
	Id      int64
	Fields  map[string]interface{} // npc_faction header row, minus id
	Entries []NPCFactionEntryDetail
	UsedBy  []NPCFactionUsage // every NPC on this side referencing this npc_faction id, see NPCFactionUsage
}

// GetNPCFactionDetail fetches one npc_faction row's own fields + entries + NPC usage on one side —
// reuses fetchNPCFactionHeader/fetchNPCFactionEntries/resolveFactionNames exactly as
// CompareNPCFaction does, just for one side at a time rather than both concurrently, since the
// Factions tab expands one row (in one column) at a time rather than always fetching both sides
// together.
func (a *App) GetNPCFactionDetail(isSource bool, id int64) (NPCFactionDetail, error) {
	result := NPCFactionDetail{Id: id}
	db := a.sinkDB
	if isSource {
		db = a.sourceDB
	}
	if db == nil {
		return result, fmt.Errorf("database not connected")
	}

	fields, err := fetchNPCFactionHeader(a.ctx, db, id)
	if err != nil {
		return result, err
	}
	if fields == nil {
		return result, fmt.Errorf("no npc_faction #%d on this side", id)
	}
	result.Fields = fields

	entries, err := fetchNPCFactionEntries(a.ctx, db, id)
	if err != nil {
		return result, err
	}
	names, err := resolveFactionNames(a.ctx, db, entries)
	if err != nil {
		return result, err
	}
	for _, e := range entries {
		factionId := toInt64(e["faction_id"])
		result.Entries = append(result.Entries, NPCFactionEntryDetail{
			FactionID:   factionId,
			FactionName: names[factionId],
			Value:       toInt64(e["value"]),
			NPCValue:    toInt64(e["npc_value"]),
			Temp:        toInt64(e["temp"]),
		})
	}
	sort.Slice(result.Entries, func(i, j int) bool {
		return result.Entries[i].FactionID < result.Entries[j].FactionID
	})

	usage, err := fetchNPCFactionUsage(a.ctx, db, id)
	if err != nil {
		return result, err
	}
	result.UsedBy = usage

	return result, nil
}

// CompareNPCSpells fetches the npc_spells header + npc_spells_entries a specific NPC links to on
// each side, by that side's own raw npc_spells_id — same reasoning as CompareNPCFaction: the NPC
// itself (already resolved via the portable npc_types.id this whole app is built on) is the
// anchor, so there's no cross-database ID to match, just each side's own linked row fetched and
// diffed by content. Entries are merged by spellid (portable, via spells_new — see
// NPCSpellsEntryDiff for why entry fields stay a dynamic map instead of typed struct fields).
func (a *App) CompareNPCSpells(sourceSpellsId, sinkSpellsId int64) (NPCSpellsComparison, error) {
	result := NPCSpellsComparison{SourceId: sourceSpellsId, SinkId: sinkSpellsId}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	// Each side's header+entries+name-resolution pipeline runs concurrently — same latency
	// reasoning as the Compare* zone-diff functions, see runParallel's own comment.
	var sourceFields, sinkFields map[string]interface{}
	var sourceEntries, sinkEntries []map[string]interface{}
	var sourceNames, sinkNames map[int64]string
	err := runParallel(
		func() error {
			if sourceSpellsId == 0 {
				return nil
			}
			fields, err := fetchNPCSpellsHeader(a.ctx, a.sourceDB, sourceSpellsId)
			if err != nil {
				return err
			}
			sourceFields = fields
			entries, err := fetchNPCSpellsEntries(a.ctx, a.sourceDB, sourceSpellsId)
			if err != nil {
				return err
			}
			sourceEntries = entries
			names, err := resolveSpellNames(a.ctx, a.sourceDB, sourceEntries)
			if err != nil {
				return err
			}
			sourceNames = names
			return nil
		},
		func() error {
			if sinkSpellsId == 0 {
				return nil
			}
			fields, err := fetchNPCSpellsHeader(a.ctx, a.sinkDB, sinkSpellsId)
			if err != nil {
				return err
			}
			sinkFields = fields
			entries, err := fetchNPCSpellsEntries(a.ctx, a.sinkDB, sinkSpellsId)
			if err != nil {
				return err
			}
			sinkEntries = entries
			names, err := resolveSpellNames(a.ctx, a.sinkDB, sinkEntries)
			if err != nil {
				return err
			}
			sinkNames = names
			return nil
		},
	)
	if err != nil {
		return result, err
	}
	result.SourceFields = sourceFields
	result.SinkFields = sinkFields

	byId := make(map[int64]*NPCSpellsEntryDiff)
	for _, e := range sourceEntries {
		id := toInt64(e["spellid"])
		byId[id] = &NPCSpellsEntryDiff{
			SpellID:      id,
			SpellName:    sourceNames[id],
			SourceExists: true,
			SourceFields: withoutFields(e, "id", "npc_spells_id", "spellid"),
		}
	}
	for _, e := range sinkEntries {
		id := toInt64(e["spellid"])
		diff, ok := byId[id]
		if !ok {
			diff = &NPCSpellsEntryDiff{SpellID: id}
			byId[id] = diff
		}
		if diff.SpellName == "" {
			diff.SpellName = sinkNames[id]
		}
		diff.SinkExists = true
		diff.SinkFields = withoutFields(e, "id", "npc_spells_id", "spellid")
	}
	for _, diff := range byId {
		diff.Differs = diff.SourceExists != diff.SinkExists || !mapsEqual(diff.SourceFields, diff.SinkFields)
		result.Entries = append(result.Entries, *diff)
	}
	sort.Slice(result.Entries, func(i, j int) bool {
		return result.Entries[i].SpellID < result.Entries[j].SpellID
	})

	return result, nil
}

func fetchNPCSpellsHeader(ctx context.Context, db *sql.DB, id int64) (map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM npc_spells WHERE id = ?", id)
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

func fetchNPCSpellsEntries(ctx context.Context, db *sql.DB, npcSpellsId int64) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM npc_spells_entries WHERE npc_spells_id = ?", npcSpellsId)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	return result, err
}

// resolveSpellNames looks up spells_new.name for every spellid referenced in entries, against the
// same database the entries came from — same reasoning as resolveFactionNames. Scanned as
// sql.NullString, unlike faction_list.name: spells_new.name is nullable, and a spell that happens
// to have a NULL name shouldn't fail the whole lookup.
func resolveSpellNames(ctx context.Context, db *sql.DB, entries []map[string]interface{}) (map[int64]string, error) {
	names := make(map[int64]string)
	if len(entries) == 0 {
		return names, nil
	}
	idSet := make(map[int64]bool, len(entries))
	for _, e := range entries {
		idSet[toInt64(e["spellid"])] = true
	}
	ids := make([]int64, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	placeholders, args := inClausePlaceholders(ids)
	rows, err := db.QueryContext(ctx, "SELECT id, name FROM spells_new WHERE id IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name sql.NullString
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		names[id] = name.String
	}
	return names, rows.Err()
}

// NPCSpellsEffectsEntryDiff is one spell_effect_id row from npc_spells_effects_entries, merged
// across source and sink by spell_effect_id — EQEmu's "NPC Spell Effects" system, structurally a
// near-exact clone of npc_spells/npc_spells_entries (own header row + a list of entries, added
// 2026-08-01). Unlike SpellID/FactionID/ItemID, spell_effect_id is NOT a row in any database
// table — it's a fixed numeric spell-effect-attribute (SPA) constant hardcoded in the EQEmu server
// itself (e.g. critical melee chance, damage shield), so there's no name to resolve here and no
// portability risk the way a local surrogate id would have — the raw number IS the identity, shown
// as-is rather than guessed at with a hardcoded SPA-name table that could drift out of date.
// minlevel/maxlevel/se_base/se_limit/se_max are shown as plain comparable fields, mirroring
// NPCSpellsEntryDiff's drift-tolerant field-map shape rather than hardcoded struct fields.
type NPCSpellsEffectsEntryDiff struct {
	SpellEffectID int64
	SourceExists  bool
	SourceFields  map[string]interface{} // npc_spells_effects_entries columns, minus id/npc_spells_effects_id/spell_effect_id
	SinkExists    bool
	SinkFields    map[string]interface{}
	Differs       bool
}

// NPCSpellsEffectsComparison is the read-only source-vs-sink view behind the References section's
// "npc_spells_effects_id" reference. As of this pass, 0 NPCs on the checked source database
// actually use it (npc_spells_effects_id is 0 on every row) — built ahead of adoption anyway,
// mirroring CompareNPCSpells's exact shape, so it's ready the moment content starts using it rather
// than needing to be built reactively later.
type NPCSpellsEffectsComparison struct {
	SourceId     int64
	SinkId       int64
	SourceFields map[string]interface{} // npc_spells_effects header row, minus id
	SinkFields   map[string]interface{}
	Entries      []NPCSpellsEffectsEntryDiff
}

// CompareNPCSpellsEffects mirrors CompareNPCSpells exactly, one level simpler (no name resolution
// pass — see NPCSpellsEffectsEntryDiff for why spell_effect_id needs none).
func (a *App) CompareNPCSpellsEffects(sourceId, sinkId int64) (NPCSpellsEffectsComparison, error) {
	result := NPCSpellsEffectsComparison{SourceId: sourceId, SinkId: sinkId}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	var sourceFields, sinkFields map[string]interface{}
	var sourceEntries, sinkEntries []map[string]interface{}
	err := runParallel(
		func() error {
			if sourceId == 0 {
				return nil
			}
			fields, err := fetchNPCSpellsEffectsHeader(a.ctx, a.sourceDB, sourceId)
			if err != nil {
				return err
			}
			sourceFields = fields
			entries, err := fetchNPCSpellsEffectsEntries(a.ctx, a.sourceDB, sourceId)
			if err != nil {
				return err
			}
			sourceEntries = entries
			return nil
		},
		func() error {
			if sinkId == 0 {
				return nil
			}
			fields, err := fetchNPCSpellsEffectsHeader(a.ctx, a.sinkDB, sinkId)
			if err != nil {
				return err
			}
			sinkFields = fields
			entries, err := fetchNPCSpellsEffectsEntries(a.ctx, a.sinkDB, sinkId)
			if err != nil {
				return err
			}
			sinkEntries = entries
			return nil
		},
	)
	if err != nil {
		return result, err
	}
	result.SourceFields = sourceFields
	result.SinkFields = sinkFields

	byId := make(map[int64]*NPCSpellsEffectsEntryDiff)
	for _, e := range sourceEntries {
		id := toInt64(e["spell_effect_id"])
		byId[id] = &NPCSpellsEffectsEntryDiff{
			SpellEffectID: id,
			SourceExists:  true,
			SourceFields:  withoutFields(e, "id", "npc_spells_effects_id", "spell_effect_id"),
		}
	}
	for _, e := range sinkEntries {
		id := toInt64(e["spell_effect_id"])
		diff, ok := byId[id]
		if !ok {
			diff = &NPCSpellsEffectsEntryDiff{SpellEffectID: id}
			byId[id] = diff
		}
		diff.SinkExists = true
		diff.SinkFields = withoutFields(e, "id", "npc_spells_effects_id", "spell_effect_id")
	}
	for _, diff := range byId {
		diff.Differs = diff.SourceExists != diff.SinkExists || !mapsEqual(diff.SourceFields, diff.SinkFields)
		result.Entries = append(result.Entries, *diff)
	}
	sort.Slice(result.Entries, func(i, j int) bool {
		return result.Entries[i].SpellEffectID < result.Entries[j].SpellEffectID
	})

	return result, nil
}

func fetchNPCSpellsEffectsHeader(ctx context.Context, db *sql.DB, id int64) (map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM npc_spells_effects WHERE id = ?", id)
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

func fetchNPCSpellsEffectsEntries(ctx context.Context, db *sql.DB, npcSpellsEffectsId int64) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM npc_spells_effects_entries WHERE npc_spells_effects_id = ?", npcSpellsEffectsId)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	return result, err
}

// CompareNPCMerchant fetches the merchantlist rows a specific NPC links to on each side, by that
// side's own raw merchantid — same anchor-via-NPC reasoning as CompareNPCFaction/CompareNPCSpells,
// except there's no header row to fetch first (see NPCMerchantComparison). Entries are merged by
// item (portable, via items — see NPCMerchantEntryDiff for why item, not slot).
func (a *App) CompareNPCMerchant(sourceMerchantId, sinkMerchantId int64) (NPCMerchantComparison, error) {
	result := NPCMerchantComparison{SourceId: sourceMerchantId, SinkId: sinkMerchantId}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	// Each side's entries+name-resolution pipeline runs concurrently — same latency reasoning as
	// the Compare* zone-diff functions, see runParallel's own comment.
	var sourceEntries, sinkEntries []map[string]interface{}
	var sourceNames, sinkNames map[int64]string
	err := runParallel(
		func() error {
			if sourceMerchantId == 0 {
				return nil
			}
			entries, err := fetchMerchantEntries(a.ctx, a.sourceDB, sourceMerchantId)
			if err != nil {
				return err
			}
			sourceEntries = entries
			names, err := resolveItemNames(a.ctx, a.sourceDB, sourceEntries, "item")
			if err != nil {
				return err
			}
			sourceNames = names
			return nil
		},
		func() error {
			if sinkMerchantId == 0 {
				return nil
			}
			entries, err := fetchMerchantEntries(a.ctx, a.sinkDB, sinkMerchantId)
			if err != nil {
				return err
			}
			sinkEntries = entries
			names, err := resolveItemNames(a.ctx, a.sinkDB, sinkEntries, "item")
			if err != nil {
				return err
			}
			sinkNames = names
			return nil
		},
	)
	if err != nil {
		return result, err
	}

	byItem := make(map[int64]*NPCMerchantEntryDiff)
	for _, e := range sourceEntries {
		id := toInt64(e["item"])
		byItem[id] = &NPCMerchantEntryDiff{
			ItemID:       id,
			ItemName:     sourceNames[id],
			SourceExists: true,
			SourceFields: withoutFields(e, "merchantid", "item"),
		}
	}
	for _, e := range sinkEntries {
		id := toInt64(e["item"])
		diff, ok := byItem[id]
		if !ok {
			diff = &NPCMerchantEntryDiff{ItemID: id}
			byItem[id] = diff
		}
		if diff.ItemName == "" {
			diff.ItemName = sinkNames[id]
		}
		diff.SinkExists = true
		diff.SinkFields = withoutFields(e, "merchantid", "item")
	}
	for _, diff := range byItem {
		diff.Differs = diff.SourceExists != diff.SinkExists || !mapsEqual(diff.SourceFields, diff.SinkFields)
		result.Entries = append(result.Entries, *diff)
	}
	sort.Slice(result.Entries, func(i, j int) bool {
		return result.Entries[i].ItemID < result.Entries[j].ItemID
	})

	return result, nil
}

func fetchMerchantEntries(ctx context.Context, db *sql.DB, merchantId int64) ([]map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM merchantlist WHERE merchantid = ?", merchantId)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	return result, err
}

// resolveItemNames looks up items.Name for every item referenced in entries, against the same
// database the entries came from — same reasoning as resolveFactionNames/resolveSpellNames.
// idField is which column of each entry map holds the item id — merchantlist calls it "item",
// lootdrop_entries calls it "item_id"; generalized to a parameter rather than two near-duplicate
// functions once loot needed the same lookup against a differently-named column.
func resolveItemNames(ctx context.Context, db *sql.DB, entries []map[string]interface{}, idField string) (map[int64]string, error) {
	names := make(map[int64]string)
	if len(entries) == 0 {
		return names, nil
	}
	idSet := make(map[int64]bool, len(entries))
	for _, e := range entries {
		idSet[toInt64(e[idField])] = true
	}
	ids := make([]int64, 0, len(idSet))
	for id := range idSet {
		ids = append(ids, id)
	}
	placeholders, args := inClausePlaceholders(ids)
	rows, err := db.QueryContext(ctx, "SELECT id, Name FROM items WHERE id IN ("+placeholders+")", args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		names[id] = name
	}
	return names, rows.Err()
}
