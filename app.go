package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
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
	Id    int64
	Name  string
	Level int8
	HP    int64
	Race  int64
	Class int64
}

type NPCDiffRow struct {
	Status string
	Source *NPC
	Sink   *NPC
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

func (a *App) SaveConfig(c *Config) error {
	path, err := configPath()
	if err != nil {
		return err
	}
	os.MkdirAll(filepath.Dir(path), 0755)

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
		SELECT nt.id, nt.name, nt.level, nt.hp, nt.race, nt.class
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
	defer rows.Close()
	var npcs []NPC
	for rows.Next() {
		var npc NPC
		if err := rows.Scan(
			&npc.Id,
			&npc.Name,
			&npc.Level,
			&npc.HP,
			&npc.Race,
			&npc.Class,
		); err != nil {
			return nil, err
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
	for _, sourceNpc := range sourceNpcs {
		sinkNpc, exists := m[sourceNpc.Id]
		if exists {
			seen[sinkNpc.Id] = true
			if reflect.DeepEqual(sourceNpc, sinkNpc) {
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
