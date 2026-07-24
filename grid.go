package main

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"
)

// GridEntry is one waypoint in a patrol grid — a grid_entries row, matched within a grid by
// Number (its position in the ordered patrol path).
type GridEntry struct {
	Number      int64
	X, Y, Z     float64
	Heading     float64
	Pause       int64
	Centerpoint bool
}

// GridPoint is one grid (patrol path) plus its ordered waypoints. Unlike spawngroup, grid IS
// zone-scoped directly — zoneid is part of its primary key (zoneid, id), confirmed via
// SHOW CREATE TABLE on both databases, and id is a plain int with no AUTO_INCREMENT. That makes
// Id trustworthy as identity within one zone: the same category of trust already extended to
// zone.short_name+version, not a database-wide surrogate key like spawngroup.id/spawn2.id.
type GridPoint struct {
	Id      int64
	Fields  map[string]interface{} // type, type2 — dynamic, minus id/zoneid
	Entries []GridEntry
}

// GridDiffRow mirrors SpawnDiffRow's two-flag shape (FieldsDiffer/SpawnEntriesDiffer), but for grids
// there's no shared-data risk equivalent to a spawngroup's entries — a grid's waypoints aren't
// referenced by anything else the way a spawngroup can be reused across many spawn2 locations —
// so, unlike spawn entries, EntriesDiffer is something SyncGrids is allowed to fix directly.
type GridDiffRow struct {
	Status        string // "new" | "modified" | "removed" | "match"
	Source        *GridPoint
	Sink          *GridPoint
	FieldsDiffer  bool
	EntriesDiffer bool
}

type SyncGridsOptions struct {
	ZoneIdNumber int64
	DryRun       bool
	GridIds      []int64 // sink grid ids ("modified" rows) — full fields+entries replace
	NewGridIds   []int64 // source grid ids ("new" rows) — created fresh, reusing source's own id
}

type SyncGridsResult struct {
	DryRun  bool
	Created int
	Updated int
	Errors  []string
}

// fetchZoneGridIds returns the set of grid IDs that exist for a zone in the given database —
// renamed from the sink-only fetchSinkGridIds once CompareSpawns started calling it against both
// databases (see SpawnPoint.PathgridMissing) rather than just the sink at sync time (see
// updateSpawn2/SyncSpawnPoints). Deliberately just IDs, not the full getGridsForZone fetch (fields
// + every waypoint) — that's much more data than either use needs.
func fetchZoneGridIds(ctx context.Context, db *sql.DB, zoneIdNumber int64) (map[int64]bool, error) {
	rows, err := db.QueryContext(ctx, "SELECT id FROM grid WHERE zoneid = ?", zoneIdNumber)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	ids := make(map[int64]bool)
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids[id] = true
	}
	return ids, rows.Err()
}

// getGridsForZone fetches every grid + its ordered grid_entries for one zone from one database,
// batched into 2 queries regardless of how many grids/waypoints exist — same batching shape as
// getSpawnPointsForZone. zoneIdNumber is zone.zoneidnumber (grid.zoneid is a plain int, not the
// short_name spawn2 uses), already threaded through the app for the quest-spawn ID-range check.
func getGridsForZone(ctx context.Context, db *sql.DB, zoneIdNumber int64) ([]GridPoint, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM grid WHERE zoneid = ?", zoneIdNumber)
	if err != nil {
		return nil, err
	}
	gridRows, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}
	if len(gridRows) == 0 {
		return nil, nil
	}

	entryRows, err := db.QueryContext(ctx, "SELECT * FROM grid_entries WHERE zoneid = ? ORDER BY gridid, number", zoneIdNumber)
	if err != nil {
		return nil, err
	}
	entryDynRows, err := scanDynamicRows(entryRows)
	_ = entryRows.Close()
	if err != nil {
		return nil, err
	}
	entriesByGrid := make(map[int64][]GridEntry)
	for _, e := range entryDynRows {
		gid := toInt64(e["gridid"])
		entriesByGrid[gid] = append(entriesByGrid[gid], GridEntry{
			Number:      toInt64(e["number"]),
			X:           toFloat64(e["x"]),
			Y:           toFloat64(e["y"]),
			Z:           toFloat64(e["z"]),
			Heading:     toFloat64(e["heading"]),
			Pause:       toInt64(e["pause"]),
			Centerpoint: toInt64(e["centerpoint"]) != 0,
		})
	}

	points := make([]GridPoint, 0, len(gridRows))
	for _, g := range gridRows {
		id := toInt64(g["id"])
		fields := make(map[string]interface{}, len(g))
		for k, v := range g {
			if k == "id" || k == "zoneid" {
				continue
			}
			fields[k] = v
		}
		points = append(points, GridPoint{
			Id:      id,
			Fields:  fields,
			Entries: entriesByGrid[id],
		})
	}
	return points, nil
}

