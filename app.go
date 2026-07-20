package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/ssh"
	"golang.org/x/crypto/ssh/knownhosts"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx          context.Context
	sourceDB     *sql.DB
	sinkDB       *sql.DB
	sourceTunnel *sshTunnel // non-nil only when the source connection is routed through SSH
	sinkTunnel   *sshTunnel
}

// SshConfig holds everything needed to open an SSH tunnel and forward the actual DB connection
// through it. AuthMethod picks which of Password/PrivateKeyPath+Passphrase is used — mirroring
// how desktop DB clients (TablePlus, DBeaver, Navicat) let a connection profile carry both but
// only ever use one at a time, rather than trying to infer intent from which fields are non-empty.
type SshConfig struct {
	Host           string
	Port           string
	Username       string
	AuthMethod     string // "password" | "privateKey"
	Password       string
	PrivateKeyPath string
	Passphrase     string // only used if the private key itself is encrypted
}

// sshTunnel bundles the local listener DB traffic is forwarded through and the SSH client that
// carries it, so both can be torn down together on reconnect/shutdown. Kept as a small struct
// (not two separate App fields) so Connect() can't accidentally close one half without the other.
type sshTunnel struct {
	listener net.Listener
	client   *ssh.Client
}

func (t *sshTunnel) Close() error {
	_ = t.listener.Close()
	return t.client.Close()
}

type Config struct {
	Source ConnectionConfig
	Sink   ConnectionConfig
	UI     UIPrefs
}

