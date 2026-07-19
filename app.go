package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

// App struct
type App struct {
	ctx      context.Context
	sourceDB *sql.DB
	sinkDB   *sql.DB
}

type SshConfig struct {
	Host       string
	Port       string
	Username   string
	PrivateKey string
}

type Config struct {
	Source ConnectionConfig
	Sink   ConnectionConfig
}
type ConnectionConfig struct {
	DbName    string
	Host      string
	Port      string
	Username  string
	Password  string
	UseSSH    bool
	SshConfig SshConfig
}

type Zone struct {
	Id           int64
	ZoneIdNumber int64
	Version      int8
	ShortName    string
	LongName     string
}

type NPC struct {
	Id            int64
	HasSpawnPoint bool // false = discovered via zone-ID-range fallback only (quest-spawned, no static spawn2 row)
	Fields        map[string]interface{}
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
	SyncSpawns    bool
	DryRun        bool
	NPCIds        []int64 // empty means all NPCs in zone
}

type SyncResult struct {
	DryRun               bool
	NPCsSynced           []int64
	SpawnsSynced         int          // count of spawn2 rows created (or, on dry run, that would be created)
	SpawnsCreatedForNPCs []int64      // subset of NPCsSynced that also got/will get a spawn point — drives the preview badge
	Skipped              []SkippedNPC // NPCs deliberately not synced (not found, needs a spawn point, spawn conflict) — every NPCId ends up in exactly one of NPCsSynced or Skipped
	TODOItems            []TODOItem
	Errors               []string // genuine unexpected failures only — never used for a deliberate skip, see SkippedNPC
}

type TODOItem struct {
	Type     string // "loottable", "faction", "spells"
	SourceID int64
	SinkID   int64
	NPCID    int64
	NPCName  string
	ZoneName string
}

// SkippedNPC is an NPC Sync() deliberately declined to touch — not a failure, the safety
// mechanism doing its job. Structured (not a formatted string) so the frontend can render it
// inline next to the NPC it applies to instead of a disconnected wall of text.
type SkippedNPC struct {
	NPCID  int64
	Name   string
	Reason string
}

// spawnCandidate is one of a source NPC's real spawn2/spawngroup/spawnentry locations.
// Unlike npc_types.id, a newly-added spawn2/spawngroup row's own ID has no meaning in the
// sink — X/Y/Z is the only thing stable enough across two diverged databases to identify
// "this spawn point," which is why the fields below carry the raw coordinates separately
// from the dynamic column maps (which have their id/spawngroupID columns stripped, since
// the sink will assign its own).
type spawnCandidate struct {
	X, Y, Z          float64
	Chance           int64
	SharedPool       bool // true if source's spawngroup has spawnentries for OTHER NPCs too — a weighted pool, not a single-NPC spawn point
	Spawn2Fields     map[string]interface{}
	SpawnGroupFields map[string]interface{}
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) Connect(c *ConnectionConfig, isSource bool) error {
	db, err := sql.Open("mysql", c.Username+":"+c.Password+"@tcp("+c.Host+":"+c.Port+")/"+c.DbName+"?timeout=5s")
	if err != nil {
		return err
	}
	err = db.Ping()
	if err != nil {
		return err
	}
	db.SetConnMaxLifetime(time.Minute * 3)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)
	if isSource {
		a.sourceDB = db
	} else {
		a.sinkDB = db
	}

	return nil
}

func configPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "eqemu-sync", "config.json"), nil
}

func todoPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "eqemu-sync", "todo.json"), nil
}

func toInt64(v interface{}) int64 {
	switch val := v.(type) {
	case int64:
		return val
	case []byte:
		n, _ := strconv.ParseInt(string(val), 10, 64)
		return n
	case string:
		n, _ := strconv.ParseInt(val, 10, 64)
		return n
	}
	return 0
}

func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case []byte:
		n, _ := strconv.ParseFloat(string(val), 64)
		return n
	case string:
		n, _ := strconv.ParseFloat(val, 64)
		return n
	}
	return 0
}

