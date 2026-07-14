package main

import (
	"context"
	"database/sql"
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

func (a *App) GetNPCsForZone(shortName string) ([]NPC, error) {
	rows, err := a.sourceDB.QueryContext(a.ctx, `
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

func (a *App) shutdown(ctx context.Context) {
	if a.sourceDB != nil {
		_ = a.sourceDB.Close()
	}
	if a.sinkDB != nil {
		_ = a.sinkDB.Close()
	}
}