// UIPrefs persists layout preferences (sidebar/detail panel width, sidebar collapsed state)
// alongside the connection config, so "reclaim screen space to your preference" (see the sidebar
// resize/collapse feature) survives an app restart instead of resetting to defaults every launch.
// Zero values (an old config.json predating this field, or a value never explicitly set) are
// treated as "unset" by the frontend, which falls back to its own defaults — nothing here needs
// its own sentinel/omitempty handling.
type UIPrefs struct {
	SidebarWidth     int
	SidebarCollapsed bool
	DetailWidth      int
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
// "merchantid" reference. Unlike npc_faction/npc_spells, merchantlist has no separate header/
// parent row — npc_types.merchantid points straight at merchantlist rows, so there's no "profile"
// to fetch, just each side's rows by merchantid, diffed directly.
type NPCMerchantComparison struct {
	SourceId int64 // this NPC's merchantid on source; 0 if it has no merchant link there
	SinkId   int64
	Entries  []NPCMerchantEntryDiff
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
	Status       string // "new" | "modified" | "removed" | "match"
	Source       *SpawnPoint
	Sink         *SpawnPoint
	FieldsDiffer bool // true if Source/Sink spawn2 columns (its own fields) differ — the only thing "modified" status actually lets Sync fix
	PoolDiffers  bool // true if Source/Sink pool composition differs — never auto-synced, always flagged for manual review

	// Status can be "modified" from FieldsDiffer alone, PoolDiffers alone, or both — exposing them
	// separately lets the frontend tell "this row has something Sync can actually change" apart from
	// "this row only differs in its spawn entries, which Sync will never touch." Collapsing both into
	// one "modified" bucket let a user select/sync a pool-only row, get a no-op UPDATE, and believe
	// they'd handled it when the real (unsyncable) difference was still sitting there.
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
	FieldsChanged  bool // whether the spawngroup's own columns (spawn_limit, wander box, etc.) differed and were (or would be) updated
	EntriesBefore  int
	EntriesAfter   int
	OtherZoneUsage []SpawnGroupZoneUsage // non-empty means blocked — nothing was changed
	NotFound       bool                  // true if no sink spawn2 exists at this location yet
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
	SourcePool          []PoolEntry
	SinkPool            []PoolEntry
	SourceLocationCount int // spawn2 rows in this zone/version referencing SourceGroupId — informational only, doesn't drive Status
	SinkLocationCount   int
	FieldsDiffer        bool // spawngroup's own columns differ, "name" excluded — see updateSpawnGroupFields
	PoolDiffers         bool
	// Populated only when Status == "ambiguous": every distinct sink spawngroupID the source
	// spawngroup's member locations resolved to. Flagged rather than guessed at, same "shared data
	// gets flagged, not silently resolved" rule used everywhere else spawngroup data is involved.
	AmbiguousSinkGroupIds []int64
	// One matched member coordinate (only set when Status is "modified" or "match") — the same
	// X/Y/Z SyncSpawnGroup already uses to identify a spawngroup indirectly, so a row from this
	// tab can drive the exact same sync action the Spawn Points detail panel already triggers.
	SampleCoord [3]float64
}

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

// GridDiffRow mirrors SpawnDiffRow's two-flag shape (FieldsDiffer/PoolDiffers), but for grids
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

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// sshAuthMethods builds the auth method for an SSH tunnel from exactly one of Password or
// PrivateKeyPath+Passphrase, picked by AuthMethod — never both, so a connection profile that has
// leftover data in the unused field (e.g. switched from password to key auth) can't accidentally
// try the wrong one.
func sshAuthMethods(cfg SshConfig) ([]ssh.AuthMethod, error) {
	switch cfg.AuthMethod {
	case "password":
		return []ssh.AuthMethod{ssh.Password(cfg.Password)}, nil
	case "privateKey":
		keyData, err := os.ReadFile(cfg.PrivateKeyPath)
		if err != nil {
			return nil, fmt.Errorf("reading private key %q: %w", cfg.PrivateKeyPath, err)
		}
		var signer ssh.Signer
		if cfg.Passphrase != "" {
			signer, err = ssh.ParsePrivateKeyWithPassphrase(keyData, []byte(cfg.Passphrase))
		} else {
			signer, err = ssh.ParsePrivateKey(keyData)
		}
		if err != nil {
			return nil, fmt.Errorf("parsing private key %q: %w", cfg.PrivateKeyPath, err)
		}
		return []ssh.AuthMethod{ssh.PublicKeys(signer)}, nil
	default:
		return nil, fmt.Errorf("unknown SSH auth method %q", cfg.AuthMethod)
	}
}

// sshHostKeyCallback verifies the SSH server's host key against the user's own ~/.ssh/known_hosts
// — the same trust model the system `ssh`/`git` already use on this machine, deliberately not
// ssh.InsecureIgnoreHostKey(). If the host isn't already known, the callback (and therefore
// ssh.Dial) fails with a knownhosts error rather than silently trusting whatever key the server
// presents; the fix is the same one `ssh` itself would ask for — connect to the host once via a
// terminal to add it, then retry here.
func sshHostKeyCallback() (ssh.HostKeyCallback, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	knownHostsPath := filepath.Join(home, ".ssh", "known_hosts")
	callback, err := knownhosts.New(knownHostsPath)
	if err != nil {
		return nil, fmt.Errorf("reading %s (run `ssh` to the SSH host once first to add it): %w", knownHostsPath, err)
	}
	return callback, nil
}

// forwardConn splices one accepted local connection through the SSH client to remoteAddr — the
// actual port-forwarding half of the tunnel. Each accepted connection gets its own goroutine pair
// (one per direction) so a slow or stalled client can't block others sharing the same tunnel.
func forwardConn(localConn net.Conn, sshClient *ssh.Client, remoteAddr string) {
	defer func() { _ = localConn.Close() }()
	remoteConn, err := sshClient.Dial("tcp", remoteAddr)
	if err != nil {
		return
	}
	defer func() { _ = remoteConn.Close() }()

	done := make(chan struct{}, 2)
	go func() {
		_, _ = io.Copy(remoteConn, localConn)
		done <- struct{}{}
	}()
	go func() {
		_, _ = io.Copy(localConn, remoteConn)
		done <- struct{}{}
	}()
	<-done
}

// openSSHTunnel dials the SSH server in cfg, then opens a local, loopback-only listener that
// forwards every accepted connection through that SSH session to remoteHost:remotePort (the
// actual MySQL server, reachable from the SSH host's network but not directly from this machine —
// the whole reason a tunnel is needed). The returned local address is what Connect() then hands
// to sql.Open in place of the real DB host/port. The listener binds 127.0.0.1:0 (an OS-assigned
// ephemeral port on loopback only) rather than a fixed port, so multiple tunnels (source + sink)
// never collide and nothing outside this machine can reach the forwarded port directly.
func openSSHTunnel(cfg SshConfig, remoteHost, remotePort string) (*sshTunnel, string, error) {
	authMethods, err := sshAuthMethods(cfg)
	if err != nil {
		return nil, "", err
	}
	hostKeyCallback, err := sshHostKeyCallback()
	if err != nil {
		return nil, "", err
	}

	sshClientConfig := &ssh.ClientConfig{
		User:            cfg.Username,
		Auth:            authMethods,
		HostKeyCallback: hostKeyCallback,
		Timeout:         5 * time.Second,
	}

	sshAddr := net.JoinHostPort(cfg.Host, cfg.Port)
	client, err := ssh.Dial("tcp", sshAddr, sshClientConfig)
	if err != nil {
		return nil, "", fmt.Errorf("SSH connection to %s failed: %w", sshAddr, err)
	}

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		_ = client.Close()
		return nil, "", fmt.Errorf("opening local tunnel listener: %w", err)
	}

	remoteAddr := net.JoinHostPort(remoteHost, remotePort)
	go func() {
		for {
			localConn, err := listener.Accept()
			if err != nil {
				return // listener closed (tunnel torn down) — exit cleanly
			}
			go forwardConn(localConn, client, remoteAddr)
		}
	}()

	return &sshTunnel{listener: listener, client: client}, listener.Addr().String(), nil
}