func mapsEqual(a, b map[string]interface{}) bool {
	for k, av := range a {
		if k == "id" {
			continue
		}
		bv, ok := b[k]
		if !ok {
			continue // skip columns that don't exist in the sink
		}
		if fmt.Sprintf("%v", av) != fmt.Sprintf("%v", bv) {
			return false
		}
	}
	return true
}

func (a *App) SaveConfig(c *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	err = os.MkdirAll(filepath.Dir(path), 0755)
	if err != nil {
		return err
	}

	data, err := json.Marshal(c)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0600)
}

func (a *App) LoadConfig() (Config, error) {
	path, err := configPath()
	if err != nil {
		return Config{}, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return Config{}, err
	}
	var c Config
	err = json.Unmarshal(data, &c)
	return c, err
}

func (a *App) GetZones() ([]Zone, error) {
	if a.sourceDB == nil {
		return nil, fmt.Errorf("source database not connected")
	}
	rows, err := a.sourceDB.QueryContext(
		a.ctx,
		"SELECT id, zoneidnumber, version, short_name, long_name from zone")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var zones []Zone
	for rows.Next() {
		var zone Zone
		if err := rows.Scan(
			&zone.Id,
			&zone.ZoneIdNumber,
			&zone.Version,
			&zone.ShortName,
			&zone.LongName,
		); err != nil {
			return nil, err
		}
		zones = append(zones, zone)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return zones, nil
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

func getSinkColumns(ctx context.Context, db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.QueryContext(ctx, "SHOW COLUMNS FROM "+table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	columns := make(map[string]bool)
	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}
		if name, ok := values[0].([]byte); ok {
			columns[string(name)] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return columns, nil
}

func buildTODOItems(sourceNpc NPC, sinkNpc *NPC, zoneShortName string) []TODOItem {
	fkFields := []struct {
		field   string
		todoTyp string
	}{
		{"loottable_id", "loottable"},
		{"npc_spells_id", "spells"},
		{"npc_faction_id", "faction"},
		{"merchantid", "merchant"},
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
			Type:     fk.todoTyp,
			SourceID: sourceID,
			SinkID:   sinkID,
			NPCID:    sourceNpc.Id,
			NPCName:  name,
			ZoneName: zoneShortName,
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

func appendTODOItems(items []TODOItem) error {
	if len(items) == 0 {
		return nil
	}
	path, err := todoPath()
	if err != nil {
		return err
	}
	var existing []TODOItem
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &existing)
	}
	existing = append(existing, items...)

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.Marshal(existing)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// scanDynamicRows reads every row of an already-executed query into a slice of column-name-keyed
// maps. Used for spawn2/spawngroup queries the same way GetNPCsForZone does it inline for
// npc_types — kept separate here rather than refactoring GetNPCsForZone to share it, since that
// function's loop is already intertwined with npc_types-specific extraction (has_spawn_point).
func scanDynamicRows(rows *sql.Rows) ([]map[string]interface{}, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var result []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}
		fields := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			if b, ok := values[i].([]byte); ok {
				fields[col] = string(b)
			} else {
				fields[col] = values[i]
			}
		}
		result = append(result, fields)
	}
	return result, rows.Err()
}

// getSourceSpawnCandidates finds every real spawn2/spawngroup/spawnentry location a source NPC
// spawns at within one zone/version. Deliberately two separate queries rather than one join:
// spawn2 and spawngroup both have an `id` column, and SELECT sg.*, s.* in one query would
// produce two columns both named "id" — scanDynamicRows keys its map by column name, so the
// second would silently clobber the first.
func (a *App) getSourceSpawnCandidates(shortName string, version int8, npcId int64) ([]spawnCandidate, error) {
	rows, err := a.sourceDB.QueryContext(a.ctx, `
		SELECT s.*, se.chance AS spawnentry_chance
		FROM spawn2 s
		    JOIN spawnentry se ON se.spawngroupID = s.spawngroupID AND se.npcID = ?
		WHERE s.zone = ? AND s.version = ?
		`, npcId, shortName, version)
	if err != nil {
		return nil, err
	}
	spawn2Rows, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}

	var candidates []spawnCandidate
	for _, s2 := range spawn2Rows {
		chance := toInt64(s2["spawnentry_chance"])
		spawnGroupId := toInt64(s2["spawngroupID"])

		sgRows, err := a.sourceDB.QueryContext(a.ctx, "SELECT * FROM spawngroup WHERE id = ?", spawnGroupId)
		if err != nil {
			return nil, err
		}
		spawnGroups, err := scanDynamicRows(sgRows)
		_ = sgRows.Close()
		if err != nil {
			return nil, err
		}
		if len(spawnGroups) == 0 {
			continue
		}

		var otherNPCCount int
		if err := a.sourceDB.QueryRowContext(a.ctx,
			"SELECT COUNT(*) FROM spawnentry WHERE spawngroupID = ? AND npcID != ?",
			spawnGroupId, npcId,
		).Scan(&otherNPCCount); err != nil {
			return nil, err
		}

		spawn2Fields := make(map[string]interface{}, len(s2))
		for k, v := range s2 {
			if k == "id" || k == "spawngroupID" || k == "spawnentry_chance" {
				continue
			}
			spawn2Fields[k] = v
		}
		spawnGroupFields := make(map[string]interface{}, len(spawnGroups[0]))
		for k, v := range spawnGroups[0] {
			if k == "id" {
				continue
			}
			spawnGroupFields[k] = v
		}

		candidates = append(candidates, spawnCandidate{
			X:                toFloat64(s2["x"]),
			Y:                toFloat64(s2["y"]),
			Z:                toFloat64(s2["z"]),
			Chance:           chance,
			SharedPool:       otherNPCCount > 0,
			Spawn2Fields:     spawn2Fields,
			SpawnGroupFields: spawnGroupFields,
		})
	}
	return candidates, nil
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

// insertRow builds a plain INSERT (never ON DUPLICATE KEY UPDATE — callers only use this for
// rows they've already established are brand new) from a dynamic field map filtered to columns
// that actually exist on the sink, with overrides taking precedence over copied source values.
// Returns the new row's auto-increment id.
func insertRow(ctx context.Context, tx *sql.Tx, table string, fields map[string]interface{}, sinkColumns map[string]bool, overrides map[string]interface{}) (int64, error) {
	merged := make(map[string]interface{}, len(fields)+len(overrides))
	for k, v := range fields {
		merged[k] = v
	}
	for k, v := range overrides {
		merged[k] = v
	}

	var columns []string
	for col := range merged {
		if sinkColumns[col] {
			columns = append(columns, col)
		}
	}
	sort.Strings(columns)

	placeholders := make([]string, len(columns))
	values := make([]interface{}, len(columns))
	for i, col := range columns {
		placeholders[i] = "?"
		values[i] = merged[col]
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)
	result, err := tx.ExecContext(ctx, query, values...)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
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

	var sinkColumns, spawnGroupColumns, spawn2Columns map[string]bool
	var tx *sql.Tx
	// claimedThisSync tracks spawn2 coordinates already committed to being created earlier in
	// this same Sync() call — necessary because sinkSpawnPointExists() queries a.sinkDB (the
	// connection pool), which can't see this transaction's own uncommitted writes, and because
	// dry runs have no transaction to check against at all. Without this, two NPCs sharing
	// nearby spawn locations (even after the shared-pool check above) could each independently
	// decide "no conflict" and create duplicate spawn points at the same coordinates.
	claimedThisSync := make(map[[3]float64]int64)
	if !options.DryRun {
		sinkColumns, err = getSinkColumns(a.ctx, a.sinkDB, "npc_types")
		if err != nil {
			return result, err
		}
		if options.SyncSpawns {
			spawnGroupColumns, err = getSinkColumns(a.ctx, a.sinkDB, "spawngroup")
			if err != nil {
				return result, err
			}
			spawn2Columns, err = getSinkColumns(a.ctx, a.sinkDB, "spawn2")
			if err != nil {
				return result, err
			}
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
		npcName := fmt.Sprintf("%v", sourceNpc.Fields["name"])

		var spawnCandidates []spawnCandidate
		if sinkNpc == nil && sourceNpc.HasSpawnPoint {
			if !options.SyncSpawns {
				result.Skipped = append(result.Skipped, SkippedNPC{
					NPCID:  id,
					Name:   npcName,
					Reason: `needs a spawn point in the sink — enable "Create spawn points" to sync it`,
				})
				continue
			}
			spawnCandidates, err = a.getSourceSpawnCandidates(options.ZoneShortName, options.ZoneVersion, id)
			if err != nil {
				return result, err
			}
			conflict := false
			for _, c := range spawnCandidates {
				if c.SharedPool {
					result.Skipped = append(result.Skipped, SkippedNPC{
						NPCID: id,
						Name:  npcName,
						Reason: fmt.Sprintf(
							"spawn point at (%.2f, %.2f, %.2f) is a shared pool with other NPCs, not a single-NPC spawn point — needs manual reconciliation",
							c.X, c.Y, c.Z),
					})
					conflict = true
					break
				}
				existingId, err := a.sinkSpawnPointExists(options.ZoneShortName, options.ZoneVersion, c.X, c.Y, c.Z)
				if err != nil {
					return result, err
				}
				if existingId != 0 {
					result.Skipped = append(result.Skipped, SkippedNPC{
						NPCID: id,
						Name:  npcName,
						Reason: fmt.Sprintf(
							"spawn point at (%.2f, %.2f, %.2f) matches existing sink spawn2 #%d — needs manual reconciliation",
							c.X, c.Y, c.Z, existingId),
					})
					conflict = true
					break
				}
				if claimed, ok := claimedThisSync[[3]float64{c.X, c.Y, c.Z}]; ok {
					result.Skipped = append(result.Skipped, SkippedNPC{
						NPCID: id,
						Name:  npcName,
						Reason: fmt.Sprintf(
							"spawn point at (%.2f, %.2f, %.2f) is also being created for NPC %d in this same sync — needs manual reconciliation",
							c.X, c.Y, c.Z, claimed),
					})
					conflict = true
					break
				}
			}
			if conflict {
				continue
			}
			for _, c := range spawnCandidates {
				claimedThisSync[[3]float64{c.X, c.Y, c.Z}] = id
			}
		}

		result.TODOItems = append(result.TODOItems, buildTODOItems(sourceNpc, sinkNpc, options.ZoneShortName)...)

		if options.DryRun {
			result.NPCsSynced = append(result.NPCsSynced, id)
			if len(spawnCandidates) > 0 {
				result.SpawnsCreatedForNPCs = append(result.SpawnsCreatedForNPCs, id)
				result.SpawnsSynced += len(spawnCandidates)
			}
			continue
		}

		if err := upsertNPC(a.ctx, tx, sourceNpc.Fields, sinkColumns); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("NPC %d: %w", id, err)
		}

		for _, c := range spawnCandidates {
			newSpawnGroupId, err := insertRow(a.ctx, tx, "spawngroup", c.SpawnGroupFields, spawnGroupColumns, nil)
			if err != nil {
				_ = tx.Rollback()
				return result, fmt.Errorf("NPC %d: creating spawngroup: %w", id, err)
			}
			if _, err := tx.ExecContext(a.ctx,
				"INSERT INTO spawnentry (spawngroupID, npcID, chance) VALUES (?, ?, ?)",
				newSpawnGroupId, id, c.Chance,
			); err != nil {
				_ = tx.Rollback()
				return result, fmt.Errorf("NPC %d: creating spawnentry: %w", id, err)
			}
			if _, err := insertRow(a.ctx, tx, "spawn2", c.Spawn2Fields, spawn2Columns, map[string]interface{}{
				"spawngroupID": newSpawnGroupId,
				"zone":         options.ZoneShortName,
				"version":      options.ZoneVersion,
				"pathgrid":     0,
			}); err != nil {
				_ = tx.Rollback()
				return result, fmt.Errorf("NPC %d: creating spawn2: %w", id, err)
			}
		}
		if len(spawnCandidates) > 0 {
			result.SpawnsCreatedForNPCs = append(result.SpawnsCreatedForNPCs, id)
			result.SpawnsSynced += len(spawnCandidates)
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

func (a *App) shutdown(ctx context.Context) {
	if a.sourceDB != nil {
		_ = a.sourceDB.Close()
	}
	if a.sinkDB != nil {
		_ = a.sinkDB.Close()
	}
}
