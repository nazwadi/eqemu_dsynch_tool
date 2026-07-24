package main

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

// SpawnGroupZoneUsage is one (zone, version) pair whose spawn2 rows reference a spawngroupID —
// spawngroup has no zone column of its own, so this is the only way to discover what a group is
// actually "used for" before touching its shared spawnentry/field data. See SyncSpawnGroup.
type SpawnGroupZoneUsage struct {
	Zone    string
	Version int8
	Count   int
}

type SyncSpawnGroupOptions struct {
	ZoneShortName string
	ZoneVersion   int8
	X, Y, Z       float64 // identifies the spawn2 location whose spawngroup is being synced
	DryRun        bool
}

// SpawnGroupSyncResult covers both halves of what SyncSpawnGroup writes — a spawngroup's own
// fields and its full spawnentry roster — since they're synced together as one action.
type SpawnGroupSyncResult struct {
	DryRun         bool
	SpawnGroupName string
	Created        bool // true if the sink's spawngroupID was dangling (no real spawngroup row) and a fresh one was created, repointing every sink spawn2 row that shared the dangling id — false means an existing sink spawngroup was updated in place
	FieldsChanged  bool // whether the spawngroup's own columns (spawn_limit, wander box, etc.) differed and were (or would be) updated — always true when Created, since there was nothing on the sink to compare against
	EntriesBefore  int
	EntriesAfter   int
	OtherZoneUsage []SpawnGroupZoneUsage // non-empty means blocked — nothing was changed
	NotFound       bool                  // true if no sink spawn2 exists at this location yet
}

// RelocateSpawnGroupOptions identifies a sink spawngroup id flagged as SpawnGroupCollisionRisk —
// occupied by content unrelated to ZoneShortName/ZoneVersion — and the source content that should
// replace it there once freed. Unlike SyncSpawnGroupOptions, this isn't identified by a spawn2
// coordinate: the whole point is that the colliding id may not belong to any spawn2 row in this
// zone at all yet (a "new" row not synced, or one that has been, either way).
type RelocateSpawnGroupOptions struct {
	SpawnGroupId       int64  // the sink's colliding spawngroup id, to be freed and reclaimed
	ZoneShortName      string // spawn2 rows in THIS zone/version that reference SpawnGroupId are left alone — see RelocateSpawnGroup's comment for why
	ZoneVersion        int8
	SourceFields       map[string]interface{} // source's spawngroup fields — what gets written to the reclaimed id
	SourceSpawnEntries []SpawnEntry           // source's spawnentries, same
	DryRun             bool
}

// RelocateSpawnGroupResult previews/reports a relocate-and-reclaim. SquatterUsage is every other
// (zone, version) currently referencing SpawnGroupId — the confirm-step preview, so nothing gets
// silently rewritten in a zone the caller hasn't seen. NewSpawnGroupId (where the squatter's
// content ends up) is only known once the real write happens — 0 during a dry run.
type RelocateSpawnGroupResult struct {
	DryRun          bool
	SpawnGroupId    int64
	SquatterName    string
	NewSpawnGroupId int64
	SquatterUsage   []SpawnGroupZoneUsage
	ThisZoneCount   int // spawn2 rows in the CALLER's own zone/version currently referencing SpawnGroupId — never touched (see RelocateSpawnGroup's comment for why), shown so the confirm step can be sanity-checked against what the caller actually expects to see there rather than assumed safe
}

