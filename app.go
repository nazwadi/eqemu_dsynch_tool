package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
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
	ID          int64  // stable identity, assigned/backfilled by appendTODOItems — needed to dismiss one specific item
	Dismissed   bool   // archived, not deleted — hidden from the default view, recoverable
	Type        string // "loottable", "faction", "spells"
	SourceID    int64
	SinkID      int64
	NPCID       int64
	NPCName     string
	ZoneName    string
	ZoneVersion int8 // zone.version — ZoneName alone isn't unique, same reason GetNPCsForZone needs it
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
	NPCID            int64 // the pool's sole NPC once SharedPool is confirmed false — self-contained so createSpawnPoint doesn't need a separate parameter
	Chance           int64
	SharedPool       bool // true if source's spawngroup has spawnentries for OTHER NPCs too — a weighted pool, not a single-NPC spawn point
	Spawn2Fields     map[string]interface{}
	SpawnGroupFields map[string]interface{}
}

// PoolEntry is one NPC in a spawn point's weighted pool (a spawngroup's spawnentry rows).
type PoolEntry struct {
	NPCID    int64
	NPCName  string // resolved against the database this pool was fetched from; if Orphaned, recovered from the OTHER database instead
	Chance   int64
	Orphaned bool // true if npcID didn't resolve to a real npc_types row in the database this was fetched from
}

// SpawnPoint is one spawn2 row plus its linked spawngroup settings and full pool. Unlike NPC,
// identity across databases is coordinates (Fields["x"/"y"/"z"]), not Id — see the Spawn point
// identity note in CLAUDE.md for why.
type SpawnPoint struct {
	Id                  int64
	SpawnGroupId        int64
	SpawnGroupFields    map[string]interface{} // dynamic spawngroup columns, minus id — includes "name"
	LocationSharedCount int                    // OTHER spawn2 rows (this zone/version) sharing this spawngroupID — drives the "shared ×N" badge
	Fields              map[string]interface{} // dynamic spawn2 columns, minus id/spawngroupID
	Pool                []PoolEntry
}

// SpawnDiffRow mirrors NPCDiffRow, but matched by coordinate (see SpawnPoint) not ID.
type SpawnDiffRow struct {
	Status      string // "new" | "modified" | "removed" | "match"
	Source      *SpawnPoint
	Sink        *SpawnPoint
	PoolDiffers bool // true if Source/Sink pool composition differs — never auto-synced, always flagged for manual review
}