func (a *App) Connect(c *ConnectionConfig, isSource bool) error {
	host, port := c.Host, c.Port

	var tunnel *sshTunnel
	if c.UseSSH {
		t, localAddr, err := openSSHTunnel(c.SshConfig, c.Host, c.Port)
		if err != nil {
			return fmt.Errorf("SSH tunnel: %w", err)
		}
		tunnel = t
		host, port, err = net.SplitHostPort(localAddr)
		if err != nil {
			_ = tunnel.Close()
			return err
		}
	}

	db, err := sql.Open("mysql", c.Username+":"+c.Password+"@tcp("+host+":"+port+")/"+c.DbName+"?timeout=5s")
	if err != nil {
		if tunnel != nil {
			_ = tunnel.Close()
		}
		return err
	}
	err = db.Ping()
	if err != nil {
		if tunnel != nil {
			_ = tunnel.Close()
		}
		return err
	}
	db.SetConnMaxLifetime(time.Minute * 3)
	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(10)

	// Close out any tunnel from a previous connection on this same side before replacing it —
	// unlike sourceDB/sinkDB (pooled, eventually GC'd), a stale tunnel is a live goroutine plus an
	// open listener that would otherwise run forever, one more of each per reconnect.
	if isSource {
		if a.sourceTunnel != nil {
			_ = a.sourceTunnel.Close()
		}
		a.sourceDB = db
		a.sourceTunnel = tunnel
	} else {
		if a.sinkTunnel != nil {
			_ = a.sinkTunnel.Close()
		}
		a.sinkDB = db
		a.sinkTunnel = tunnel
	}

	return nil
}

// PickPrivateKeyFile opens a native "choose a file" dialog for the SSH private key field, so the
// user can browse to e.g. ~/.ssh/id_rsa instead of typing the path by hand. Returns "" (no error)
// if the user cancels the dialog — the frontend treats that as "leave the field unchanged."
func (a *App) PickPrivateKeyFile() (string, error) {
	return wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: "Select SSH Private Key",
	})
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
	case float32:
		// go-sql-driver/mysql scans a SQL FLOAT column (spawn2.x/y/z in the standard EQEmu
		// schema) as Go float32, not float64, when the destination is interface{} — DOUBLE
		// columns come back as float64. Without this case, every spawn2 coordinate silently
		// zeroed out here, which is what coordKey() is built from: x/y/z all resolving to 0
		// on both databases collapses every spawn2 row onto the same map key, so CompareSpawns
		// matched every source row to whatever one sink row happened to be last into the map.
		return float64(val)
	case []byte:
		n, _ := strconv.ParseFloat(string(val), 64)
		return n
	case string:
		n, _ := strconv.ParseFloat(val, 64)
		return n
	}
	return 0
}