// SpawnGroupDiffRow is the row shape for the Spawngroups zone-view — one spawngroup per row,
// unlike SpawnDiffRow's one-row-per-spawn2-location. Spawngroup has no zone column and its own id
// isn't portable across databases (same reasoning as spawn2 — see CLAUDE.md's "Spawn point
// identity" notes), so a source spawngroup is matched to a sink one indirectly: by checking which
// sink spawngroup(s) are referenced at the source spawngroup's own member spawn2 coordinates in
// this zone, the same coordinate-identity mechanism every other spawngroup lookup in this app
// already relies on.
type SpawnGroupDiffRow struct {
	Status              string // "new" | "modified" | "removed" | "match" | "ambiguous"
	SourceGroupId       int64
	SinkGroupId         int64
	Name                string                 // source's name if this spawngroup exists there, else sink's — cosmetic/local, never diffed (see FieldsDiffer)
	SourceFields        map[string]interface{} // spawngroup columns, minus id — includes name
	SinkFields          map[string]interface{}
	SourceSpawnEntries  []SpawnEntry
	SinkSpawnEntries    []SpawnEntry
	SourceLocationCount int // spawn2 rows in this zone/version referencing SourceGroupId — informational only, doesn't drive Status
	SinkLocationCount   int
	FieldsDiffer        bool // spawngroup's own columns differ, "name" excluded — see updateSpawnGroupFields
	SpawnEntriesDiffer  bool
	// Populated only when Status == "ambiguous": every distinct sink spawngroupID the source
	// spawngroup's member locations resolved to. Flagged rather than guessed at, same "shared data
	// gets flagged, not silently resolved" rule used everywhere else spawngroup data is involved.
	AmbiguousSinkGroupIds []int64
	// One matched member coordinate (only set when Status is "modified" or "match") — the same
	// X/Y/Z SyncSpawnGroup already uses to identify a spawngroup indirectly, so a row from this
	// tab can drive the exact same sync action the Spawn Points detail panel already triggers.
	SampleCoord [3]float64
}

// CompareSpawnGroups diffs spawngroups for a zone/version, one row per spawngroup rather than per
// spawn2 location (see SpawnGroupDiffRow). Reuses getSpawnPointsForZone's existing zone-scoped
// fetch — this view is just a different grouping of the same spawn2/spawngroup/spawnentry data
// CompareSpawns already pulls, not a second dedicated query.
func (a *App) CompareSpawnGroups(shortName string, version int8) ([]SpawnGroupDiffRow, error) {
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

	sinkByCoord := make(map[[3]float64]SpawnPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkByCoord[spawnCoordKey(p)] = p
	}

	// A group's representative point (Fields/SpawnEntries/Name are identical across every spawn2 row
	// sharing a spawngroupID by construction — spawngroup is one row shared by many locations,
	// not one per location — so any member works) plus how many locations in this zone use it.
	type groupInfo struct {
		rep   SpawnPoint
		count int
	}
	sourceGroups := make(map[int64]*groupInfo)
	for _, p := range sourcePoints {
		g, ok := sourceGroups[p.SpawnGroupId]
		if !ok {
			g = &groupInfo{rep: p}
			sourceGroups[p.SpawnGroupId] = g
		}
		g.count++
	}
	sinkGroups := make(map[int64]*groupInfo)
	for _, p := range sinkPoints {
		g, ok := sinkGroups[p.SpawnGroupId]
		if !ok {
			g = &groupInfo{rep: p}
			sinkGroups[p.SpawnGroupId] = g
		}
		g.count++
	}

	// Tracks every sink group a source group resolved to (cleanly matched or ambiguous) so the
	// leftover pass below only reports genuinely source-less sink groups as "removed".
	claimedSinkGroups := make(map[int64]bool)

	var rows []SpawnGroupDiffRow
	for sourceGroupId, sg := range sourceGroups {
		// sink spawngroupID -> one source coordinate that resolved to it, kept for SampleCoord
		matched := make(map[int64][3]float64)
		for _, p := range sourcePoints {
			if p.SpawnGroupId != sourceGroupId {
				continue
			}
			coord := spawnCoordKey(p)
			if sinkP, ok := sinkByCoord[coord]; ok {
				if _, exists := matched[sinkP.SpawnGroupId]; !exists {
					matched[sinkP.SpawnGroupId] = coord
				}
			}
		}

		row := SpawnGroupDiffRow{
			SourceGroupId:       sourceGroupId,
			Name:                fmt.Sprintf("%v", sg.rep.SpawnGroupFields["name"]),
			SourceFields:        sg.rep.SpawnGroupFields,
			SourceSpawnEntries:  sg.rep.SpawnEntries,
			SourceLocationCount: sg.count,
		}

		switch len(matched) {
		case 0:
			row.Status = "new"
		case 1:
			for sinkGroupId, coord := range matched {
				row.SinkGroupId = sinkGroupId
				row.SampleCoord = coord
			}
			claimedSinkGroups[row.SinkGroupId] = true
			skg := sinkGroups[row.SinkGroupId]
			row.SinkFields = skg.rep.SpawnGroupFields
			row.SinkSpawnEntries = skg.rep.SpawnEntries
			row.SinkLocationCount = skg.count
			row.FieldsDiffer = !mapsEqual(withoutFields(row.SourceFields, "name"), withoutFields(row.SinkFields, "name"))
			row.SpawnEntriesDiffer = !spawnEntriesEqual(row.SourceSpawnEntries, row.SinkSpawnEntries)
			if row.FieldsDiffer || row.SpawnEntriesDiffer {
				row.Status = "modified"
			} else {
				row.Status = "match"
			}
		default:
			row.Status = "ambiguous"
			for sinkGroupId := range matched {
				row.AmbiguousSinkGroupIds = append(row.AmbiguousSinkGroupIds, sinkGroupId)
				claimedSinkGroups[sinkGroupId] = true
			}
		}
		rows = append(rows, row)
	}

	for sinkGroupId, skg := range sinkGroups {
		if claimedSinkGroups[sinkGroupId] {
			continue
		}
		rows = append(rows, SpawnGroupDiffRow{
			Status:            "removed",
			SinkGroupId:       sinkGroupId,
			Name:              fmt.Sprintf("%v", skg.rep.SpawnGroupFields["name"]),
			SinkFields:        skg.rep.SpawnGroupFields,
			SinkSpawnEntries:  skg.rep.SpawnEntries,
			SinkLocationCount: skg.count,
		})
	}

	return rows, nil
}