type SpawnSyncOptions struct {
	ZoneShortName  string
	ZoneVersion    int8
	DryRun         bool
	SpawnIds       []int64      // sink spawn2.id — "modified" rows being synced (UPDATE spawn2's own columns only, spawngroupID untouched)
	NewSpawnCoords [][3]float64 // source (x,y,z) — "new" rows being synced (CREATE spawngroup+spawnentry+spawn2, same machinery as per-NPC creation)
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

// CompareSpawns diffs spawn2 rows for a zone/version, matched by exact (x,y,z) coordinate —
// spawn2/spawngroup IDs aren't meaningful across databases (see Spawn point identity in
// CLAUDE.md), the same reason per-NPC spawn creation matches by coordinate instead of ID.
// Pool (spawngroup+spawnentry) differences never affect Status directly beyond "modified" —
// they're surfaced via PoolDiffers instead, since pool composition is never auto-synced (see
// SyncSpawnPoints) regardless of whether the row itself is new or modified.
func (a *App) CompareSpawns(shortName string, version int8) ([]SpawnDiffRow, error) {
	sourcePoints, err := getSpawnPointsForZone(a.ctx, a.sourceDB, shortName, version)
	if err != nil {
		return nil, err
	}
	sinkPoints, err := getSpawnPointsForZone(a.ctx, a.sinkDB, shortName, version)
	if err != nil {
		return nil, err
	}
	if err := resolveOrphanedPoolNames(a.ctx, sinkPoints, a.sourceDB); err != nil {
		return nil, err
	}
	if err := resolveOrphanedPoolNames(a.ctx, sourcePoints, a.sinkDB); err != nil {
		return nil, err
	}

	coordKey := func(p SpawnPoint) [3]float64 {
		return [3]float64{toFloat64(p.Fields["x"]), toFloat64(p.Fields["y"]), toFloat64(p.Fields["z"])}
	}
	sinkByCoord := make(map[[3]float64]SpawnPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkByCoord[coordKey(p)] = p
	}

	var diff []SpawnDiffRow
	seen := make(map[[3]float64]bool)
	for _, sp := range sourcePoints {
		key := coordKey(sp)
		sinkPoint, exists := sinkByCoord[key]
		row := SpawnDiffRow{Source: &sp}
		if !exists {
			row.Status = "new"
			diff = append(diff, row)
			continue
		}
		seen[key] = true
		row.Sink = &sinkPoint
		row.PoolDiffers = !poolsEqual(sp.Pool, sinkPoint.Pool)
		if mapsEqual(sp.Fields, sinkPoint.Fields) && !row.PoolDiffers {
			row.Status = "match"
		} else {
			row.Status = "modified"
		}
		diff = append(diff, row)
	}
	for _, sk := range sinkPoints {
		if !seen[coordKey(sk)] {
			diff = append(diff, SpawnDiffRow{Status: "removed", Sink: &sk})
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

func buildTODOItems(sourceNpc NPC, sinkNpc *NPC, zoneShortName string, zoneVersion int8) []TODOItem {
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

// todoDedupKey identifies "the same underlying thing to review" — zone/version isn't part of
// it deliberately: a shared loot/faction/spells reference doesn't stop being the same review
// item just because it was discovered via a different zone's sync.
type todoDedupKey struct {
	Type     string
	NPCID    int64
	SourceID int64
}

// appendTODOItems merges newly-found items into the persisted archive rather than blindly
// appending. Two things it must not do: duplicate an item that's already there (re-syncing the
// same NPC would otherwise double up its TODOs forever), and never touch Dismissed on an
// existing item — a re-sync shouldn't silently un-archive something already reviewed. It also
// backfills ID on any pre-existing entries written before ID existed, since without a stable ID
// there's nothing for SetTODOItemDismissed to target.
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

	var nextID int64 = 1
	seen := make(map[todoDedupKey]bool, len(existing))
	for _, item := range existing {
		if item.ID >= nextID {
			nextID = item.ID + 1
		}
		seen[todoDedupKey{item.Type, item.NPCID, item.SourceID}] = true
	}
	for i := range existing {
		if existing[i].ID == 0 {
			existing[i].ID = nextID
			nextID++
		}
	}

	for _, item := range items {
		key := todoDedupKey{item.Type, item.NPCID, item.SourceID}
		if seen[key] {
			continue
		}
		item.ID = nextID
		nextID++
		existing = append(existing, item)
		seen[key] = true
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.Marshal(existing)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// LoadTODOItems returns the full persisted TODO archive, dismissed items included — the
// frontend filters for display. Returns an empty (not nil-error) list if the file doesn't exist
// yet, since "no TODOs recorded" isn't a failure.
func (a *App) LoadTODOItems() ([]TODOItem, error) {
	path, err := todoPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var items []TODOItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}
	return items, nil
}

// SetTODOItemDismissed archives or un-archives one TODO item by ID. Archiving never deletes —
// same "recoverable, not destructive" principle used everywhere else in this app.
func (a *App) SetTODOItemDismissed(id int64, dismissed bool) error {
	path, err := todoPath()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var items []TODOItem
	if err := json.Unmarshal(data, &items); err != nil {
		return err
	}
	found := false
	for i := range items {
		if items[i].ID == id {
			items[i].Dismissed = dismissed
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("TODO item %d not found", id)
	}
	updated, err := json.Marshal(items)
	if err != nil {
		return err
	}
	return os.WriteFile(path, updated, 0644)
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

// inClausePlaceholders builds the "?,?,?" placeholder string and the matching []interface{}
// args slice for a dynamic-length SQL IN (...) clause.
func inClausePlaceholders(ids []int64) (string, []interface{}) {
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	return placeholders, args
}

// getSpawnPointsForZone fetches every spawn2 row for a zone/version from one database, along
// with each one's spawngroup settings and full spawnentry pool (NPC names resolved against
// this same database — see resolveOrphanedPoolNames for the cross-database fallback). Batches
// into exactly 3 queries regardless of how many spawn points the zone has: one for spawn2, one
// for the distinct spawngroups referenced, one for all their pool entries. N+1-per-spawn-point
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
	poolEntryRows, err := scanDynamicRows(peRows)
	_ = peRows.Close()
	if err != nil {
		return nil, err
	}
	poolByGroup := make(map[int64][]PoolEntry)
	for _, pe := range poolEntryRows {
		gid := toInt64(pe["spawngroupID"])
		orphaned := pe["npc_name"] == nil
		name := ""
		if !orphaned {
			name = fmt.Sprintf("%v", pe["npc_name"])
		}
		poolByGroup[gid] = append(poolByGroup[gid], PoolEntry{
			NPCID:    toInt64(pe["npcID"]),
			NPCName:  name,
			Chance:   toInt64(pe["chance"]),
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
		points = append(points, SpawnPoint{
			Id:                  toInt64(s2["id"]),
			SpawnGroupId:        gid,
			SpawnGroupFields:    spawnGroupFieldsById[gid],
			LocationSharedCount: sharedCount[gid] - 1, // "other" locations, not counting this one
			Fields:              fields,
			Pool:                poolByGroup[gid],
		})
	}
	return points, nil
}

// resolveOrphanedPoolNames looks up any pool entry that didn't resolve against the database it
// was fetched from (Orphaned=true) in the OTHER database instead. This is the concrete answer
// to "what did a corrupted spawnentry used to point to": if the NPC was deleted in exactly one
// of the two databases, the other one is still the intact copy, not a guess. If neither database
// can resolve it, NPCName is left empty — genuinely lost, not something to fabricate.
func resolveOrphanedPoolNames(ctx context.Context, points []SpawnPoint, otherDB *sql.DB) error {
	missingSet := make(map[int64]bool)
	for _, p := range points {
		for _, pe := range p.Pool {
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
		for j := range points[i].Pool {
			if points[i].Pool[j].Orphaned {
				if name, ok := names[points[i].Pool[j].NPCID]; ok {
					points[i].Pool[j].NPCName = name
				}
			}
		}
	}
	return nil
}

// poolsEqual compares two spawn points' pools by (NPCID -> Chance), ignoring order. Safe to key
// by NPCID alone since spawnentry's primary key is (spawngroupID, npcID) — no duplicates within
// one pool.
func poolsEqual(a, b []PoolEntry) bool {
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

// spawnCandidatesForNPC filters an already-fetched zone's worth of spawn points down to the
// ones containing npcId, in the spawnCandidate shape the creation path (used by both Sync()'s
// per-NPC path and SyncSpawnPoints' "new" path) needs. Deliberately takes pre-fetched points
// rather than querying itself — Sync() fetches the zone's spawn points once, not once per NPC
// being synced, for the same reason getSpawnPointsForZone batches its own queries.
func spawnCandidatesForNPC(points []SpawnPoint, npcId int64) []spawnCandidate {
	var candidates []spawnCandidate
	for _, p := range points {
		var chance int64
		found := false
		for _, pe := range p.Pool {
			if pe.NPCID == npcId {
				chance = pe.Chance
				found = true
				break
			}
		}
		if !found {
			continue
		}
		candidates = append(candidates, spawnCandidate{
			X:                toFloat64(p.Fields["x"]),
			Y:                toFloat64(p.Fields["y"]),
			Z:                toFloat64(p.Fields["z"]),
			NPCID:            npcId,
			Chance:           chance,
			SharedPool:       len(p.Pool) > 1,
			Spawn2Fields:     p.Fields,
			SpawnGroupFields: p.SpawnGroupFields,
		})
	}
	return candidates
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

const mysqlErrDupEntry = 1062

// isDuplicateEntryError reports whether err is MySQL's "Duplicate entry ... for key" error —
// used to detect a UNIQUE constraint collision (e.g. spawngroup.name) specifically, as opposed
// to any other reason an INSERT might fail.
func isDuplicateEntryError(err error) bool {
	var mysqlErr *mysql.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == mysqlErrDupEntry
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

// createSpawnPoint creates a fresh single-NPC spawngroup/spawnentry/spawn2 chain in the sink for
// one spawn candidate — the machinery shared by Sync()'s per-NPC creation path and
// SyncSpawnPoints' "new" path. Caller must have already confirmed !SharedPool and that no
// conflicting sink spawn2 exists at these coordinates; this function doesn't re-check either.
func createSpawnPoint(ctx context.Context, tx *sql.Tx, zone string, version int8, c spawnCandidate, spawnGroupColumns, spawn2Columns map[string]bool) error {
	// spawngroup.name is UNIQUE on both databases, but source's own name is never guaranteed to
	// be free in the sink — it's an auto-generated "Nth group created for this zone" label, local
	// creation history, not shared content identity (same trap as spawngroup.id/spawn2.id). Try
	// it verbatim first, since matching source exactly is the goal whenever nothing prevents it;
	// only disambiguate if sink already has an unrelated group with that same name.
	newSpawnGroupId, err := insertRow(ctx, tx, "spawngroup", c.SpawnGroupFields, spawnGroupColumns, nil)
	if err != nil && isDuplicateEntryError(err) {
		newSpawnGroupId, err = insertRow(ctx, tx, "spawngroup", c.SpawnGroupFields, spawnGroupColumns, map[string]interface{}{
			"name": fmt.Sprintf("%v_npc%d", c.SpawnGroupFields["name"], c.NPCID),
		})
	}
	if err != nil {
		return fmt.Errorf("creating spawngroup: %w", err)
	}
	if _, err := tx.ExecContext(ctx,
		"INSERT INTO spawnentry (spawngroupID, npcID, chance) VALUES (?, ?, ?)",
		newSpawnGroupId, c.NPCID, c.Chance,
	); err != nil {
		return fmt.Errorf("creating spawnentry: %w", err)
	}
	// pathgrid forced to 0 rather than copying source's value — grid/grid_entries aren't synced,
	// so a copied pathgrid would be a dangling reference to a grid row that doesn't exist in the
	// sink. NPC spawns, just doesn't patrol.
	if _, err := insertRow(ctx, tx, "spawn2", c.Spawn2Fields, spawn2Columns, map[string]interface{}{
		"spawngroupID": newSpawnGroupId,
		"zone":         zone,
		"version":      version,
		"pathgrid":     0,
	}); err != nil {
		return fmt.Errorf("creating spawn2: %w", err)
	}
	return nil
}

// updateSpawn2 updates an existing sink spawn2 row's own columns to match source. Never touches
// spawngroupID — pool composition differences are always flagged (see CompareSpawns'
// PoolDiffers), never applied by this function, since a spawngroup can be shared by other spawn2
// rows this call knows nothing about.
func updateSpawn2(ctx context.Context, tx *sql.Tx, sinkId int64, sourceFields map[string]interface{}, sinkColumns map[string]bool) error {
	var columns []string
	for col := range sourceFields {
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
	values[len(columns)] = sinkId

	query := fmt.Sprintf("UPDATE spawn2 SET %s WHERE id = ?", strings.Join(setClauses, ", "))
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

	// Fetched once for the whole zone, not once per NPC — this loop can process many NPCs in one
	// call, and getSpawnPointsForZone already batches its own queries per-zone; calling it inside
	// the loop would multiply that batching by NPC count instead of avoiding N+1 altogether.
	var sourceSpawnPoints []SpawnPoint
	if options.SyncSpawns {
		sourceSpawnPoints, err = getSpawnPointsForZone(a.ctx, a.sourceDB, options.ZoneShortName, options.ZoneVersion)
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
			spawnCandidates = spawnCandidatesForNPC(sourceSpawnPoints, id)
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

		result.TODOItems = append(result.TODOItems, buildTODOItems(sourceNpc, sinkNpc, options.ZoneShortName, options.ZoneVersion)...)

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
			if err := createSpawnPoint(a.ctx, tx, options.ZoneShortName, options.ZoneVersion, c, spawnGroupColumns, spawn2Columns); err != nil {
				_ = tx.Rollback()
				return result, fmt.Errorf("NPC %d: %w", id, err)
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

// SyncSpawnPoints is the Spawn Points tab's own sync action — deliberately separate from Sync(),
// same reasoning as the TODO tab being its own self-contained concern rather than merged into
// NPC sync: keeps each transaction's blast radius scoped to one kind of change. Same dry-run/
// execute duality as Sync(). "Modified" rows only ever update spawn2's own columns (never
// spawngroupID — see updateSpawn2); "new" rows reuse createSpawnPoint, the exact machinery
// Sync()'s per-NPC path already uses, so both entry points to "create a spawn point" share one
// implementation.
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

	coordKey := func(p SpawnPoint) [3]float64 {
		return [3]float64{toFloat64(p.Fields["x"]), toFloat64(p.Fields["y"]), toFloat64(p.Fields["z"])}
	}
	sourceByCoord := make(map[[3]float64]SpawnPoint, len(sourcePoints))
	for _, p := range sourcePoints {
		sourceByCoord[coordKey(p)] = p
	}
	sinkById := make(map[int64]SpawnPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkById[p.Id] = p
	}

	var spawn2Columns, spawnGroupColumns map[string]bool
	var tx *sql.Tx
	if !options.DryRun {
		spawn2Columns, err = getSinkColumns(a.ctx, a.sinkDB, "spawn2")
		if err != nil {
			return result, err
		}
		spawnGroupColumns, err = getSinkColumns(a.ctx, a.sinkDB, "spawngroup")
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
		sourcePoint, ok := sourceByCoord[coordKey(sinkPoint)]
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf("spawn2 #%d: no matching source spawn point at its coordinates", sinkId))
			continue
		}
		if options.DryRun {
			result.Updated++
			continue
		}
		if err := updateSpawn2(a.ctx, tx, sinkId, sourcePoint.Fields, spawn2Columns); err != nil {
			_ = tx.Rollback()
			return result, fmt.Errorf("spawn2 #%d: %w", sinkId, err)
		}
		result.Updated++
	}

	// claimed tracks coordinates already committed to being created earlier in this same call —
	// same reasoning as Sync()'s claimedThisSync: sinkSpawnPointExists() can't see this
	// transaction's own uncommitted writes, and dry runs have no transaction to check at all.
	claimed := make(map[[3]float64]bool)
	for _, coord := range options.NewSpawnCoords {
		sourcePoint, ok := sourceByCoord[coord]
		if !ok {
			result.Errors = append(result.Errors, fmt.Sprintf(
				"spawn point at (%.2f, %.2f, %.2f): not found in source zone data", coord[0], coord[1], coord[2]))
			continue
		}
		if len(sourcePoint.Pool) != 1 {
			reason := "source pool is empty"
			if len(sourcePoint.Pool) > 1 {
				reason = "shared pool with other NPCs, not a single-NPC spawn point — needs manual reconciliation"
			}
			result.Skipped = append(result.Skipped, SkippedSpawn{X: coord[0], Y: coord[1], Z: coord[2], Reason: reason})
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
		npc := sourcePoint.Pool[0]
		candidate := spawnCandidate{
			X: coord[0], Y: coord[1], Z: coord[2],
			NPCID:            npc.NPCID,
			Chance:           npc.Chance,
			Spawn2Fields:     sourcePoint.Fields,
			SpawnGroupFields: sourcePoint.SpawnGroupFields,
		}
		if err := createSpawnPoint(a.ctx, tx, options.ZoneShortName, options.ZoneVersion, candidate, spawnGroupColumns, spawn2Columns); err != nil {
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

func (a *App) shutdown(ctx context.Context) {
	if a.sourceDB != nil {
		_ = a.sourceDB.Close()
	}
	if a.sinkDB != nil {
		_ = a.sinkDB.Close()
	}
}