// gridEntriesEqual compares two grids' waypoint lists by Number, order-independent (the caller's
// ORDER BY doesn't have to hold on both sides for this to be correct).
func gridEntriesEqual(a, b []GridEntry) bool {
	if len(a) != len(b) {
		return false
	}
	byNumber := make(map[int64]GridEntry, len(b))
	for _, e := range b {
		byNumber[e.Number] = e
	}
	for _, e := range a {
		other, ok := byNumber[e.Number]
		if !ok || e != other {
			return false
		}
	}
	return true
}

// CompareGrids diffs source vs sink grids for one zone, matched by Id (see GridPoint for why
// that's trustworthy here, unlike the coordinate-based matching spawn2 needs).
func (a *App) CompareGrids(zoneIdNumber int64) ([]GridDiffRow, error) {
	sourcePoints, err := getGridsForZone(a.ctx, a.sourceDB, zoneIdNumber)
	if err != nil {
		return nil, err
	}
	sinkPoints, err := getGridsForZone(a.ctx, a.sinkDB, zoneIdNumber)
	if err != nil {
		return nil, err
	}

	sinkById := make(map[int64]GridPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkById[p.Id] = p
	}

	var diff []GridDiffRow
	seen := make(map[int64]bool)
	for _, sp := range sourcePoints {
		sinkPoint, exists := sinkById[sp.Id]
		row := GridDiffRow{Source: &sp}
		if !exists {
			row.Status = "new"
			diff = append(diff, row)
			continue
		}
		seen[sp.Id] = true
		row.Sink = &sinkPoint
		row.FieldsDiffer = !mapsEqual(sp.Fields, sinkPoint.Fields)
		row.EntriesDiffer = !gridEntriesEqual(sp.Entries, sinkPoint.Entries)
		if !row.FieldsDiffer && !row.EntriesDiffer {
			row.Status = "match"
		} else {
			row.Status = "modified"
		}
		diff = append(diff, row)
	}
	for _, sk := range sinkPoints {
		if !seen[sk.Id] {
			diff = append(diff, GridDiffRow{Status: "removed", Sink: &sk})
		}
	}
	return diff, nil
}

// insertGridEntry writes one waypoint. grid_entries has no surrogate id column — its primary key
// is the composite (zoneid, gridid, number) — so this is a direct insert, the same shape already
// used for spawnentry, rather than going through insertRow's dynamic column filtering.
func insertGridEntry(ctx context.Context, tx *sql.Tx, zoneIdNumber, gridId int64, entry GridEntry) error {
	centerpoint := 0
	if entry.Centerpoint {
		centerpoint = 1
	}
	_, err := tx.ExecContext(ctx,
		"INSERT INTO grid_entries (gridid, zoneid, number, x, y, z, heading, pause, centerpoint) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		gridId, zoneIdNumber, entry.Number, entry.X, entry.Y, entry.Z, entry.Heading, entry.Pause, centerpoint,
	)
	return err
}

// createGrid inserts a fresh grid + full grid_entries list in the sink, reusing source's own
// grid.id (see GridPoint/SyncGrids for why that's safe here, unlike spawngroup/spawn2 IDs — grid
// isn't shared across unrelated things the way a spawngroup can be, so there's no collision or
// shared-spawngroup class of risk to guard against before creating one).
func createGrid(ctx context.Context, tx *sql.Tx, zoneIdNumber int64, source GridPoint, gridColumns map[string]bool) error {
	if _, err := insertRow(ctx, tx, "grid", source.Fields, gridColumns, map[string]interface{}{
		"id":     source.Id,
		"zoneid": zoneIdNumber,
	}); err != nil {
		return fmt.Errorf("creating grid: %w", err)
	}
	for _, entry := range source.Entries {
		if err := insertGridEntry(ctx, tx, zoneIdNumber, source.Id, entry); err != nil {
			return fmt.Errorf("creating grid_entries #%d: %w", entry.Number, err)
		}
	}
	return nil
}