// updateSpawnGroupFields updates a spawngroup's own row on the sink to match source, excluding
// "name" — two independently-evolved databases can each have their own local label for the same
// logical group (see EQEmu Schema Notes on spawngroup.name), so overwriting it here would discard
// that the same way Sync()'s per-NPC spawn creation deliberately never renames an existing sink
// spawngroup either. Mirrors updateSpawn2's shape (sorted columns so the ? placeholders and their
// values can't get mismatched by Go's randomized map iteration order).
func updateSpawnGroupFields(ctx context.Context, tx *sql.Tx, sinkGroupId int64, sourceFields map[string]interface{}, sinkColumns map[string]bool) error {
	var columns []string
	for col := range sourceFields {
		if col == "name" {
			continue
		}
		if sinkColumns[col] {
			columns = append(columns, col)
		}
	}
	sort.Strings(columns)

	setClauses := make([]string, len(columns))
	values := make([]interface{}, len(columns)+1)
	for i, col := range columns {
		setClauses[i] = col + " = ?"
		values[i] = sourceFields[col]
	}
	values[len(columns)] = sinkGroupId

	query := fmt.Sprintf("UPDATE spawngroup SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	_, err := tx.ExecContext(ctx, query, values...)
	return err
}

// SyncSpawnGroup brings a spawngroup fully in line with source: both its own fields (spawn_limit,
// wander box, timing, etc.) and its full spawnentry roster, together in one transaction. This is a
// generalization of what was originally an entries-only sync — syncing a spawngroup's fields
// without its entries (or vice versa) doesn't correspond to anything a user actually wants;
// "bring this spawngroup in line with source" is one action, not two competing ones with the same
// safety check duplicated between them.
//
// Identified by the spawn2 location whose spawngroup the caller wants reconciled — spawngroupID
// isn't portable across databases (see CLAUDE.md's "Spawn point identity" notes), so, like every
// other spawngroup lookup in this app, identity has to be derived through spawn2's coordinates
// rather than trusting an ID directly. Deliberately separate from SyncSpawnPoints, which only ever
// touches a spawn2 row's own columns: a spawngroup can be shared by other spawn2 rows this call
// knows nothing about, possibly in a zone the caller never reviewed, since spawngroup has no zone
// column of its own — so this is blocked outright (not just warned) if the sink's spawngroupID is
// referenced by any spawn2 row outside options.ZoneShortName/ZoneVersion.
//
// npcID values in spawnentry need no translation between databases — npc_types.id is the portable
// identity this whole app is built on — so entries are a plain delete-and-reinsert once the safety
// check above has cleared it; "name" is excluded from the fields update (see updateSpawnGroupFields).
//
// If sinkPoint.SpawnGroupMissing is true, the sink spawn2 row's spawngroupID is dangling — the raw
// value SyncSpawnPoints copied verbatim from source doesn't correspond to any real sink spawngroup
// row (see SyncSpawnPoints' comment). In that case this creates a fresh spawngroup instead of
// updating one that doesn't exist, and repoints every sink spawn2 row in this zone/version still
// carrying that same dangling id at the new one — not just the row identified by X/Y/Z — since a
// shared spawngroup synced across many new spawn2 locations copies the identical raw source id to
// each of them; without repointing every sibling, syncing one location's spawngroup would leave
// the others still dangling.
func (a *App) SyncSpawnGroup(options SyncSpawnGroupOptions) (SpawnGroupSyncResult, error) {
	result := SpawnGroupSyncResult{DryRun: options.DryRun}

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

	target := [3]float64{options.X, options.Y, options.Z}
	var sourcePoint, sinkPoint *SpawnPoint
	for i := range sourcePoints {
		if spawnCoordKey(sourcePoints[i]) == target {
			sourcePoint = &sourcePoints[i]
			break
		}
	}
	for i := range sinkPoints {
		if spawnCoordKey(sinkPoints[i]) == target {
			sinkPoint = &sinkPoints[i]
			break
		}
	}
	if sourcePoint == nil {
		return result, fmt.Errorf("no source spawn2 at (%.2f, %.2f, %.2f)", options.X, options.Y, options.Z)
	}
	if sinkPoint == nil {
		result.NotFound = true
		return result, nil
	}

	result.SpawnGroupName = fmt.Sprintf("%v", sourcePoint.SpawnGroupFields["name"])
	result.EntriesBefore = len(sinkPoint.SpawnEntries)
	result.EntriesAfter = len(sourcePoint.SpawnEntries)
	result.Created = sinkPoint.SpawnGroupMissing
	if result.Created {
		result.FieldsChanged = true // nothing on the sink to compare against yet — everything is new
	} else {
		result.FieldsChanged = !mapsEqual(
			withoutFields(sourcePoint.SpawnGroupFields, "name"),
			withoutFields(sinkPoint.SpawnGroupFields, "name"),
		)
	}

	rows, err := a.sinkDB.QueryContext(a.ctx,
		"SELECT zone, version, COUNT(*) FROM spawn2 WHERE spawngroupID = ? GROUP BY zone, version",
		sinkPoint.SpawnGroupId,
	)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var usage SpawnGroupZoneUsage
		if err := rows.Scan(&usage.Zone, &usage.Version, &usage.Count); err != nil {
			_ = rows.Close()
			return result, err
		}
		if usage.Zone == options.ZoneShortName && usage.Version == options.ZoneVersion {
			continue
		}
		result.OtherZoneUsage = append(result.OtherZoneUsage, usage)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return result, err
	}
	_ = rows.Close()

	if len(result.OtherZoneUsage) > 0 || options.DryRun {
		return result, nil
	}

	sinkColumns, err := getSinkColumns(a.ctx, a.sinkDB, "spawngroup")
	if err != nil {
		return result, err
	}

	tx, err := a.sinkDB.BeginTx(a.ctx, nil)
	if err != nil {
		return result, err
	}

	targetGroupId := sinkPoint.SpawnGroupId
	if result.Created {
		// spawngroup.name is UNIQUE on both databases, but source's own name is never guaranteed
		// to be free in the sink — it's a local "Nth group created for this zone" label, not
		// shared content identity (same trap as spawngroup.id/spawn2.id). Try it verbatim first;
		// only disambiguate if sink already has an unrelated group with that same name.
		newGroupId, err := insertRow(a.ctx, tx, "spawngroup", sourcePoint.SpawnGroupFields, sinkColumns, nil)
		if err != nil && isDuplicateEntryError(err) {
			newGroupId, err = insertRow(a.ctx, tx, "spawngroup", sourcePoint.SpawnGroupFields, sinkColumns, map[string]interface{}{
				"name": fmt.Sprintf("%v_grp%d", sourcePoint.SpawnGroupFields["name"], sourcePoint.SpawnGroupId),
			})
		}
		if err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("creating spawngroup: %w", err)
		}
		// Repoint every sink spawn2 row in this zone/version still carrying the old dangling id —
		// not just sinkPoint's own row — so a shared spawngroup synced across many new spawn2
		// locations (all copied with the identical raw source spawngroupID, see SyncSpawnPoints)
		// resolves to the one real spawngroup just created, not a separate dangling reference per
		// location.
		if _, err := tx.ExecContext(a.ctx,
			"UPDATE spawn2 SET spawngroupID = ? WHERE spawngroupID = ? AND zone = ? AND version = ?",
			newGroupId, targetGroupId, options.ZoneShortName, options.ZoneVersion,
		); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("repointing spawn2 rows to new spawngroup: %w", err)
		}
		targetGroupId = newGroupId
	} else {
		if err := updateSpawnGroupFields(a.ctx, tx, targetGroupId, sourcePoint.SpawnGroupFields, sinkColumns); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("updating spawngroup fields: %w", err)
		}
		if _, err := tx.ExecContext(a.ctx, "DELETE FROM spawnentry WHERE spawngroupID = ?", targetGroupId); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("clearing existing spawn entries: %w", err)
		}
	}
	for _, entry := range sourcePoint.SpawnEntries {
		if _, err := tx.ExecContext(a.ctx,
			"INSERT INTO spawnentry (spawngroupID, npcID, chance) VALUES (?, ?, ?)",
			targetGroupId, entry.NPCID, entry.Chance,
		); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("creating spawn entry for NPC %d: %w", entry.NPCID, err)
		}
	}
	if err := tx.Commit(); err != nil {
		return result, err
	}
	return result, nil
}