// spawnCoordKey is the shared coordinate-matching key for a SpawnPoint — extracted so
// CompareSpawns, SyncSpawnPoints, CompareSpawnGroups, and SyncSpawnGroup don't each redefine the
// same closure. See toFloat64's float32 case for why correct handling here specifically matters.
func spawnCoordKey(p SpawnPoint) [3]float64 {
	return [3]float64{toFloat64(p.Fields["x"]), toFloat64(p.Fields["y"]), toFloat64(p.Fields["z"])}
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

	sinkByCoord := make(map[[3]float64]SpawnPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkByCoord[spawnCoordKey(p)] = p
	}

	var diff []SpawnDiffRow
	seen := make(map[[3]float64]bool)
	for _, sp := range sourcePoints {
		key := spawnCoordKey(sp)
		sinkPoint, exists := sinkByCoord[key]
		row := SpawnDiffRow{Source: &sp}
		if !exists {
			row.Status = "new"
			diff = append(diff, row)
			continue
		}
		seen[key] = true
		row.Sink = &sinkPoint
		row.FieldsDiffer = !mapsEqual(sp.Fields, sinkPoint.Fields)
		row.PoolDiffers = !poolsEqual(sp.Pool, sinkPoint.Pool)
		if !row.FieldsDiffer && !row.PoolDiffers {
			row.Status = "match"
		} else {
			row.Status = "modified"
		}
		diff = append(diff, row)
	}
	for _, sk := range sinkPoints {
		if !seen[spawnCoordKey(sk)] {
			diff = append(diff, SpawnDiffRow{Status: "removed", Sink: &sk})
		}
	}

	return diff, nil
}

// withoutFields returns a shallow copy of m with the given keys removed — used to exclude "name"
// from spawngroup field comparisons/updates without touching mapsEqual itself (since "name" is
// meaningfully comparable content on other tables mapsEqual is used for, e.g. npc_types.name, and
// only cosmetic/local on spawngroup specifically — see EQEmu Schema Notes), and to strip
// id/npc_spells_id/spellid from npc_spells_entries rows before diffing them (see
// NPCSpellsEntryDiff). Variadic rather than one-field-at-a-time since that second case needs three
// keys stripped, not one.
func withoutFields(m map[string]interface{}, fields ...string) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	for _, f := range fields {
		delete(out, f)
	}
	return out
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
	if err := resolveOrphanedPoolNames(a.ctx, sinkPoints, a.sourceDB); err != nil {
		return nil, err
	}
	if err := resolveOrphanedPoolNames(a.ctx, sourcePoints, a.sinkDB); err != nil {
		return nil, err
	}

	sinkByCoord := make(map[[3]float64]SpawnPoint, len(sinkPoints))
	for _, p := range sinkPoints {
		sinkByCoord[spawnCoordKey(p)] = p
	}

	// A group's representative point (Fields/Pool/Name are identical across every spawn2 row
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
			SourcePool:          sg.rep.Pool,
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
			row.SinkPool = skg.rep.Pool
			row.SinkLocationCount = skg.count
			row.FieldsDiffer = !mapsEqual(withoutFields(row.SourceFields, "name"), withoutFields(row.SinkFields, "name"))
			row.PoolDiffers = !poolsEqual(row.SourcePool, row.SinkPool)
			if row.FieldsDiffer || row.PoolDiffers {
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
			SinkPool:          skg.rep.Pool,
			SinkLocationCount: skg.count,
		})
	}

	return rows, nil
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