// updateGrid replaces an existing sink grid's own fields and its entire waypoint list to match
// source — grid_entries is deleted and reinserted rather than diffed row-by-row, the same
// delete-and-reinsert shape SyncSpawnGroup already uses for spawnentry.
func updateGrid(ctx context.Context, tx *sql.Tx, zoneIdNumber int64, source GridPoint, gridColumns map[string]bool) error {
	var columns []string
	for col := range source.Fields {
		if gridColumns[col] {
			columns = append(columns, col)
		}
	}
	sort.Strings(columns)
	if len(columns) > 0 {
		setClauses := make([]string, len(columns))
		values := make([]interface{}, len(columns)+2)
		for i, col := range columns {
			setClauses[i] = col + " = ?"
			values[i] = source.Fields[col]
		}
		values[len(columns)] = zoneIdNumber
		values[len(columns)+1] = source.Id
		query := fmt.Sprintf("UPDATE grid SET %s WHERE zoneid = ? AND id = ?", strings.Join(setClauses, ", "))
		if _, err := tx.ExecContext(ctx, query, values...); err != nil {
			return fmt.Errorf("updating grid fields: %w", err)
		}
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM grid_entries WHERE zoneid = ? AND gridid = ?", zoneIdNumber, source.Id); err != nil {
		return fmt.Errorf("clearing existing grid_entries: %w", err)
	}
	for _, entry := range source.Entries {
		if err := insertGridEntry(ctx, tx, zoneIdNumber, source.Id, entry); err != nil {
			return fmt.Errorf("creating grid_entries #%d: %w", entry.Number, err)
		}
	}
	return nil
}

// SyncGrids replaces sink grid rows (fields + full waypoint list) to match source, and creates
// entirely new grid/grid_entries chains for grids that don't exist in the sink yet. Simpler than
// SyncSpawnGroup: grid.id is trustworthy within a zone (see GridPoint) and doesn't need the
// cross-zone-usage guard SyncSpawnGroup enforces, since a grid isn't shared data the way a
// spawngroup is.
func (a *App) SyncGrids(options SyncGridsOptions) (SyncGridsResult, error) {
	result := SyncGridsResult{DryRun: options.DryRun}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	sourcePoints, err := getGridsForZone(a.ctx, a.sourceDB, options.ZoneIdNumber)
	if err != nil {
		return result, err
	}
	sourceById := make(map[int64]GridPoint, len(sourcePoints))
	for _, p := range sourcePoints {
		sourceById[p.Id] = p
	}
	sinkPoints, err := getGridsForZone(a.ctx, a.sinkDB, options.ZoneIdNumber)
	if err != nil {
		return result, err
	}
	sinkById := make(map[int64]GridPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkById[p.Id] = p
	}

	var gridColumns map[string]bool
	var tx *sql.Tx
	if !options.DryRun {
		gridColumns, err = getSinkColumns(a.ctx, a.sinkDB, "grid")
		if err != nil {
			return result, err
		}
		tx, err = a.sinkDB.BeginTx(a.ctx, nil)
		if err != nil {
			return result, err
		}
	}

	for _, gridId := range options.GridIds {
		sourcePoint, ok := sourceById[gridId]
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf("grid #%d: no matching source grid", gridId))
			continue
		}
		if _, ok := sinkById[gridId]; !ok {
			result.Errors = append(result.Errors, fmt.Sprintf("grid #%d: not found in sink zone data", gridId))
			continue
		}
		if options.DryRun {
			result.Updated++
			continue
		}
		if err := updateGrid(a.ctx, tx, options.ZoneIdNumber, sourcePoint, gridColumns); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("grid #%d: %w", gridId, err)
		}
		result.Updated++
	}

	for _, gridId := range options.NewGridIds {
		sourcePoint, ok := sourceById[gridId]
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf("grid #%d: no matching source grid", gridId))
			continue
		}
		if options.DryRun {
			result.Created++
			continue
		}
		if err := createGrid(a.ctx, tx, options.ZoneIdNumber, sourcePoint, gridColumns); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("grid #%d: %w", gridId, err)
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
