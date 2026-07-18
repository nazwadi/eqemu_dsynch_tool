package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
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
	Id     int64
	Fields map[string]interface{}
}

type NPCDiffRow struct {
	Status string
	Source *NPC
	Sink   *NPC
}

type SyncOptions struct {
	ZoneShortName string
	SyncNPCTypes  bool
	SyncSpawns    bool
	DryRun        bool
	NPCIds        []int64 // empty means all NPCs in zone
}

type SyncResult struct {
	DryRun       bool
	NPCsSynced   []int64
	SpawnsSynced int
	TODOItems    []string
	Errors       []string
}

type TODOItem struct {
	Type     string // "loottable", "faction", "spells"
	SourceID int64
	SinkID   int64
	NPCID    int64
	NPCName  string
	ZoneName string
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
	db, err := sql.Open("mysql", c.Username+":"+c.Password+"@tcp("+c.Host+":"+c.Port+")/"+c.DbName)
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
	return os.WriteFile(path, data, 0644)
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

func (a *App) GetNPCsForZone(shortName string, isSource bool) ([]NPC, error) {
	db := a.sourceDB
	if !isSource {
		db = a.sinkDB
	}
	rows, err := db.QueryContext(a.ctx, `
		SELECT nt.*
		FROM npc_types nt
		    JOIN spawnentry se ON se.npcID = nt.id
		    JOIN spawngroup sg ON sg.id = se.spawngroupID
		    JOIN spawn2 s2 ON s2.spawngroupID = sg.id
		WHERE s2.zone = ?
		GROUP BY nt.id
		ORDER BY nt.Name
		`, shortName)
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

		npc := NPC{
			Id:     toInt64(fields["id"]),
			Fields: fields,
		}
		npcs = append(npcs, npc)
	}
	return npcs, nil
}

func (a *App) CompareZones(shortName string) ([]NPCDiffRow, error) {
	// Call GetNPCsForZone for source and sink
	sourceNpcs, err := a.GetNPCsForZone(shortName, true)
	if err != nil {
		return nil, err
	}
	sinkNpcs, err := a.GetNPCsForZone(shortName, false)
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

func (a *App) shutdown(ctx context.Context) {
	if a.sourceDB != nil {
		_ = a.sourceDB.Close()
	}
	if a.sinkDB != nil {
		_ = a.sinkDB.Close()
	}
}