// CompareNPCFaction fetches the npc_faction header + npc_faction_entries a specific NPC links to
// on each side, by that side's own raw npc_faction_id — not matched by ID the way spawngroup is,
// because there's nothing to match: the NPC itself (already resolved via the portable npc_types.id
// this whole app is built on) is the anchor, so each side's linked row is simply "whatever that
// side currently has," fetched independently and diffed by content. Entries are merged by
// faction_id, which — unlike npc_faction_id itself — is portable shared content (see
// NPCFactionEntryDiff), the same PoolEntry-style merge-by-portable-id shape already used for
// spawnentry (merged by npcID).
func (a *App) CompareNPCFaction(sourceFactionId, sinkFactionId int64) (NPCFactionComparison, error) {
	result := NPCFactionComparison{SourceId: sourceFactionId, SinkId: sinkFactionId}

	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	if sourceFactionId != 0 {
		fields, err := fetchNPCFactionHeader(a.ctx, a.sourceDB, sourceFactionId)
		if err != nil {
			return result, err
		}
		result.SourceFields = fields
	}
	if sinkFactionId != 0 {
		fields, err := fetchNPCFactionHeader(a.ctx, a.sinkDB, sinkFactionId)
		if err != nil {
			return result, err
		}
		result.SinkFields = fields
	}

	var sourceEntries, sinkEntries []map[string]interface{}
	if sourceFactionId != 0 {
		entries, err := fetchNPCFactionEntries(a.ctx, a.sourceDB, sourceFactionId)
		if err != nil {
			return result, err
		}
		sourceEntries = entries
	}
	if sinkFactionId != 0 {
		entries, err := fetchNPCFactionEntries(a.ctx, a.sinkDB, sinkFactionId)
		if err != nil {
			return result, err
		}
		sinkEntries = entries
	}

	sourceNames, err := resolveFactionNames(a.ctx, a.sourceDB, sourceEntries)
	if err != nil {
		return result, err
	}
	sinkNames, err := resolveFactionNames(a.ctx, a.sinkDB, sinkEntries)
	if err != nil {
		return result, err
	}

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
// against the SAME database the entries came from — mirroring resolveOrphanedPoolNames' principle
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

	if sourceSpellsId != 0 {
		fields, err := fetchNPCSpellsHeader(a.ctx, a.sourceDB, sourceSpellsId)
		if err != nil {
			return result, err
		}
		result.SourceFields = fields
	}
	if sinkSpellsId != 0 {
		fields, err := fetchNPCSpellsHeader(a.ctx, a.sinkDB, sinkSpellsId)
		if err != nil {
			return result, err
		}
		result.SinkFields = fields
	}

	var sourceEntries, sinkEntries []map[string]interface{}
	if sourceSpellsId != 0 {
		entries, err := fetchNPCSpellsEntries(a.ctx, a.sourceDB, sourceSpellsId)
		if err != nil {
			return result, err
		}
		sourceEntries = entries
	}
	if sinkSpellsId != 0 {
		entries, err := fetchNPCSpellsEntries(a.ctx, a.sinkDB, sinkSpellsId)
		if err != nil {
			return result, err
		}
		sinkEntries = entries
	}

	sourceNames, err := resolveSpellNames(a.ctx, a.sourceDB, sourceEntries)
	if err != nil {
		return result, err
	}
	sinkNames, err := resolveSpellNames(a.ctx, a.sinkDB, sinkEntries)
	if err != nil {
		return result, err
	}

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

	var sourceEntries, sinkEntries []map[string]interface{}
	if sourceMerchantId != 0 {
		entries, err := fetchMerchantEntries(a.ctx, a.sourceDB, sourceMerchantId)
		if err != nil {
			return result, err
		}
		sourceEntries = entries
	}
	if sinkMerchantId != 0 {
		entries, err := fetchMerchantEntries(a.ctx, a.sinkDB, sinkMerchantId)
		if err != nil {
			return result, err
		}
		sinkEntries = entries
	}

	sourceNames, err := resolveItemNames(a.ctx, a.sourceDB, sourceEntries)
	if err != nil {
		return result, err
	}
	sinkNames, err := resolveItemNames(a.ctx, a.sinkDB, sinkEntries)
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
func resolveItemNames(ctx context.Context, db *sql.DB, entries []map[string]interface{}) (map[int64]string, error) {
	names := make(map[int64]string)
	if len(entries) == 0 {
		return names, nil
	}
	idSet := make(map[int64]bool, len(entries))
	for _, e := range entries {
		idSet[toInt64(e["item"])] = true
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
			switch v := values[i].(type) {
			case []byte:
				fields[col] = string(v)
			case float32:
				// Widen to float64 here, once, rather than leaving the raw float32 in place.
				// A float32 round-trips through JSON to the frontend using *32-bit* shortest-
				// round-trip formatting (Go's encoding/json knows the static type), but the
				// frontend only ever produces float64s — so parsing that JSON text back gives
				// the closest float64 to that decimal string, which isn't always bit-identical
				// to float64(v) computed directly. That mismatch is invisible until something
				// compares the two for exact equality, which is exactly what spawnCoordKey does
				// when a value sent back by the frontend (e.g. SyncSpawnPoints' NewSpawnCoords)
				// needs to match a coordinate this function scanned moments earlier.
				fields[col] = float64(v)
			default:
				fields[col] = v
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
// rows this call knows nothing about. pathgrid is excluded for the same reason: grid/grid_entries
// aren't synced by anything yet, and unlike spawngroupID (a global auto-increment we already know
// not to trust), grid.id is scoped per zone but still locally assigned — blindly copying source's
// raw pathgrid could point the sink row at the wrong patrol path, or one that doesn't exist there
// at all. Once a Grids tab makes grid.id trustworthy within a zone, this can be reconsidered.
func updateSpawn2(ctx context.Context, tx *sql.Tx, sinkId int64, sourceFields map[string]interface{}, sinkColumns map[string]bool) error {
	var columns []string
	for col := range sourceFields {
		if col == "pathgrid" {
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
	values[len(columns)] = sinkId

	query := fmt.Sprintf("UPDATE spawn2 SET %s WHERE id = ?", strings.Join(setClauses, ", "))
	_, err := tx.ExecContext(ctx, query, values...)
	return err
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
							"spawn point at (%.2f, %.2f, %.2f) uses a shared spawngroup (other NPCs too), not a single-NPC spawn point — needs manual reconciliation",
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

	sourceByCoord := make(map[[3]float64]SpawnPoint, len(sourcePoints))
	for _, p := range sourcePoints {
		sourceByCoord[spawnCoordKey(p)] = p
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
		sourcePoint, ok := sourceByCoord[spawnCoordKey(sinkPoint)]
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
			reason := "source spawngroup has no spawn entries"
			if len(sourcePoint.Pool) > 1 {
				reason = "uses a shared spawngroup (other NPCs too), not a single-NPC spawn point — needs manual reconciliation"
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
	result.EntriesBefore = len(sinkPoint.Pool)
	result.EntriesAfter = len(sourcePoint.Pool)
	result.FieldsChanged = !mapsEqual(
		withoutFields(sourcePoint.SpawnGroupFields, "name"),
		withoutFields(sinkPoint.SpawnGroupFields, "name"),
	)

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
	if err := updateSpawnGroupFields(a.ctx, tx, sinkPoint.SpawnGroupId, sourcePoint.SpawnGroupFields, sinkColumns); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("updating spawngroup fields: %w", err)
	}
	if _, err := tx.ExecContext(a.ctx, "DELETE FROM spawnentry WHERE spawngroupID = ?", sinkPoint.SpawnGroupId); err != nil {
		_ = tx.Rollback()
		return result, fmt.Errorf("clearing existing spawn entries: %w", err)
	}
	for _, entry := range sourcePoint.Pool {
		if _, err := tx.ExecContext(a.ctx,
			"INSERT INTO spawnentry (spawngroupID, npcID, chance) VALUES (?, ?, ?)",
			sinkPoint.SpawnGroupId, entry.NPCID, entry.Chance,
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
// shared-pool class of risk to guard against before creating one).
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

func (a *App) shutdown(ctx context.Context) {
	if a.sourceDB != nil {
		_ = a.sourceDB.Close()
	}
	if a.sinkDB != nil {
		_ = a.sinkDB.Close()
	}
	if a.sourceTunnel != nil {
		_ = a.sourceTunnel.Close()
	}
	if a.sinkTunnel != nil {
		_ = a.sinkTunnel.Close()
	}
}