// fetchSpawnGroupById fetches one spawngroup row's own fields (minus id), or nil if that id
// doesn't exist — same shape as fetchLootTableHeader/fetchNPCFactionHeader.
func fetchSpawnGroupById(ctx context.Context, db *sql.DB, id int64) (map[string]interface{}, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM spawngroup WHERE id = ?", id)
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

// RelocateSpawnGroup resolves a SpawnGroupCollisionRisk: options.SpawnGroupId already exists on
// the sink, but as content unrelated to options.ZoneShortName/ZoneVersion (see
// SpawnDiffRow.SpawnGroupCollisionRisk for how that gets detected). It moves the current occupant
// ("the squatter") to a freshly-assigned id, repoints every spawn2 row *outside* the caller's
// zone/version onto that new id, then creates a new spawngroup at the now-vacated original id
// using an explicit id (mysql accepts this on an AUTO_INCREMENT column as long as it's free) with
// options.SourceFields/SourceSpawnEntries.
//
// Deliberately does NOT touch spawn2 rows inside the caller's own zone/version, even though they
// may already reference options.SpawnGroupId (a shared source spawngroup copied verbatim to every
// location that uses it, per SyncSpawnPoints — see CLAUDE.md's "Spawn points sync verbatim" note).
// Those rows don't need repointing: they're already pointed at the id, and once this call
// populates that id with the correct content, they start resolving correctly with no further
// action — repointing them anywhere would be wrong, since the id itself is what's being fixed.
//
// SquatterUsage (every OTHER zone/version currently referencing the id) and ThisZoneCount (rows
// in the caller's own zone/version, never touched) are always computed, dry run or not — the
// confirm step's "here's what this actually touches, and here's what it doesn't" preview,
// mirroring SyncSpawnGroup's OtherZoneUsage. ThisZoneCount exists purely so a caller can sanity-
// check it against what they actually expect to see there (e.g. "3 locations, that's right")
// instead of the in-zone exclusion being an invisible assumption; this app has no way to verify
// every one of those rows is really waiting on the reclaim rather than a genuine, unrelated
// coincidental match — see the function's own design note in CLAUDE.md for that caveat. Unlike
// SyncSpawnGroup, SquatterUsage never blocks the action here:
// the whole point of relocating is to safely touch it, with the user having seen the list first.
func (a *App) RelocateSpawnGroup(options RelocateSpawnGroupOptions) (RelocateSpawnGroupResult, error) {
	result := RelocateSpawnGroupResult{DryRun: options.DryRun, SpawnGroupId: options.SpawnGroupId}

	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	squatterFields, err := fetchSpawnGroupById(a.ctx, a.sinkDB, options.SpawnGroupId)
	if err != nil {
		return result, err
	}
	if squatterFields == nil {
		return result, fmt.Errorf("no spawngroup #%d exists on the sink to relocate", options.SpawnGroupId)
	}
	result.SquatterName = fmt.Sprintf("%v", squatterFields["name"])

	rows, err := a.sinkDB.QueryContext(a.ctx,
		"SELECT zone, version, COUNT(*) FROM spawn2 WHERE spawngroupID = ? GROUP BY zone, version",
		options.SpawnGroupId,
	)
	if err != nil {
		return result, err
	}
	for rows.Next() {
		var usage SpawnGroupZoneUsage
		if err := rows.Scan(&usage.Zone, &usage.Version, &usage.Count); err != nil {
			_ = rows.Close()
			return result, err
		}
		if usage.Zone == options.ZoneShortName && usage.Version == options.ZoneVersion {
			result.ThisZoneCount = usage.Count
			continue
		}
		result.SquatterUsage = append(result.SquatterUsage, usage)
	}
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return result, err
	}
	_ = rows.Close()

	if options.DryRun {
		return result, nil
	}

	sinkColumns, err := getSinkColumns(a.ctx, a.sinkDB, "spawngroup")
	if err != nil {
		return result, err
	}

	tx, err := a.sinkDB.BeginTx(a.ctx, nil)
	if err != nil {
		return result, err
	}

	entryRows, err := tx.QueryContext(a.ctx, "SELECT npcID, chance FROM spawnentry WHERE spawngroupID = ?", options.SpawnGroupId)
	if err != nil {
		_ = tx.Rollback()
		return result, err
	}
	type squatterEntry struct {
		npcID  int64
		chance int64
	}
	var squatterEntries []squatterEntry
	for entryRows.Next() {
		var e squatterEntry
		if err := entryRows.Scan(&e.npcID, &e.chance); err != nil {
			_ = entryRows.Close()
			_ = tx.Rollback()
			return result, err
		}
		squatterEntries = append(squatterEntries, e)
	}
	if err := entryRows.Err(); err != nil {
		_ = entryRows.Close()
		_ = tx.Rollback()
		return result, err
	}
	_ = entryRows.Close()

	// 1. Move the squatter to a fresh id, name included verbatim (unlike updateSpawnGroupFields,
	// which excludes name when updating an already-matched group in place — here we're relocating
	// the exact same content, not reconciling it against anything, so its name should travel with it).
	newId, err := insertRow(a.ctx, tx, "spawngroup", squatterFields, sinkColumns, nil)
	if err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("relocating spawngroup #%d: %w", options.SpawnGroupId, err)
	}
	result.NewSpawnGroupId = newId
	for _, e := range squatterEntries {
		if _, err := tx.ExecContext(a.ctx,
			"INSERT INTO spawnentry (spawngroupID, npcID, chance) VALUES (?, ?, ?)",
			newId, e.npcID, e.chance,
		); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("relocating spawn entry for NPC %d: %w", e.npcID, err)
		}
	}

	// 2. Repoint every OTHER zone's spawn2 rows onto the squatter's new home — never the caller's
	// own zone/version, see the function comment for why.
	if _, err := tx.ExecContext(a.ctx,
		"UPDATE spawn2 SET spawngroupID = ? WHERE spawngroupID = ? AND NOT (zone = ? AND version = ?)",
		newId, options.SpawnGroupId, options.ZoneShortName, options.ZoneVersion,
	); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("repointing spawn2 rows off spawngroup #%d: %w", options.SpawnGroupId, err)
	}

	// 3. Vacate the original id.
	if _, err := tx.ExecContext(a.ctx, "DELETE FROM spawnentry WHERE spawngroupID = ?", options.SpawnGroupId); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("clearing old spawn entries for #%d: %w", options.SpawnGroupId, err)
	}
	if _, err := tx.ExecContext(a.ctx, "DELETE FROM spawngroup WHERE id = ?", options.SpawnGroupId); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("clearing old spawngroup #%d: %w", options.SpawnGroupId, err)
	}

	// 4. Reclaim the now-free id with source's real content — an explicit id value on an
	// AUTO_INCREMENT column, accepted by MySQL as long as it's unused, which it now is.
	if _, err := insertRow(a.ctx, tx, "spawngroup", options.SourceFields, sinkColumns, map[string]interface{}{
		"id": options.SpawnGroupId,
	}); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("reclaiming spawngroup #%d: %w", options.SpawnGroupId, err)
	}
	for _, entry := range options.SourceSpawnEntries {
		if _, err := tx.ExecContext(a.ctx,
			"INSERT INTO spawnentry (spawngroupID, npcID, chance) VALUES (?, ?, ?)",
			options.SpawnGroupId, entry.NPCID, entry.Chance,
		); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("creating reclaimed spawn entry for NPC %d: %w", entry.NPCID, err)
		}
	}

	if err := tx.Commit(); err != nil {
		return result, err
	}
	return result, nil
}
