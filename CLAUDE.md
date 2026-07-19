# EQEmu Data Sync Tool — Project Context for Claude Code

## Project Overview
A Wails v2 desktop app (Go backend + React frontend) for syncing EverQuest Emulator (EQEmu) database content between two MariaDB databases. Think of it as a domain-aware Navicat Data Synchronization tool that understands the EQEmu schema.

## Tech Stack
- **Backend**: Go with Wails v2, `go-sql-driver/mysql`
- **Frontend**: React + Tailwind CSS v4 + Vite
- **Platform**: Mac (M1), developed with `wails dev`
- **Node**: v22.23.1 (via nvm — must use `nvm use 22` before running)

## Project Structure
```
eqemu_dsynch_tool/
├── main.go          # Wails app entry, registers App struct
├── app.go           # All Go backend logic
├── app_test.go      # Go unit tests (currently just TestToFloat64)
└── frontend/
    └── src/
        ├── App.jsx        # Shell: state, business-logic functions, layout — 910 lines as of SSH tunnel support (2026-07-19), grown back up from the 558-line low right after the component split
        ├── lib/            # Pure helpers/constants, no React or component state
        │   ├── constants.js
        │   ├── npcHelpers.js
        │   ├── spawnHelpers.js
        │   ├── gridHelpers.js
        │   └── spawnGroupHelpers.js
        └── components/     # Presentational components, one per modal/drawer/tab/panel
            ├── ConnectModal.jsx, ConfirmSyncModal.jsx, ConfirmSpawnSyncModal.jsx,
            │   SpawnHelpDrawer.jsx, ConfirmSpawnGroupSyncModal.jsx, ConfirmGridSyncModal.jsx
            ├── Sidebar.jsx
            └── NpcsTab.jsx, SpawnsTab.jsx, TodoTab.jsx, GridsTab.jsx, SpawngroupsTab.jsx, DetailPanel.jsx
```

## Go Backend (app.go) — Key Types

```go
type App struct {
    ctx          context.Context
    sourceDB     *sql.DB
    sinkDB       *sql.DB
    sourceTunnel *sshTunnel  // non-nil only when that side's connection is routed through SSH — added 2026-07-19
    sinkTunnel   *sshTunnel
}

// SshConfig holds everything needed to open an SSH tunnel and forward the real DB connection
// through it. AuthMethod picks which of Password/PrivateKeyPath+Passphrase is actually used —
// never inferred from which fields are non-empty, so a profile that's been switched from one auth
// method to the other doesn't silently try stale leftover data in the unused field.
type SshConfig struct {
    Host           string
    Port           string
    Username       string
    AuthMethod     string  // "password" | "privateKey"
    Password       string
    PrivateKeyPath string
    Passphrase     string  // only used if the private key itself is encrypted
}

// sshTunnel bundles the local listener DB traffic is forwarded through and the SSH client
// carrying it, so both are always closed together — see Connect()/shutdown() in Key Functions.
type sshTunnel struct {
    listener net.Listener
    client   *ssh.Client
}

type ConnectionConfig struct {
    DbName, Host, Port, Username, Password string
    UseSSH    bool
    SshConfig SshConfig
}

type Config struct {
    Source ConnectionConfig
    Sink   ConnectionConfig
    UI     UIPrefs  // added 2026-07-19 — layout prefs (sidebar/detail width, sidebar collapsed), see Repo Meta
}

// UIPrefs persists layout preferences alongside the connection config, so the resizable/
// collapsible sidebar and detail panel survive an app restart instead of resetting to defaults
// every launch. Zero values (an old config.json predating this field, or a value never explicitly
// set) are treated as "unset" by the frontend, which falls back to its own hardcoded defaults.
type UIPrefs struct {
    SidebarWidth     int
    SidebarCollapsed bool
    DetailWidth      int
}

type Zone struct {
    Id, ZoneIdNumber int64
    Version          int8
    ShortName, LongName string
}

type NPC struct {
    Id            int64
    HasSpawnPoint bool  // false = discovered via zone-ID-range fallback only (quest-spawned, no static spawn2 row)
    Fields        map[string]interface{}  // all npc_types columns dynamically
}

type NPCDiffRow struct {
    Status string  // "match", "modified", "new", "removed"
    Source *NPC
    Sink   *NPC
}

type SyncOptions struct {
    ZoneShortName string
    ZoneVersion   int8  // zone.version — short_name is NOT unique alone, see EQEmu Schema Notes
    ZoneIdNumber  int64  // zone.zoneidnumber — used for the quest-spawned-NPC ID-range fallback, see EQEmu Schema Notes
    SyncNPCTypes  bool
    SyncSpawns    bool
    DryRun        bool
    NPCIds        []int64  // empty = all NPCs in zone
}

type SyncResult struct {
    DryRun               bool
    NPCsSynced           []int64
    SpawnsSynced         int          // count of spawn2 rows created (or, on dry run, that would be created)
    SpawnsCreatedForNPCs []int64      // subset of NPCsSynced getting a spawn point — drives the preview/confirm UI
    Skipped              []SkippedNPC // NPCs deliberately not synced — every NPCId ends up in exactly one of NPCsSynced or Skipped
    TODOItems            []TODOItem
    Errors               []string     // genuine unexpected failures only — never a deliberate skip, see SkippedNPC
}

type SkippedNPC struct {
    NPCID  int64
    Name   string
    Reason string
}

type TODOItem struct {
    ID          int64   // stable identity, assigned/backfilled by appendTODOItems
    Dismissed   bool    // archived, not deleted — hidden from default view, recoverable
    Type        string  // "loottable", "faction", "spells", "merchant", "alt_currency"
    SourceID    int64
    SinkID      int64
    NPCID       int64
    NPCName     string
    ZoneName    string
    ZoneVersion int8    // ZoneName alone isn't unique — same reason GetNPCsForZone needs it
}

// PoolEntry is one NPC in a spawn point's weighted pool (a spawngroup's spawnentry rows).
type PoolEntry struct {
    NPCID    int64
    NPCName  string  // resolved against the database this pool was fetched from; if Orphaned, recovered from the OTHER database instead
    Chance   int64
    Orphaned bool  // true if npcID didn't resolve to a real npc_types row in the database this was fetched from
}

// SpawnPoint is one spawn2 row plus its linked spawngroup settings and full pool. Identity
// across databases is coordinates (Fields["x"/"y"/"z"]), not Id — see "Spawn point identity" below.
type SpawnPoint struct {
    Id                  int64
    SpawnGroupId        int64
    SpawnGroupFields    map[string]interface{}  // dynamic spawngroup columns, minus id — includes "name"
    LocationSharedCount int                     // OTHER spawn2 rows (this zone/version) sharing this spawngroupID — drives the "shared ×N" badge
    Fields              map[string]interface{}  // dynamic spawn2 columns, minus id/spawngroupID
    Pool                []PoolEntry
}

// SpawnDiffRow mirrors NPCDiffRow, but matched by coordinate (see SpawnPoint) not ID.
type SpawnDiffRow struct {
    Status       string  // "new" | "modified" | "removed" | "match"
    Source       *SpawnPoint
    Sink         *SpawnPoint
    FieldsDiffer bool  // true if Source/Sink spawn2 columns differ — the only thing "modified" status actually lets Sync fix
    PoolDiffers  bool  // true if Source/Sink pool composition differs — never auto-synced, always flagged for manual review
    // Status can be "modified" from FieldsDiffer alone, PoolDiffers alone, or both — see the
    // "modified doesn't always mean syncable" note under Important Frontend Implementation Details.
}

type SpawnSyncOptions struct {
    ZoneShortName  string
    ZoneVersion    int8
    DryRun         bool
    SpawnIds       []int64       // sink spawn2.id — "modified" rows being synced (UPDATE spawn2's own columns only, spawngroupID untouched)
    NewSpawnCoords [][3]float64  // source (x,y,z) — "new" rows being synced (CREATE spawngroup+spawnentry+spawn2, same machinery as per-NPC creation)
}

// SkippedSpawn mirrors SkippedNPC's "declined, not failed" shape for the spawn points tab —
// a separate type since a skip here is about a location, not an NPC.
type SkippedSpawn struct {
    X, Y, Z float64
    Reason  string
}

type SpawnSyncResult struct {
    DryRun  bool
    Created int  // new spawn points created, or would be on dry run
    Updated int  // existing spawn points updated, or would be on dry run
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
    X, Y, Z       float64  // identifies the spawn2 location whose spawngroup is being synced
    DryRun        bool
}

// SpawnGroupSyncResult covers both halves of what SyncSpawnGroup writes — a spawngroup's own
// fields and its full spawnentry roster — since 2026-07-19 they're synced together as one action
// (previously entries-only; see Repo Meta for why this was generalized rather than left separate).
type SpawnGroupSyncResult struct {
    DryRun         bool
    SpawnGroupName string
    FieldsChanged  bool  // whether the spawngroup's own columns (spawn_limit, wander box, etc.) differed and were (or would be) updated
    EntriesBefore  int
    EntriesAfter   int
    OtherZoneUsage []SpawnGroupZoneUsage  // non-empty means blocked — nothing was changed
    NotFound       bool                   // true if no sink spawn2 exists at this location yet
}

// SpawnGroupDiffRow is the row shape for the Spawngroups tab (added 2026-07-19) — one spawngroup
// per row, unlike SpawnDiffRow's one-row-per-spawn2-location. A source spawngroup is matched to a
// sink one indirectly: by checking which sink spawngroup(s) are referenced at the source
// spawngroup's own member spawn2 coordinates in this zone — the same coordinate-identity mechanism
// every other spawngroup lookup in this app already relies on, since spawngroupID isn't portable
// across databases (see "Spawn point identity" below).
type SpawnGroupDiffRow struct {
    Status                string  // "new" | "modified" | "removed" | "match" | "ambiguous"
    SourceGroupId         int64
    SinkGroupId           int64
    Name                  string  // source's name if this spawngroup exists there, else sink's — cosmetic/local, never diffed
    SourceFields          map[string]interface{}  // spawngroup columns, minus id — includes name
    SinkFields            map[string]interface{}
    SourcePool            []PoolEntry
    SinkPool              []PoolEntry
    SourceLocationCount   int  // spawn2 rows in this zone/version referencing SourceGroupId — informational only, doesn't drive Status
    SinkLocationCount     int
    FieldsDiffer          bool  // spawngroup's own columns differ, "name" excluded
    PoolDiffers           bool
    AmbiguousSinkGroupIds []int64     // populated only when Status == "ambiguous" — flagged rather than guessed, see EQEmu Schema Notes
    SampleCoord           [3]float64  // one matched member coordinate — lets a row drive SyncSpawnGroup the same way a Spawn Points row does
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
// Id trustworthy as identity within one zone — the same category of trust already extended to
// zone.short_name+version, not a database-wide surrogate key like spawngroup.id/spawn2.id.
type GridPoint struct {
    Id      int64
    Fields  map[string]interface{}  // type, type2 — dynamic, minus id/zoneid
    Entries []GridEntry
}

// GridDiffRow mirrors SpawnDiffRow's two-flag shape, but for grids there's no shared-data risk
// equivalent to a spawngroup's entries — a grid's waypoints aren't referenced by anything else
// the way a spawngroup can be reused across many spawn2 locations — so EntriesDiffer is
// something SyncGrids is allowed to fix directly, unlike PoolDiffers.
type GridDiffRow struct {
    Status        string  // "new" | "modified" | "removed" | "match"
    Source        *GridPoint
    Sink          *GridPoint
    FieldsDiffer  bool
    EntriesDiffer bool
}

type SyncGridsOptions struct {
    ZoneIdNumber int64
    DryRun       bool
    GridIds      []int64  // sink grid ids ("modified" rows) — full fields+entries replace
    NewGridIds   []int64  // source grid ids ("new" rows) — created fresh, reusing source's own id
}

type SyncGridsResult struct {
    DryRun  bool
    Created int
    Updated int
    Errors  []string
}
```

## Go Backend — Key Functions

- `Connect(c *ConnectionConfig, isSource bool) error` — connects to DB, pings, sets pool settings. **When `c.UseSSH` is true (added 2026-07-19), opens an SSH tunnel first** (`openSSHTunnel`) and points `sql.Open` at the tunnel's local forwarding address instead of `c.Host`/`c.Port` — the DB driver never knows a tunnel is involved, it just connects to `127.0.0.1:<ephemeral>`. Closes any pre-existing tunnel on that side before replacing it (a stale tunnel is a live goroutine + open listener that would otherwise run forever, one more per reconnect — unlike `sourceDB`/`sinkDB`, which are pooled and eventually GC'd, so this needed its own explicit cleanup that `sourceDB`/`sinkDB` don't currently get)
- `openSSHTunnel(cfg SshConfig, remoteHost, remotePort string) (*sshTunnel, string, error)` — dials the SSH server (`sshAuthMethods` for the auth method, `sshHostKeyCallback` for host-key verification), then opens a local listener bound to `127.0.0.1:0` (OS-assigned ephemeral port, loopback-only — so source and sink tunnels never collide and nothing outside this machine can reach the forwarded port) and returns its address. Each accepted local connection gets forwarded through the SSH client to `remoteHost:remotePort` by `forwardConn` (its own goroutine pair, one per direction, so one slow client can't stall others sharing the tunnel)
- `sshHostKeyCallback() (ssh.HostKeyCallback, error)` — verifies the SSH server's host key against the user's own `~/.ssh/known_hosts`, deliberately **not** `ssh.InsecureIgnoreHostKey()`. Same trust model the system `ssh`/`git` already use on this machine; if the host isn't already known, `ssh.Dial` fails with a `knownhosts` error rather than silently trusting whatever key the server presents — the fix is the same one `ssh` itself would prompt for (connect via a terminal once to add it), not something this app tries to paper over with a TOFU prompt of its own
- `sshAuthMethods(cfg SshConfig) ([]ssh.AuthMethod, error)` — builds exactly one `ssh.AuthMethod` from `cfg.AuthMethod`, either `ssh.Password` or `ssh.PublicKeys` (parsing the key file at `PrivateKeyPath`, with `ssh.ParsePrivateKeyWithPassphrase` if `Passphrase` is set)
- `PickPrivateKeyFile() (string, error)` — opens a native file-choose dialog (`wailsruntime.OpenFileDialog`) for the private key field, so the user can browse to e.g. `~/.ssh/id_rsa` instead of typing the path. Returns `""` with no error if the dialog is cancelled — the frontend treats an empty result as "leave the field unchanged"
- `GetZones() ([]Zone, error)` — queries source DB zone table
- `GetNPCsForZone(shortName string, version int8, zoneIdNumber int64, isSource bool) ([]NPC, error)` — discovers NPCs for a zone via two `UNION ALL`'d branches, not one `LEFT JOIN`ed query (see Important Go Implementation Details for why): (1) a real spawn2/spawngroup/spawnentry chain scoped to `(zone, version)`, or (2) — only if the NPC has no spawn2 row in *any* zone — `npc_types.id` falling in this zone's `[zoneidnumber*1000, zoneidnumber*1000+1000)` ID block, found via a primary-key range scan (quest-spawned NPCs, e.g. Vex Thal). The branches can never overlap by construction. `NPC.HasSpawnPoint` records which path found it. Returns all npc_types columns as map
- `CompareZones(shortName string, version int8, zoneIdNumber int64) ([]NPCDiffRow, error)` — diffs source vs sink NPCs by ID, scoped to one specific `(short_name, version)` zone row
- `Sync(options SyncOptions) (SyncResult, error)` — dry-run preview and real execution of `npc_types` sync, keyed off `options.DryRun`; see Sync Design below
- `SaveConfig(c Config) error` — saves to `~/.config/eqemu-sync/config.json`
- `LoadConfig() (Config, error)` — loads config on startup
- `LoadTODOItems() ([]TODOItem, error)` — reads `~/.config/eqemu-sync/todo.json` back, dismissed items included; frontend filters for display
- `SetTODOItemDismissed(id int64, dismissed bool) error` — archive/un-archive one TODO item by ID
- `getSpawnPointsForZone(ctx, db, shortName string, version int8) ([]SpawnPoint, error)` — zone-scoped `spawn2` fetch plus linked `spawngroup`/`spawnentry` pools, batched into exactly 3 queries regardless of zone size (`spawn2` by zone/version, then `spawngroup`/`spawnentry` both `IN (...)` on the distinct `spawngroupID`s found) — computes `LocationSharedCount` in-memory from the same `spawn2` result set rather than a 4th query
- `resolveOrphanedPoolNames(ctx, points []SpawnPoint, otherDB *sql.DB) error` — for any pool entry that didn't resolve against the database it came from, looks it up in the *other* database instead; see "Spawn point identity" below for why that's a recovery, not a guess
- `CompareSpawns(shortName string, version int8) ([]SpawnDiffRow, error)` — App method backing the Spawn Points tab; matches source/sink `SpawnPoint`s by exact `(x,y,z)`, classifies new/modified/removed/match, and computes `FieldsDiffer`/`PoolDiffers` independently (via `mapsEqual()`/`poolsEqual()`) before deriving `Status` — `Status = "modified"` whenever *either* flag is true, `"match"` only when both are false, so a row's status alone can't tell the frontend which kind of difference it has; that's exactly why the two flags are exposed separately rather than collapsed
- `spawnCandidatesForNPC(points []SpawnPoint, npcId int64) []spawnCandidate` — pure function, no DB access; filters an already-fetched zone-wide `[]SpawnPoint` down to one NPC's locations. Exists specifically so `Sync()` can fetch a zone's spawn data **once** and reuse it across every NPC in the loop — see the N+1 note below
- `createSpawnPoint(ctx, tx, zone string, version int8, c spawnCandidate, spawnGroupColumns, spawn2Columns map[string]bool) error` — shared spawngroup+spawnentry+spawn2 creation logic, used by both `Sync()` (per-NPC creation) and `SyncSpawnPoints()` (direct "new" spawn point sync) so the name-collision retry and `pathgrid` override only exist in one place
- `updateSpawn2(ctx, tx, sinkId int64, sourceFields map[string]interface{}, sinkColumns map[string]bool) error` — plain `UPDATE` of a matched spawn2 row's own columns only; never touches `spawngroupID`, so pool composition is untouched no matter what this call does
- `SyncSpawnPoints(options SpawnSyncOptions) (SpawnSyncResult, error)` — dry-run/execute for the Spawn Points tab, own transaction separate from `Sync()`'s. `SpawnIds` (sink IDs, "modified" rows) go through `updateSpawn2`; `NewSpawnCoords` (source coordinates, "new" rows) go through the same shared-pool-skip / coordinate-conflict-skip / `createSpawnPoint` path as per-NPC creation
- `spawnCoordKey(p SpawnPoint) [3]float64` — the one shared coordinate-matching key, used by `CompareSpawns`, `SyncSpawnPoints`, `CompareSpawnGroups`, and `SyncSpawnGroup` (previously three separate local closures doing the same thing — extracted after the `toFloat64` float32 bug made clear how much was riding on this one calculation being consistent everywhere it's used)
- `withoutField(m, field)` — returns a shallow copy of a dynamic field map with one key removed, added 2026-07-19 specifically to exclude `"name"` from spawngroup field comparisons/updates without touching `mapsEqual()` itself (which other tables, like `npc_types`, legitimately need `"name"` included in)
- `CompareSpawnGroups(shortName string, version int8) ([]SpawnGroupDiffRow, error)` — App method backing the Spawngroups tab (added 2026-07-19). Reuses `getSpawnPointsForZone`'s existing zone-scoped fetch (this view is just a different grouping of the same spawn2/spawngroup/spawnentry data `CompareSpawns` already pulls, not a second dedicated query) — groups each side's points by `SpawnGroupId`, then for each source spawngroup checks which sink spawngroup(s) its member coordinates resolve to: zero matches is `"new"`, exactly one is `"modified"`/`"match"` (with `FieldsDiffer`/`PoolDiffers` computed the same two-flag way as `CompareSpawns`), and more than one is `"ambiguous"` (flagged, not guessed — see EQEmu Schema Notes). Sink spawngroups no source group ever resolved to become `"removed"` rows
- `updateSpawnGroupFields(ctx, tx, sinkGroupId, sourceFields, sinkColumns) error` — updates a spawngroup's own row on the sink to match source, excluding `"name"` (cosmetic/local, see EQEmu Schema Notes) the same way `updateSpawn2()` excludes `pathgrid`/`id`/`spawngroupID`. Mirrors `updateSpawn2()`'s shape (sorted columns so `?` placeholders can't get mismatched by Go's randomized map iteration order)
- `SyncSpawnGroup(options SyncSpawnGroupOptions) (SpawnGroupSyncResult, error)` — dry-run/execute that brings a spawngroup fully in line with source: both its own fields (`spawn_limit`, wander box, timing, etc.) and its full `spawnentry` roster, together in one transaction. **Generalized 2026-07-19 from an originally entries-only `SyncSpawnGroupEntries`** — syncing a spawngroup's fields without its entries (or vice versa) doesn't correspond to anything a user actually wants, so this replaced the narrower method rather than existing alongside it. Identified via a spawn2 location's coordinates rather than a `spawngroupID` directly (same reasoning as everywhere else spawn2/spawngroup identity is coordinate-based). Before writing anything, queries the sink for every distinct `(zone, version)` a spawn2 row references that `spawngroupID` under — if that set includes anything besides the zone/version being worked on, the whole operation is blocked (`OtherZoneUsage` populated, nothing written), dry run or not. `npcID` values need no translation (portable identity, see EQEmu Schema Notes), so entries are a plain delete-then-reinsert once cleared. Deliberately its own method, not folded into `SyncSpawnPoints` — see Sync Design below. Triggered from two places in the frontend: the Spawn Points detail panel's per-row action, and the Spawngroups tab's own row action — both funnel into the same shared confirm modal
- `getGridsForZone(ctx, db, zoneIdNumber int64) ([]GridPoint, error)` — zone-scoped `grid` fetch plus its `grid_entries` waypoints, batched into exactly 2 queries regardless of zone size (`grid` by `zoneid`, then `grid_entries` by the same `zoneid`, grouped into each `GridPoint.Entries` in memory) — mirrors `getSpawnPointsForZone`'s batching shape. `zoneIdNumber` is `zone.zoneidnumber` (a plain int), not `zone.short_name` — `grid`/`grid_entries` don't use the short_name string spawn2 does
- `gridEntriesEqual(a, b []GridEntry) bool` — compares two grids' waypoint lists by `Number`, order-independent, mirroring `poolsEqual`'s shape but keyed by waypoint position instead of NPC ID
- `CompareGrids(zoneIdNumber int64) ([]GridDiffRow, error)` — App method backing the Grids tab; matches source/sink `GridPoint`s by `Id` (not coordinate — a grid is a path, not a point), computes `FieldsDiffer`/`EntriesDiffer` independently before deriving `Status`, same two-flag shape as `SpawnDiffRow`
- `insertGridEntry`/`createGrid`/`updateGrid` — shared grid-writing helpers, mirroring `createSpawnPoint`/`updateSpawn2`'s split but simpler: `createGrid` reuses source's own `grid.id` directly (safe here — see `GridPoint`), and `updateGrid` replaces both a grid's own fields *and* its full waypoint list (delete-then-reinsert `grid_entries`) in one call, since unlike spawn2/spawngroup there's no shared-data risk splitting fields from entries
- `SyncGrids(options SyncGridsOptions) (SyncGridsResult, error)` — dry-run/execute for the Grids tab, own transaction. Simpler than `SyncSpawnPoints`/`SyncSpawnGroupEntries`: no coordinate-conflict or shared-pool checks needed, since `grid.id` is zone-scoped (not a global auto-increment) and a grid isn't reused across unrelated things the way a spawngroup is
- `shutdown(ctx)` — closes both DB connections and both SSH tunnels, if open

## Important Go Implementation Details

- NPC fields use `map[string]interface{}` because `SELECT nt.*` returns all columns dynamically
- `[]byte` values from MySQL are converted to strings during scan
- `toInt64()` helper handles `int64`, `[]byte`, and `string` type assertions for NPC IDs
- **`toFloat64()` must handle `float32`, not just `float64`/`[]byte`/`string` — this was a real, shipped bug (found 2026-07-19, see Repo Meta) that silently zeroed every spawn2 coordinate.** `go-sql-driver/mysql` scans a SQL `FLOAT` column as Go `float32` when the destination is `interface{}`; only `DOUBLE` columns come back as `float64`. `spawn2.x`/`y`/`z` are `FLOAT` in the standard EQEmu schema. Every coordinate-keyed operation in the app routes through this one function (`CompareSpawns`'s `coordKey`, `spawnCandidatesForNPC`'s conflict-check coordinates, `SyncSpawnPoints`'s `coordKey`) — a missing `float32` case doesn't fail loudly, it just makes every `[3]float64` key collapse to `(0,0,0)`, so every row in a zone collides onto one map entry. Covered by `TestToFloat64` in `app_test.go`
- **`scanDynamicRows()` also widens `float32` → `float64` at scan time, not just inside `toFloat64()` — a second, subtler bug the first fix exposed rather than caused.** Once `toFloat64()` correctly widened `float32` for matching, a *different* mismatch surfaced: `Fields["x"]` still held the raw, unwidened `float32`, and Go's `encoding/json` marshals a `float32` using 32-bit shortest-round-trip formatting (it knows the static type), not 64-bit. The frontend only ever produces float64s, so parsing that JSON text back gives the closest float64 to that *decimal string* — not necessarily bit-identical to `float64(theFloat32)` computed directly. That mismatch is invisible until something compares the two for exact equality — which is exactly what happens when the frontend sends a coordinate back (e.g. `SyncSpawnPoints`'s `NewSpawnCoords`) and the backend's `spawnCoordKey()` needs it to match a `SpawnPoint` it scanned moments earlier: every selected "new" row failed with "not found in source zone data," because the round-tripped coordinate and the freshly-scanned one, while representing the same physical spot, weren't bit-identical `float64` values. Normalizing at scan time (once, in the one shared function) means every downstream consumer — JSON serialization, Go-side matching, values sent back from the frontend — works from the same already-widened `float64` consistently, which is a proper fix rather than papering over it with an epsilon-tolerant comparison
- `mapsEqual()` compares NPC field maps as strings via `fmt.Sprintf("%v", v)`, skips `id` field and missing sink columns
- Config auto-loads and auto-connects on app startup via React `useEffect`
- **SSH tunneling, added 2026-07-19.** `ConnectionConfig.UseSSH`/`SshConfig` existed as unused fields since early in the project; this is what finally wired them up. Chose `~/.ssh/known_hosts` verification over `ssh.InsecureIgnoreHostKey()` deliberately — for a tool that's meant to be trusted by other EQEmu operators, not just its author, skipping host-key verification would be a real MITM exposure on an untrusted network, not just a rough edge. The local forwarding listener always binds `127.0.0.1:0` (ephemeral, loopback-only) rather than a fixed port, so `SaveConfig`ing two profiles that both use SSH never collides and the forwarded port is never reachable from outside this machine
- DSN includes `?timeout=5s` — `sql.Open`/`db.Ping()` have no dial timeout by default, so a routable-but-silent host (e.g. a typo'd IP within a local subnet) would otherwise hang for macOS's default TCP retry window (60+ seconds) with zero feedback before the connection error UI could ever show anything
- `SaveConfig` writes `~/.config/eqemu-sync/config.json` with `0600` permissions (owner-only) — it contains plaintext DB passwords, so it must not be world-readable. Note: `os.WriteFile` only applies the given permission mode when *creating* a new file; it will NOT retroactively chmod a file that already exists with looser permissions from before this fix
- `getSinkColumns(ctx, db, table)` runs `SHOW COLUMNS FROM <table>` at sync time rather than hardcoding a column allowlist, so schema drift (e.g. the 136-vs-131 `npc_types` column difference) self-corrects if either schema changes. Originally `npc_types`-only (`getSinkNPCTypeColumns()`), generalized when spawn point creation needed the same treatment for `spawngroup`/`spawn2` — no reason to assume those tables are immune to the same drift
- `upsertNPC()` builds a dynamic `INSERT ... ON DUPLICATE KEY UPDATE`, sorting the column name slice first so the `?` placeholders and their values (indexed off that same sorted slice) can't get mismatched — map iteration order in Go is randomized
- `buildTODOItems()` emits one `TODOItem` per non-zero `loottable_id`/`npc_spells_id`/`npc_faction_id` on the **source** NPC, regardless of whether the sink already matches — these shared tables are never auto-synced, so they always need manual reconciliation
- `appendTODOItems()` only fires on real execution (not dry run), reading+merging into the existing `~/.config/eqemu-sync/todo.json` rather than overwriting it
- **TODO items are an archive, not a log — deliberately not append-only.** `appendTODOItems()` dedups on `(Type, NPCID, SourceID)` before adding (re-syncing the same NPC shouldn't double up its TODOs forever) and never touches `Dismissed` on an existing match — a re-sync must not silently un-archive something already reviewed. `ID` is backfilled for any pre-existing entries written before the field existed (an ID of `0` isn't unique, so `SetTODOItemDismissed` would target the wrong row without this). `ZoneName`/`ZoneVersion` are deliberately excluded from the dedup key: a shared loot/faction reference is "the same thing to review" regardless of which zone's sync happened to surface it — zone is a *display filter*, not part of the item's identity
- The dismiss/un-dismiss model is intentionally the "archive" metaphor (Gmail), not delete: hidden from the default view, fully recoverable via a "show dismissed" toggle — same reversible-over-destructive principle used everywhere else in this app
- `GetNPCsForZone`'s computed `has_spawn_point` column is extracted into `NPC.HasSpawnPoint` and then **deleted from `Fields`** — it must not stay in the dynamic column map, or `mapsEqual()` would compare it between source/sink and could spuriously flag a quest-spawned NPC as "modified" forever, since it's not a real npc_types column
- `GetNPCsForZone`'s quest-spawn detection is two `UNION ALL`'d branches, deliberately **not** a single query with `LEFT JOIN spawn2 ... WHERE spawn_id IS NOT NULL OR (id_range AND NOT EXISTS(...))`. That shape was tried first and caused a real, noticeable slowdown: `LEFT JOIN` (needed so spawn-less NPCs aren't excluded) stops the optimizer from starting off the small, zone-filtered side of `spawn2`, so it has to consider every row of `npc_types` — the whole database's NPCs, not just this zone — and the `NOT EXISTS` correlated subquery then runs once per row of that full table. The two-branch version keeps branch 1 identical to the original zone-filtered join, and scopes branch 2 to an indexed `nt.id >= ? AND nt.id < ?` primary-key range scan (≤1000 rows) *before* `NOT EXISTS` ever runs against it
- `getSourceSpawnCandidates()` queries `spawn2`/`spawngroup` as two **separate** queries, not one join — both tables likely have an `id` column, and `SELECT sg.*, s.*` in one query produces two columns both named `id`; the dynamic scan keys its map by column name, so the second would silently clobber the first. `scanDynamicRows()` is the shared scan-loop helper this uses (and `getSourceSpawnCandidates` alone uses it twice) — deliberately not also applied to `GetNPCsForZone`'s existing loop, since that one is already intertwined with npc_types-specific extraction (`has_spawn_point`) and touching working, tested code for an unrelated feature wasn't worth the risk
- `insertRow()` is a plain `INSERT` (never `ON DUPLICATE KEY UPDATE`) used for `spawngroup`/`spawn2` — callers only reach for it once they've already established the row is safe to create fresh. `spawnentry` doesn't go through it (no dynamic field map to filter, no surrogate `id` column — it's a `(spawngroupID, npcID)` composite key), just a direct 3-column insert
- New `spawn2` rows always force `pathgrid = 0` via `insertRow`'s `overrides` param rather than copying source's value — grid/grid_entries aren't synced, so a copied `pathgrid` would be a dangling reference to a grid row that doesn't exist in the sink
- **`updateSpawn2()` explicitly excludes `pathgrid` from the columns it copies — this was a real, shipped bug (found 2026-07-19, while checking the `grid`/`grid_entries` schema for the Grids tab) where every "modified" spawn2 sync was silently overwriting the sink's `pathgrid` with source's raw value.** New-row creation already forced `pathgrid = 0` for exactly this reason (see the bullet above), but the existing-row update path had no equivalent guard — it copies every column in `sourceFields` except `id`/`spawngroupID`, and `pathgrid` was never in that exclusion list. Since `grid.id` is zone-scoped but still locally assigned (see `GridPoint`), a copied `pathgrid` could point the sink row at the wrong patrol path, or one that doesn't exist there at all. Fixed by skipping `pathgrid` the same way `id`/`spawngroupID` already are; can be revisited now that the Grids tab makes `grid.id` trustworthy within a zone
- `Sync()` calls `getSpawnPointsForZone()` **once**, before its NPC loop starts (only when `SyncOptions.SyncSpawns` is true), and filters per-NPC via the pure `spawnCandidatesForNPC()` inside the loop. Caught during design, before writing the loop: the earlier per-NPC spawn lookup (`getSourceSpawnCandidates`, scoped to one NPC ID) got replaced by a zone-wide fetch when the Spawn Points tab needed the same data — calling that zone-wide fetch once per NPC inside `Sync()`'s loop would have multiplied its own internal batching (3 queries) by NPC count instead of avoiding N+1 queries at all
- `createSpawnPoint()`/`updateSpawn2()` are extracted, standalone functions (not `*App` methods) specifically so `Sync()` and `SyncSpawnPoints()` can both call them against their own transactions — same reasoning as `scanDynamicRows()`/`mapsEqual()` already being free functions rather than methods

## React Frontend (App.jsx) — Key State

```js
// Connections
const [sourceConnected, setSourceConnected] = useState(false)
const [sinkConnected, setSinkConnected] = useState(false)
const [activeModal, setActiveModal] = useState(null)  // 'source' | 'sink' | null
const [connectError, setConnectError] = useState(null)  // shown inline in the modal on Connect() failure
const [connecting, setConnecting] = useState(false)      // true while a Connect() call is in flight
const [sourceHost, setSourceHost] = useState('')
const [sourcePort, setSourcePort] = useState('')
const [sourceUsername, setSourceUsername] = useState('')
const [sourcePassword, setSourcePassword] = useState('')
const [dbSourceName, setDbSourceName] = useState('')
const [sinkHost, setSinkHost] = useState('')
const [sinkPort, setSinkPort] = useState('')
const [sinkUsername, setSinkUsername] = useState('')
const [sinkPassword, setSinkPassword] = useState('')
const [dbSinkName, setDbSinkName] = useState('')
// SSH tunnel sub-config, added 2026-07-19 — one plain object per side (not 7 more value+setter
// pairs on top of the 5 above) via defaultSshConfig(): {enabled, host, port, username,
// authMethod: 'privateKey'|'password', password, privateKeyPath, passphrase}. connectionConfigFor()
// maps this shape onto Go's ConnectionConfig{UseSSH, SshConfig} and back (hydrateSshConfig()) —
// see Important Frontend Implementation Details for why both directions funnel through one place.
const [sourceSsh, setSourceSsh] = useState(defaultSshConfig())
const [sinkSsh, setSinkSsh] = useState(defaultSshConfig())

// Zone
const [zones, setZones] = useState([])
const [searchFilter, setSearchFilter] = useState('')
const [selectedZoneShortName, setSelectedZoneShortName] = useState('')
const [selectedZoneLongName, setSelectedZoneLongName] = useState('')
const [selectedZoneId, setSelectedZoneId] = useState(null)        // zone.Id — the only genuinely unique zone key, used for row highlighting
const [selectedZoneVersion, setSelectedZoneVersion] = useState(0) // zone.Version — threaded into CompareZones/Sync calls
const [selectedZoneIdNumber, setSelectedZoneIdNumber] = useState(null) // zone.ZoneIdNumber, shown in the zone header and threaded into CompareZones/Sync (drives the quest-spawn ID-range fallback)

// Diff
const [diffRows, setDiffRows] = useState([])
const [diffLoading, setDiffLoading] = useState(false)  // true while CompareZones is in flight; diffRows is cleared first so stale rows never linger
const [diffFilter, setDiffFilter] = useState('all')  // 'all' | 'diff'
const [sortBy, setSortBy] = useState('status')
const [sortDir, setSortDir] = useState('asc')
const [selectedNpc, setSelectedNpc] = useState(null)
const [selectedRowKey, setSelectedRowKey] = useState(null)
// selectedNpc/selectedRowKey are cleared on zone switch AND after a sync completes —
// otherwise the NPC Detail panel can silently show a stale snapshot from a different
// zone or from before the sync, since it's not a live reference into diffRows.

// Sync
const [selectedNPCs, setSelectedNPCs] = useState(new Set())
const [showSyncPreview, setShowSyncPreview] = useState(false)
const [syncPreview, setSyncPreview] = useState(null)  // dry-run SyncResult, null while loading
const [syncing, setSyncing] = useState(false)         // true while Execute Sync is in flight
const [syncOutcome, setSyncOutcome] = useState(null)  // post-execute SyncResult
const [showSyncConfirm, setShowSyncConfirm] = useState(false)  // gates Execute Sync behind a confirm modal
const [syncSpawns, setSyncSpawns] = useState(false)  // "Create spawn points" checkbox, opt-in, sent as SyncOptions.SyncSpawns

// TODO tab
const [activeView, setActiveView] = useState('npcs')  // 'npcs' | 'todo' | 'spawns' | 'grids' | 'spawngroups' — tab switcher in the zone header
const [todoItems, setTodoItems] = useState([])        // full archive from LoadTODOItems(), dismissed items included
const [showDismissedTodos, setShowDismissedTodos] = useState(false)

// Sidebar resize/collapse + detail panel width — added 2026-07-19, persisted to config.json's
// new UI field (see UIPrefs) so they survive an app restart; loaded in the same useEffect that
// loads Source/Sink, saved via persistUIPrefs() on drag-end/collapse-toggle, not on every render
const [sidebarWidth, setSidebarWidth] = useState(256)
const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
const [npcSearchFilter, setNpcSearchFilter] = useState('')  // NPCs tab name filter, added for parity with Spawns tab's existing one

// Spawns tab
const [spawnDiffRows, setSpawnDiffRows] = useState([])
const [spawnDiffLoading, setSpawnDiffLoading] = useState(false)
const [spawnDiffFilter, setSpawnDiffFilter] = useState('all')  // 'all' | 'diff'
const [spawnSortBy, setSpawnSortBy] = useState('status')  // 'status' | 'spawngroup' | 'shared'
const [spawnSortDir, setSpawnSortDir] = useState('asc')
const [spawnSearchFilter, setSpawnSearchFilter] = useState('')  // matches spawngroup name or any spawn entry's NPC name, see spawnRowMatchesSearch()
const [selectedSpawnKeys, setSelectedSpawnKeys] = useState(new Set())  // coordinate-string keys — spawn2 has no cross-database ID, see spawnKey()
const [selectedSpawnRow, setSelectedSpawnRow] = useState(null)
const [showSpawnSyncPreview, setShowSpawnSyncPreview] = useState(false)
const [spawnSyncPreview, setSpawnSyncPreview] = useState(null)
const [spawnSyncing, setSpawnSyncing] = useState(false)
const [spawnSyncOutcome, setSpawnSyncOutcome] = useState(null)
const [showSpawnSyncConfirm, setShowSpawnSyncConfirm] = useState(false)
const [showSpawnHelp, setShowSpawnHelp] = useState(false)  // right-edge drawer, see "?" button next to the detail panel title

// SyncSpawnGroup confirm modal state (generalized 2026-07-19 from entries-only — see Key
// Functions) — shared by two trigger points: the Spawn Points detail panel's per-row action and
// the Spawngroups tab's own row action. Coords/pools/source are captured at open time (via
// openSyncSpawnGroupPreview) so the modal itself never needs to know which tab triggered it, and
// spawnGroupSyncSource ('spawns' | 'spawngroups') tells executeSyncSpawnGroup() which tab's
// selection/diff-list to refresh afterward.
const [showSpawnGroupSyncConfirm, setShowSpawnGroupSyncConfirm] = useState(false)
const [spawnGroupSyncPreview, setSpawnGroupSyncPreview] = useState(null)  // dry-run SpawnGroupSyncResult, null while loading
const [spawnGroupSyncError, setSpawnGroupSyncError] = useState(null)  // unexpected Go-level error, separate from the "blocked"/"not found" outcomes the result itself carries
const [syncingSpawnGroup, setSyncingSpawnGroup] = useState(false)
const [spawnGroupSyncCoords, setSpawnGroupSyncCoords] = useState(null)  // [x,y,z] identifying the target spawngroup, for SyncSpawnGroup
const [spawnGroupSyncPools, setSpawnGroupSyncPools] = useState({source: [], sink: []})  // entry preview data for the confirm modal
const [spawnGroupSyncSource, setSpawnGroupSyncSource] = useState(null)  // 'spawns' | 'spawngroups'
// Each overlay component (ConnectModal, ConfirmSyncModal, ConfirmSpawnSyncModal, SpawnHelpDrawer,
// ConfirmSpawnGroupSyncModal, ConfirmGridSyncModal) owns its own focus-on-open ref/effect
// internally now — see "App.jsx component/lib split" below — so none of those refs live here.

// Grids tab
const [gridDiffRows, setGridDiffRows] = useState([])
const [gridDiffLoading, setGridDiffLoading] = useState(false)
const [gridDiffFilter, setGridDiffFilter] = useState('all')  // 'all' | 'diff'
const [selectedGridIds, setSelectedGridIds] = useState(new Set())  // grid.id is trustworthy within a zone, see GridPoint — no coordinate-key needed like spawnKey()
const [selectedGridRow, setSelectedGridRow] = useState(null)
const [showGridSyncPreview, setShowGridSyncPreview] = useState(false)
const [gridSyncPreview, setGridSyncPreview] = useState(null)
const [gridSyncing, setGridSyncing] = useState(false)
const [gridSyncOutcome, setGridSyncOutcome] = useState(null)
const [showGridSyncConfirm, setShowGridSyncConfirm] = useState(false)

// Spawngroups tab — no bulk-select Set or sync-preview slide-over like the other tabs; syncing a
// spawngroup is a deliberate, single-row action triggered from the detail panel (via SyncSpawnGroup
// above), mirroring how the old entries-only sync always worked, not a batch-checkbox flow.
const [spawnGroupDiffRows, setSpawnGroupDiffRows] = useState([])
const [spawnGroupDiffLoading, setSpawnGroupDiffLoading] = useState(false)
const [spawnGroupDiffFilter, setSpawnGroupDiffFilter] = useState('all')  // 'all' | 'diff'
const [selectedSpawnGroupRow, setSelectedSpawnGroupRow] = useState(null)

// NPC / Spawn Point / Grid / Spawngroup Detail panel (shared panel, content switches on activeView)
const [detailWidth, setDetailWidth] = useState(240)
const [expandedSections, setExpandedSections] = useState({
    identity: true,
    combat: true,
    resistances: false,
    ability_scores: false,
    behavior: false,
    references: true,
    spawn_behavior: false,
    spawn_pool: true
    // grid_waypoints, spawngroup_fields, spawngroup_entries default via `?? true` at the read
    // site instead of being listed here — same drift-tolerant "add a fallback, not a new key"
    // approach as everywhere else new detail-panel sections have been added since the split.
})
```

## Important Frontend Implementation Details

- Zone rows are tracked/highlighted by `zone.Id`, never `zone.ShortName` — `short_name` is not unique in EQEmu's `zone` table (see EQEmu Schema Notes), so keying selection off it caused two same-named zones to highlight together
- Every plain-text `<input>` (Host/Username/Database in the connect modal, the zone filter box) sets `autoCapitalize="off" autoCorrect="off" spellCheck={false}`. Wails on macOS renders through `WKWebView` (Safari's engine), which respects the OS's "Capitalize words automatically" / autocorrect text-input settings by default — without these attributes, typing e.g. `root` or `gukbottom` can get silently rewritten mid-type, or an autocorrect popup can swallow a click meant for something else on the page. `Password` fields are naturally exempt (browsers don't spellcheck `type="password"`); `Port` doesn't need it (numeric only)
- Both modals (Connect, Confirm Sync) close on Escape via a scoped `onKeyDown` on the modal's own wrapper `div`, not a global `document` listener — but that only fires if focus is inside the modal, so each has a `ref` (`connectModalRef`/`syncConfirmModalRef`) + a `useEffect` that calls `.focus()` on the wrapper the instant it opens (`tabIndex={-1}` + `outline-none` so it's focusable without a visible ring around the backdrop). The handler also calls `e.preventDefault()` on Escape — without it, WKWebView lets the key event fall through to native macOS handling, which plays the system alert sound (`NSBeep()`) since nothing in the native responder chain implements the `cancelOperation:` action Escape is bound to by default
- The zone list and its filter input are disabled/dimmed while `showSyncPreview` is true, forcing an explicit "← Back to Diff" before switching zones — otherwise switching zones mid-preview would leave the preview panel showing stale NPCs/TODO counts from a selection that no longer matches the newly-loaded zone
- The "Create spawn points" checkbox and "Sync X NPCs" button are disabled the same way while `showSyncPreview` is true. This one isn't just tidiness: `executeSync()` reads `syncSpawns`'s *current* value at execute time, not whatever value was in effect when the preview was generated. Toggling the checkbox after the preview loads (without disabling it) would let the Confirm modal show stale spawn-point counts — approve "0 spawn points" from an old preview, then actually execute with the box now checked. Once the checkbox is locked, "Sync X NPCs" has nothing left to legitimately refresh either, so locking both is the consistent choice, not an arbitrary extra restriction
- `needsSpawnPoint(row)` — a small shared helper (`row.Status === 'new' && row.Source?.HasSpawnPoint`) used in three places (per-row checkbox `disabled`, its `title`, and the "select all" header checkbox's filter) to decide whether a "new" NPC can actually be synced. A purple ⚡ badge (diff row + NPC Detail panel) marks any NPC with `HasSpawnPoint === false`, regardless of diff status — informational, not just for blocked ones
- The tab switcher (NPCs / Spawns / TODO) lives in its own `<div className="ml-auto ...">` positioned as the **last** element in the zone header row, after every conditionally-rendered control (the "Create spawn points" checkbox + "Sync X NPCs" button for the NPCs tab, "Sync X Spawn Points" for the Spawns tab). It used to sit right after those controls with just `ml-auto` on itself; since the controls before it appear/disappear per tab, the tab buttons visually jumped left/right on every switch. Moving the switcher to always be the last sibling (so `ml-auto` has a stable amount of empty space to eat) fixed it — the controls are free to come and go without moving anything else
- `spawnKey(row)`/`spawnCoords(row)` are the spawn-tab equivalent of using `NPC.Id` for React keys and selection-`Set` membership — `spawn2` has no cross-database ID (see "Spawn point identity" below), so every spawn-row helper (selection, sort, the detail panel's "currently selected" check) keys off a `"x,y,z"` string built from `spawnCoords()` instead
- The right-hand detail panel is shared by both tabs — one `<div>`, its body branches on `activeView` (`'npcs'` renders the existing NPC field groups off `selectedNpc`, `'spawns'` renders a static location line + a Behavior field group + a Spawn Entries table off `selectedSpawnRow`, `'todo'` shows a placeholder). `expandedSections` is one shared state object for both — the NPC keys (`identity`, `combat`, ...) and spawn keys (`spawn_behavior`, `spawn_pool`) don't collide, and each tab only ever reads its own keys, so collapsed/expanded state naturally persists per-section across tab switches without extra plumbing
- The Spawn Point detail panel's "Behavior" section isn't a hardcoded field list like the NPC panel's `fieldGroups` — `spawnBehaviorFields(row)` takes the union of `Source.Fields`/`Sink.Fields` keys minus the fixed identity columns (`spawnIdentityFieldNames = ['x','y','z']`), puts a small `spawnPriorityFieldNames` set (`respawntime`/`variance`/`pathgrid`/`enabled`) first, and sorts everything else alphabetically after. `spawn2` has far fewer columns than `npc_types` and no established grouping convention, so this drift-tolerant approach (mirroring how `getSpawnPointsForZone` already treats spawn2/spawngroup columns dynamically on the Go side) was chosen over hand-maintaining an exhaustive column list that could silently go stale against either database's actual schema — the priority list is a soft ordering hint, not an authoritative allowlist like `fieldGroups` is for NPCs
- `x`/`y`/`z` are deliberately **not** in the diffable field groups at all, only `heading` is (folded into Behavior). They're the coordinate-matching key itself (see "Spawn point identity" below), so a matched row's source and sink are guaranteed bit-identical on those three by construction — showing them as a source→sink diff pair would always render as blank, wasted panel space. They're shown once, as three axis-labeled rows (`x` / `y` / `z`, each own line) above the field groups instead — not a bare `(x, y, z)` tuple, since EQ's in-game `/loc` command reports `Y, X, Z` while the database (and this app) store/display `X, Y, Z`; a labeled row is unambiguous regardless of which order someone expects. The `showSpawnHelp` drawer has a short note spelling this out explicitly for anyone who wants the "why," not just the labels
- **"Modified" doesn't always mean "Sync can fix this," and the UI has to say so.** `SpawnDiffRow.Status` is `"modified"` whenever *either* `FieldsDiffer` or `PoolDiffers` is true (see Key Types) — but `Sync`/`SyncSpawnPoints` only ever touches spawn2's own fields, never spawn entries. A row that's modified purely because its spawn entries changed (fields identical) has nothing for Sync to do; letting it render as an ordinary syncable "modified" row would let someone select and sync it, get a silent no-op `UPDATE`, and believe they'd handled a difference that's actually still sitting there. `spawnEntriesOnly(row)` (`Status === 'modified' && !FieldsDiffer`) detects this case; `spawnRowSelectable(row)` excludes it from being checkbox-selectable at all (mirroring the existing `needsSpawnPoint` "disable + explain why" pattern for NPCs), and the diff row renders it with a muted `bg-amber-950/40` instead of the normal `bg-yellow-950` "this will sync" yellow — three visually distinct states now exist under the old single "modified" bucket: syncable (yellow), entries-only (muted amber, not selectable), and unaffected (transparent/match)
- The Spawn Points diff list has its own `spawnSortBy`/`spawnSortDir` state (Status/Spawngroup/Shared) and a `spawnSearchFilter` text box (matches spawngroup name or any spawn entry's NPC name via `spawnRowMatchesSearch()`), separate from the NPCs tab's `sortBy`/`sortDir` — reusing the NPC tab's state would have carried over a sort key with no equivalent meaning ("Name" sorts NPC name; there's no direct spawn2 analog) whenever a user switched tabs
- The spawngroup's name lives in the **Spawn Entries section's own header** (`Spawn Entries — "name"`), not as a separate row up near `location` — it's a fact about the entries listed below it, and putting it right there reads better than making the reader connect two rows that are visually far apart. An earlier version tried explaining the full spawn2→spawngroup→spawn entries relationship inline as a small bordered diagram at the top of the panel; that was reverted (2026-07-19) as too heavy to show unconditionally for something a user only needs to understand once — see the `showSpawnHelp` drawer below for where that explanation lives now
- **`showSpawnHelp`** is a right-edge slide-over drawer (own backdrop + Escape-to-close, same `ref`+`tabIndex`+`onKeyDown` pattern as the modals, but positioned `fixed right-0` instead of centered) triggered by a small "?" button next to the "Spawn Point Detail" title. It holds the spawn2→spawngroup→spawn entries explanation that used to be inline. Deliberately **not** a modal: every modal in this app currently means "you're about to commit to something" (Connect, Confirm Sync) — reusing that chrome for passive reference content would blur a signal that's otherwise reliable. Deliberately **not** a popover anchored to the button either: this app has no positioning library, and the detail panel is narrow enough (down to 180px) that an anchored popover would have nowhere good to render; a drawer sliding from the window edge (not the narrow detail column) sidesteps that and has room to grow if more reference content gets added later. The "shared ×N" fact for a *specific* row still lives inline (in the Spawn Entries section, since it's about that row, not a general concept) — only the general "how do these three tables relate" explanation moved to the drawer
- `selectAllSharingSpawngroup(row)` adds every *other* selectable location sharing `row`'s spawngroup to `selectedSpawnKeys` — the spawn2-level equivalent of the "shared ×N" badge, turned into an action instead of just a count. Compares `SpawnGroupId` only within the same side (source-to-source or sink-to-sink, picked by whichever side the anchor row actually has) — those IDs are independent auto-increment sequences from two separate databases, so comparing a source ID to a sink ID would be a meaningless coincidence, not a real relationship. Surfaced as a "Select all N →" button next to the existing "Also used at N other locations" line in the Spawn Entries section
- The **"Sync spawngroup from source" button + `showSpawnGroupSyncConfirm` modal** (originally "Sync entries from source"/`showSpawnGroupEntriesConfirm`, renamed 2026-07-19 when the backend action was generalized — see the Spawngroups tab bullet below) is deliberately a *separate* action from the regular spawn2 sync flow, triggered per-row from the Spawn Entries section (only shown when `PoolDiffers` is true) rather than folded into "Sync N Spawn Points." This mirrors the backend split (`SyncSpawnGroup` vs `SyncSpawnPoints`) for the same reason: syncing a spawngroup is a fundamentally different risk class than syncing a spawn2 row's own fields, and bundling it into a batch action would make it too easy to sync a spawngroup's fields/entries for a spawngroup the user hasn't actually reviewed. The modal's three states — blocked (`OtherZoneUsage` populated, no confirm button at all), not-found (`NotFound`, sink has no spawn2 here yet), and the normal preview/confirm path — are handled as three distinct render branches rather than one generic "preview" shape, since a blocked or not-found outcome has nothing in common with a confirmable diff. The entry-level "before → after" table reuses `spawnEntryRows()` (already built for the read-only display) rather than a new computation — `sinkChance` is "current," `srcChance` is "what it'll become," which is exactly what that function already returns
- **App.jsx component/lib split, 2026-07-19.** `App.jsx` had grown to 1786 lines / 59 `useState` calls with four modals, a help drawer, and three tab bodies all inlined — no boundaries to navigate by. Split into four ordered passes, each verified by a full build before the next: (1) pure helpers with no closures over component state → `lib/constants.js`, `lib/npcHelpers.js`, `lib/spawnHelpers.js` (`needsSpawnPoint(row, syncSpawns)` took `syncSpawns` as an explicit param instead of closing over it, specifically so it could move); (2) the five overlay components, each now owning its own focus-on-open `ref`/`useEffect` internally rather than App.jsx managing five refs for behavior it doesn't otherwise touch; (3) `Sidebar.jsx`, with `selectZone()` staying in App.jsx as a prop (`onSelectZone`) since resetting NPC+spawn+grid selection state across three tabs and firing three `Compare*` calls is genuine cross-tab business logic, not something a presentational sidebar should own; (4) `NpcsTab`/`SpawnsTab`/`TodoTab`/`GridsTab`/`DetailPanel`. Ended at 558 lines. The **persistent zone header stayed inline** deliberately — it's a coordinator reading state from all tabs (badges, both tab-specific mini-toolbars, the tab switcher itself), which makes it parent-owned logic, not one tab's content; extracting it would only have added prop-forwarding without a real readability win
- **Grids tab, 2026-07-19 (added right after the component split, so it's the first tab built directly as its own component from the start).** Deliberately simpler than SpawnsTab: no `spawnSortBy`/`spawnSearchFilter`-style controls, since grids per zone are typically a handful to a few dozen — nowhere near spawn2's scale — so that extra surface area isn't earning its keep yet (can add later if a zone turns out to need it). `gridRowSelectable(row)` has no `spawnEntriesOnly`-style split either: unlike a spawngroup, a grid isn't shared/risky data, so every "modified" row is fully syncable, fields and waypoints together, with no separate "sync entries" action needed. `GridsTab`'s "Sync N Grids" trigger button in the persistent zone header follows the same `activeView === 'grids' && (...)` pattern as the NPCs/Spawns buttons next to it
- **UI/UX audit pass, 2026-07-19** — a full read-through of every component looking for inconsistencies/QOL gaps, then fixes applied directly (not just findings). Notable ones: `ConnectModal`'s submit button and every modal's `✕` close button had no `className` at all (rendered as unstyled native buttons in an otherwise fully dark-themed app) — fixed across all five modals plus the drawer; two `NpcsTab` tooltips still said "spawn placement isn't implemented," stale copy from before that feature shipped, now pointing at the "Create spawn points" checkbox instead; a spawn2 row can be `Status: "match"` with `PoolDiffers: true` (own fields match, only entries differ) — invisible in the `+/~/-` header badges and tab-switcher count, so a `spawnEntriesDifferCount`/`spawnNeedsAttentionCount` pair was added so it can't hide from the summary view; the zone list's "selected" treatment (text-color-only) was brought in line with the diff tables' background-tint-plus-border convention; the entries-only spawn row color moved from `bg-amber-950/40` to `bg-orange-950/60` since amber and yellow read as too similar once both can carry the same amber ⚠ icon; `ConnectModal` gained click-outside-to-close (the Confirm modals deliberately did not, since dismissing shouldn't be reachable by an accidental click there)
- **Sidebar/detail panel space reclaim on the TODO tab, 2026-07-19 (same pass).** The detail panel and its drag handle previously stayed mounted (and sized, up to 600px if resized) even on the TODO tab, which has no matching detail content — now both unmount entirely via `activeView !== 'todo'` in App.jsx, letting the TODO list's `flex-1` center panel reclaim that width automatically instead of it sitting idle. `DetailPanel.jsx`'s now-unreachable `activeView === 'todo'` placeholder branch was removed rather than left as dead code.
- **`sidebarWidth`/`sidebarCollapsed`/`detailWidth` persistence, 2026-07-19 (same pass).** These reset to hardcoded defaults on every restart before this — undermining the point of having made them adjustable in the first place. Now round-trip through `config.json`'s new `UI` field (see `UIPrefs`): loaded in the same `useEffect` that loads Source/Sink, saved via a `persistUIPrefs()` helper called on drag-end (not on every `mousemove`, which would spam `SaveConfig` calls) and on collapse/expand toggle. The drag handlers track the in-progress width in a local `let` rather than reading back from React state at `mouseup` time, since that closure was captured at `mousedown` and would otherwise see the *starting* width, not the final one.
- **Spawngroups tab, 2026-07-19** — a fifth peer tab (NPCs / Spawn Points / Spawngroups / Grids / TODO), backed by `CompareSpawnGroups()`/`SyncSpawnGroup()` (see Key Functions/Types above and Sync Design below). Deliberately has no bulk checkbox selection, sort, or search, and no sync-preview slide-over like the other tabs — a spawngroup's "modified" state links to a single "Sync spawngroup from source" action in the detail panel, the same one-row-at-a-time flow the old entries-only sync always used, not a batch action. `spawnGroupRowSelectable(row)` (`Status === 'modified'` only) reflects that "new" spawngroup rows have no sink spawn2 location to attach to yet — sync a spawn2 location first (Spawn Points tab) to create one — and "ambiguous" rows have no single sink target to sync into by design (see EQEmu Schema Notes). The confirm modal (`ConfirmSpawnGroupSyncModal`, renamed from `ConfirmSpawnGroupEntriesModal`) is shared between this tab and the Spawn Points detail panel's existing per-row action — both now call the same generalized `SyncSpawnGroup`, so `spawnEntryRows()` (in `lib/spawnHelpers.js`) was generalized to take two `Pool` arrays directly instead of a `SpawnDiffRow`-shaped object, since a `SpawnGroupDiffRow`'s pools live at `SourcePool`/`SinkPool` directly rather than nested under `Source`/`Sink`.
- **SSH tunnel support, 2026-07-19** — `ConnectModal` gained a "Connect via SSH tunnel" checkbox that reveals a nested settings panel (host/port/username, a Private Key/Password auth-method toggle styled like the tab-switcher buttons elsewhere in the app, and either a native file-browse button for the key + optional passphrase, or a password field) — hidden until enabled, the same progressive-disclosure pattern TablePlus/DBeaver/Navicat use so the common no-tunnel case isn't cluttered. `sourceSsh`/`sinkSsh` each carry one flat object (`defaultSshConfig()`) rather than seven more value+setter prop pairs; `connectionConfigFor()` is the one place that maps that shape onto Go's `ConnectionConfig{UseSSH, SshConfig}`, and `hydrateSshConfig()` is its inverse for loading a saved config back into that shape — both `connect()` and `persistUIPrefs()` route through a shared `currentFullConfig()` built on `connectionConfigFor()` so neither can partially overwrite the other's half of `config.json` with zero values. That consolidation fixed a real, if minor, pre-existing bug found while wiring it up: `connect()`'s own `SaveConfig` call never included the `UI` field at all, so reconnecting to a database was silently resetting the sidebar/detail panel width back to default every time.

## UI Layout

```
┌─────────────┬───────────────────────────────────────┬──────────────────┐
│   Sidebar   │      Center (sliding panels)           │  Detail panel    │
│  w-64       │      flex-1                            │   resizable      │
│             │                                        │   drag handle    │
│ CONNECTIONS │  ← Diff View slides out left           │  NPCs tab:       │
│  Source     │  → Sync Preview slides in right        │  - Identity      │
│  Sink       │    (locked, dimmed while open —        │  - Combat        │
│             │     zone list can't be clicked)        │  - Resistances   │
│ ZONES       │                                        │  - Ability Scores│
│  Filter     │  Zone header (persistent):             │  - Behavior      │
│  Zone list: │  [LongName - ShortName (zone N, vN)]   │  - References    │
│  LongName   │  [+8 ~53 -6] [tab controls] [NPCs]     │                  │
│  (ShortName │  [Spawns] [TODO]                       │  Spawns tab:     │
│   vN)       │                                        │  - Location      │
│  (scrolls)  │  NPCs tab — Diff View:                 │  - Behavior      │
│             │  [Show All][Differences Only][sort]    │  - Pool (src %   │
│             │  [☐ SOURCE: DB][SINK: DB]              │    vs sink %,    │
│             │  Color-coded rows, ⚡=quest-spawned     │    gold=differs) │
│             │                                        │  ⚠ if pool       │
│             │  Spawns tab — Diff View:                │    differs       │
│             │  [Show All][Differences Only]          │                  │
│             │  [☐ SOURCE: DB][SINK: DB]              │  Empty state:    │
│             │  Color-coded rows, coords + pool        │  "Select a[n]    │
│             │  summary per side, "shared ×N" badge,   │   NPC/spawn      │
│             │  ⚠ badge if pool composition differs    │   point to view  │
│             │                                        │   details"       │
│             │  TODO tab — grouped by Type, dismiss/   │  Gold = differs  │
│             │  restore, zone+version scoped           │  Gray = matches  │
│             │                                        │                  │
│             │  Execute Sync → Confirm Sync modal      │                  │
│             │  (shows sink DB, counts, "cannot be     │                  │
│             │   undone")                              │                  │
└─────────────┴───────────────────────────────────────┴──────────────────┘
```

## Color Coding
- **Green** (`bg-green-950`) = new NPC in source, not in sink
- **Yellow/Brown** (`bg-yellow-950`) = modified (same ID, different fields)
- **Red** (`bg-red-950`) = removed (in sink but not source)
- **Transparent** = match
- **Blue** (`bg-blue-900/40`) + gold left border = selected row
- **Gold** (`text-yellow-400`) = differing field values in detail panel

## Sync Design

### Available now (npc_types, added 2026-07-18):
- `npc_types` — upsert by ID via `Sync()`, transactional (all-or-nothing per call), filtered to columns that exist on the sink
- Single `Sync(options SyncOptions) (SyncResult, error)` backend method serves both the dry-run preview (`DryRun: true`) and the real execution (`DryRun: false`) — same NPC lookup + TODO-detection logic runs both times, so the preview is guaranteed to match what execute does
- Frontend flow: user selects NPCs with checkboxes in the diff view (`selectedNPCs`) → "Sync X NPCs" triggers a dry run and slides to the preview panel → preview lists the NPCs that will sync plus any TODO items → "Execute Sync" opens a Confirm Sync modal (shows sink DB name, NPC count, TODO count, "This cannot be undone") → "Sync Now" runs it for real, then re-runs `CompareZones` so synced rows flip to "match"
- The preview panel renders **one unified list built from `Array.from(selectedNPCs)`** (the full original selection), not from `syncPreview.NPCsSynced` alone — every selected NPC is looked up in both `NPCsSynced` and `Skipped` and shown with its actual outcome inline (sync / sync + spawn point / skipped, with the reason). Earlier version rendered `NPCsSynced` and `Errors` as two separate, disconnected lists — that let the header count and the list count silently disagree whenever something was skipped, and forced cross-referencing NPC IDs between two blocks of text to understand what would happen to your selection. `Errors` (red) is reserved for the post-execute outcome screen, where it can mean something actually failed; deliberate skips are always amber `Skipped` entries, both in the preview and in the post-execute outcome
- TODO items are always computed (both dry run and execute) but only *persisted* to `~/.config/eqemu-sync/todo.json` on real execution
- **TODO tab, added 2026-07-19** — a peer tab next to NPCs (switcher in the zone header), zone-scoped by default (`ZoneName`+`ZoneVersion` filter), grouped by `Type`, dismissible (archive semantics — hidden, not deleted, "show dismissed" toggle to recover). Designed around a stated real workflow: work a zone (NPCs → spawn tables → grids, in that order), and the TODO tab is the running checklist for the categories that don't have native diffing yet (loot/faction/spells/merchant/alt-currency). Not a generic issue tracker — once Spawn Points/Grids tabs exist, they surface their own issues live in their own diff view, not through this persistence mechanism
- `CompareZones`/`Sync` are scoped to one specific `(short_name, version)` zone row, not just `short_name` — see EQEmu Schema Notes for why that distinction matters
- **Per-NPC spawn point creation, added 2026-07-19** — when `SyncOptions.SyncSpawns` is true (UI: "Create spawn points" checkbox next to "Sync X NPCs", default off), a "new" NPC that needs a real spawn point (`HasSpawnPoint == true`, no matching sink row) gets a fresh `spawngroup`/`spawnentry`/`spawn2` chain created for it in the sink, in the same transaction as its `npc_types` upsert — instead of being unconditionally blocked. This is deliberately **not** the zone-wide "delete + insert everything" design from the original roadmap; it only ever touches the specific NPC being synced, nothing else in the zone. See "Spawn point identity" below for the coordinate-based conflict detection this depends on. `grid`/`grid_entries` (patrol pathing) are still out of scope — new spawn2 rows get `pathgrid` forced to `0` rather than copying source's value, since that would otherwise be a dangling reference to a grid row that doesn't exist in the sink. An NPC synced this way spawns but doesn't patrol.
- **Spawn Points tab, added 2026-07-19** — a third peer tab (NPCs / Spawns / TODO) diffing `spawn2` rows directly instead of only reactively through an NPC sync, answering the stated workflow gap: knowing which `spawngroup`/`spawnentry`/`spawn2` rows belong to the zone being revamped without guessing from IDs. Backed by `CompareSpawns()`/`SyncSpawnPoints()` (see Key Functions above). Two design decisions carry the whole feature:
  - **The row unit is `spawn2`, matched by coordinate — never deduplicated by shared `spawngroup`.** A shared pool used at 45 physical locations shows as 45 rows, each carrying a "shared ×44" badge, because `spawn2`'s own columns (`respawntime`, `variance`, `heading`, `enabled`, ...) are genuinely independent per location even when the pool is shared — collapsing them into one row would hide real per-location drift.
  - **Every row's diff status is really two layers: spawn2 fields (auto-syncable) and pool composition.** "Modified" only ever triggers a plain `UPDATE` of spawn2's own columns via `SyncSpawnPoints` (`updateSpawn2`, `spawngroupID` untouched); "new" reuses the same shared-pool-skip / coordinate-conflict-skip / `createSpawnPoint` machinery as per-NPC creation. `PoolDiffers` (spawngroup/spawnentry composition differs) is computed and surfaced separately — with per-NPC/chance detail and a "needs manual reconciliation" note in both the diff row and the detail panel's Spawn Entries section — and is **never** written by `SyncSpawnPoints` itself, new row or modified row, matching the same "shared data gets flagged, not silently resolved" rule already applied to per-NPC spawn creation and the TODO queue. It *can* be synced, but only through the separate, explicit `SyncSpawnGroupEntries` action described below — never bundled into a batch spawn2 sync.
  - A sink pool entry whose `npcID` doesn't resolve (`Orphaned = true`) falls back to a **source-side lookup** for the name via `resolveOrphanedPoolNames()` — this is the concrete answer to "what did a corrupted spawnentry used to point to": source is the intact copy, not a guess, whenever exactly one side has the missing NPC.
- **Sync Spawn Group Entries, added 2026-07-19** — closes the gap left by the previous bullet: after syncing a batch of spawn2 locations, their spawngroup(s) and spawnentries were still left exactly as they were on the sink, with no in-app way to bring them in line short of hand-editing via phpMyAdmin/PEQ editor. Backed by `SyncSpawnGroupEntries()` (see Key Functions above), triggered per-row from the detail panel's Spawn Entries section (only shown when `PoolDiffers` is true), with its own dry-run preview → confirm modal, entirely separate from the spawn2 batch sync. The core safety question — a spawngroup has no zone column of its own, so what stops this from silently rewriting spawns in a zone nobody reviewed? — is answered by checking, before every write (dry run or real), every distinct `(zone, version)` a spawn2 row references the sink's spawngroupID under. Anything beyond the zone/version being worked on **blocks the sync outright** (`OtherZoneUsage` populated, no confirm button offered) rather than warning-and-allowing — consistent with this app's existing pattern of treating shared-data risk as something to stop on, not just flag. A companion `selectAllSharingSpawngroup()` quick-select ("Select all N locations sharing this spawngroup") makes it easy to gather every spawn2 row a spawngroup touches before reviewing it, but is unrelated to the entries sync itself — it only ever touches spawn2's own fields, same guarantees as selecting those rows by hand.
- **Grids tab, added 2026-07-19** — a fourth peer tab (NPCs / Spawn Points / Grids / TODO) diffing `grid`/`grid_entries` (patrol pathing), backed by `CompareGrids()`/`SyncGrids()`. Genuinely simpler than the Spawn Points tab, for two schema-driven reasons (see EQEmu Schema Notes): `grid` is directly zone-scoped and `grid.id` isn't auto-increment, so it's trusted as identity within a zone the same way `zone.short_name`+`version` already is — no coordinate matching needed; and a grid isn't shared/reused across unrelated things the way a spawngroup is, so there's no `FieldsDiffer`/`EntriesDiffer` split forcing entries into a separate sync action — `SyncGrids` replaces a grid's own fields *and* its full waypoint list together in one call. Building this surfaced a real, already-shipped bug: `updateSpawn2()` was copying `pathgrid` verbatim on every "modified" spawn2 sync (see Important Go Implementation Details), fixed by excluding it from that column set the same way `id`/`spawngroupID` already were.
- **Spawngroups tab, added 2026-07-19** — a fifth peer tab, the roadmap item proposed at the end of the Grids tab work ("view the spawngroup diff side-by-side source and sink, from a zone perspective"). Backed by `CompareSpawnGroups()`/`SyncSpawnGroup()` (see Key Functions/Types above). Two decisions carry the feature, both settled via discussion before writing code:
  - **Ambiguous matches are flagged, never guessed.** A source spawngroup's member spawn2 coordinates might resolve to more than one distinct sink spawngroup if the two databases have genuinely diverged on which pool serves which spot. Rather than picking a majority match, `CompareSpawnGroups` marks the row `"ambiguous"` and lists every candidate sink spawngroupID (`AmbiguousSinkGroupIds`) — same "shared data gets flagged, not silently resolved" rule used everywhere else spawngroup-adjacent.
  - **Syncing a spawngroup was defined to always include its entries — no fields-only or entries-only mode.** The user's own framing: "Syncing a spawngroup *must* include syncing its entries, or else it doesn't really make sense to do so." This is why `SyncSpawnGroupEntries` was generalized into `SyncSpawnGroup` (see Key Functions) rather than adding a second, narrower method next to it — the same guard (`OtherZoneUsage`) and the same confirm modal now serve both the existing Spawn Points detail panel trigger and this tab's own trigger.
  - The tab itself is intentionally the simplest of the five: no bulk selection, sort, search, or sync-preview slide-over — a spawngroup's diff status is reviewed and synced one row at a time from the detail panel, the same interaction shape the entries-only sync always had, just now also covering fields.
- Per-item deselection within the sync preview (currently the preview reflects exactly what was checked in the diff view; there's no way to uncheck an individual NPC from the preview panel itself)
- **Safely sync the shared reference tables an NPC points to** (`loottable`, `npc_faction`, `npc_spells`, `merchantlist`, alternate currency — see "What gets queued as TODO" below) instead of only flagging them for manual reconciliation. Currently deferred because these tables are *shared across many NPCs* — blindly overwriting one on sync risks corrupting loot/faction/spells for every other NPC that also references the same row. Any real implementation needs a design for detecting "is this shared row actually different, and is it safe to touch" before it can replace the TODO-queue approach.

### What gets queued as TODO (not synced):
- `loottable` / `loottable_entries` / `lootdrop` / `lootdrop_entries` (via `loottable_id`)
- `npc_faction` / `npc_faction_entries` (via `npc_faction_id`)
- `npc_spells` / `npc_spells_entries` (via `npc_spells_id`)
- `merchantlist` (merchant inventory, via `merchantid`)
- alternate currency definition (via `alt_currency_id`)
- `npc_emotes` (not yet detected — no FK column for this on `npc_types` in the current schema)
- `buildTODOItems()`'s `fkFields` list is the authoritative source of which columns are checked — it should stay in sync with `App.jsx`'s `fieldGroups.references`, since that's where these five were originally identified. If a future EQEmu schema variant adds another NPC-referencing shared table, both places need updating.

## EQEmu Schema Notes
- **Spawn point identity is coordinates, not IDs.** `npc_types.id` is trustworthy as a stable cross-database identifier because it comes from shared content lineage — that's the whole app's foundational assumption. A *newly-added* `spawn2`/`spawngroup` row has no such guarantee: its ID is just whatever source's own auto-increment counter assigned, with no meaning in the sink. So creating a new spawn point (see "Per-NPC spawn point creation" under Sync Design) can't reuse the "insert with source's ID" pattern used everywhere else — it always lets the sink assign fresh IDs. The thing that *is* stable across two diverged databases is physical location: an exact `(x, y, z)` match against an existing sink `spawn2` row in the same zone/version is treated as "this spawn point already exists, possibly serving a different NPC now" (e.g. old NPC deleted from a spawnentry, new NPC added in its place, same physical spot) — and when that happens, the NPC is skipped and flagged, never auto-merged/guessed. Same "shared data gets flagged, not silently resolved" philosophy as loot/faction/spells.
- **Shared spawn pools are skipped, not cloned.** A `spawngroup` in EQEmu is often a weighted pool of *several* NPCs — "spawn the apprentice, initiate, or neophyte here, by chance" — reused across many physical `spawn2` locations (dungeon-style zones like Befallen can have dozens). Per-NPC spawn creation only ever builds a fresh *single-NPC* spawngroup for the one NPC being synced; it deliberately does not try to reconstruct "the same pool, now also containing whichever of these NPCs got synced" — that's real complexity with real ways to get subtly wrong. So `getSourceSpawnCandidates()` checks `spawnentry WHERE spawngroupID = ? AND npcID != ?`: if any *other* NPC shares the source spawngroup, the candidate is treated as `SharedPool = true` and the whole NPC is skipped+flagged, same as a coordinate conflict. Caught live: syncing 3 NPCs from one shared undead-camp pool in Befallen was about to create 137 spawn2 rows (~45 real physical locations × 3 NPCs, each independently cloning the same shared spots) before this check existed.
- **`sinkSpawnPointExists()` must not trust `a.sinkDB` alone for duplicate detection within a single `Sync()` call.** It queries the connection pool, which cannot see this transaction's own uncommitted writes (standard transaction isolation — a write isn't visible to *any* other connection, in-pool or not, until commit) — and during a dry run there's no transaction at all to check against. Two NPCs sharing nearby spawn locations could each independently see "no conflict" and create duplicates. Fixed with an in-memory `claimedThisSync map[[3]float64]int64` built up across the loop, checked in addition to the DB — this is what actually caught the 137-spawn-point case above in combination with the shared-pool check.
- **`spawngroup.name` is `UNIQUE` on both databases, confirmed via `SHOW CREATE TABLE` on real source/sink schemas — but it's not a candidate for "must match source exactly" the way coordinates are.** It's cosmetic (nothing reads it to decide gameplay) and, like `spawngroup.id`, it's an auto-generated "Nth group created for this zone" label — local creation history, not shared content identity. Two independently-evolved databases can each have their own, unrelated `gukbottom_61`. `Sync()` tries source's exact name first (matching source whenever nothing prevents it is still the goal), and only falls back to a disambiguated `<name>_npc<id>` if that specific insert fails with MySQL error 1062 (duplicate entry) — `isDuplicateEntryError()` checks the error number specifically via `errors.As` + `*mysql.MySQLError`, not a generic "the insert failed" catch-all, so an unrelated failure still surfaces as a real error instead of silently retrying. `updateSpawnGroupFields()` (added 2026-07-19 for the Spawngroups tab) excludes `name` from the columns it copies for the same reason — syncing a spawngroup's other fields shouldn't silently rename it on the sink.
- **`spawngroup`'s own columns have real schema drift too, confirmed via fresh `SHOW CREATE TABLE` on both databases while designing the Spawngroups tab (2026-07-19) — source has 4 columns sink doesn't: `rand_spawns`, `rand_respawntime`, `rand_variance`, `rand_condition_`.** Columns common to both: `spawn_limit`, `dist`, `max_x`/`min_x`/`max_y`/`min_y` (the wander box), `delay`, `mindelay`, `despawn`, `despawn_timer`, `wp_spawns`. Handled the same way as every other drift in this app — `getSinkColumns()` filters to what the sink actually has, so the extra source-only columns are simply never written rather than causing an error.
- **A source spawngroup's member spawn2 locations can resolve to more than one distinct sink spawngroup — flagged as `"ambiguous"`, never auto-resolved.** Two databases that have diverged enough could have some of a spawngroup's locations pointing at one sink pool and others at a different one. `CompareSpawnGroups` (added 2026-07-19, see Sync Design) surfaces every distinct sink spawngroupID found this way instead of picking a majority match — consistent with every other "shared data, ambiguous or otherwise risky" situation in this app being something to stop on and let a human resolve, not guess through.
- **Quest-spawned NPCs have no `spawn2` row at all** — content summoned entirely by quest script (`quest::spawn2()` at runtime) is real, common content (canonically Vex Thal), not an edge case. `npc_types.id` is namespaced per zone as a reliable fallback signal: `id` falls in `[zoneidnumber*1000, zoneidnumber*1000+1000)`. Verified against real data: Vex Thal's `zoneidnumber` is 158; Aten_Ha_Ra (158436) and Diabo_Xi_Va (158445) both satisfy `id / 1000 == 158`. No known exceptions. `GetNPCsForZone` uses this as a secondary discovery path — **only** when the NPC has no `spawn2` row in *any* zone, never as a tiebreaker against a real spawn point elsewhere (an NPC properly spawned in zone A isn't pulled into zone B's list just because its ID coincidentally falls in B's block).
- `zone.short_name` is NOT unique by itself — the `zone` table is keyed by `(short_name, version)`, e.g. two rows can both be `short_name = 'arena'` with different `version` values (different content revisions of the same zone). `zone.id` is the only genuinely unique column. `spawn2` mirrors this: it has its own `zone` and `version` columns, and a spawn point belongs to one specific `(zone, version)` pair. Any query joining through `spawn2` (like `GetNPCsForZone`) must filter on both columns or it'll silently merge NPCs from multiple zone versions together.
- **`grid`/`grid_entries` are directly zone-scoped, unlike `spawngroup` — confirmed via `SHOW CREATE TABLE` on both databases.** `grid` is `PRIMARY KEY (zoneid, id)`, `grid_entries` is `PRIMARY KEY (zoneid, gridid, number)`; `zoneid` on both is a plain `int` (`zone.zoneidnumber`, not `zone.short_name` — the numeric ID already threaded through the app for the quest-spawn ID-range check), and **neither table declares `AUTO_INCREMENT`**. That combination — scoped to one zone, not database-wide, and not auto-generated — is why `grid.id` is trusted as identity within a zone (see `GridPoint`), unlike `spawngroup.id`/`spawn2.id`. Neither table has a `version` column, but `zoneidnumber` is expected to already be unique per `(short_name, version)` (a version bump is a distinct content revision with its own ID block, same assumption the quest-spawn fallback already makes), so this shouldn't create cross-version ambiguity.
- NPC spawn chain: `spawn2 → spawngroup → spawnentry → npc_types`
- Same NPC name can have multiple IDs (different levels/genders)
- Source DB has 136 npc_types columns, sink has 131 (schema drift)
- Old EQEmu schema: separate NPC per level; new schema: `level`+`maxlevel`+`scalerate`
- `loottable_id`, `npc_spells_id`, `npc_faction_id` are foreign keys to shared tables
- Shared tables (loot, faction, spells) can't be safely synced per-NPC without risk

## Repo Meta
- `README.md` — rewritten 2026-07-18 into a proper project README (problem statement, Available now/In progress feature split, setup/build instructions, roadmap). Don't regenerate from the Wails template; update in place as features land, keeping the "Available now" vs "In progress" split honest.
- `LICENSE` — MIT, added 2026-07-18.
- `npc_types` sync (preview + execute) landed 2026-07-18 — see Sync Design above. If `README.md`'s Available now/In progress split still lists NPC sync as in-progress, it should be updated to match.
- UI/UX hardening pass, 2026-07-18: Confirm Sync modal, `0600` config permissions, connection error surfacing + `?timeout=5s` dial bound, zone-loading state (with stale-row clearing), zone-identity fix (`Id` not `ShortName`), zone-version scoping fix in `GetNPCsForZone`/`CompareZones`/`Sync` (see EQEmu Schema Notes), WKWebView autocapitalize/autocorrect hardening on all text inputs, Escape-to-close on both modals, zone list locked during sync preview, stale NPC Detail panel clearing on zone switch/sync completion. See Important Go/Frontend Implementation Details above for specifics.
- Quest-spawned NPC detection, 2026-07-18: `GetNPCsForZone`/`CompareZones`/`Sync` gained a `zoneIdNumber` param and a zone-ID-range fallback discovery path for NPCs with no `spawn2` row anywhere (e.g. Vex Thal). `NPC.HasSpawnPoint` marks which path found each NPC; narrows the earlier blanket "new NPCs can't sync" rule to only NPCs that actually need a spawn point. See EQEmu Schema Notes and the Sync Design "In progress" section.
- Per-NPC spawn point creation + TODO checklist tab, 2026-07-19: see Sync Design above for both.
- Spawn Points tab, 2026-07-19: `CompareSpawns`/`SyncSpawnPoints` + the new `PoolEntry`/`SpawnPoint`/`SpawnDiffRow`/`SpawnSyncOptions`/`SkippedSpawn`/`SpawnSyncResult` types on the Go side; a third "Spawns" tab (diff table, detail panel with Location/Behavior/Pool sections, own sync preview + confirm modal) on the frontend. See Key Types, Key Functions, and Sync Design above.
- Spawn Points tab terminology + UX pass, 2026-07-19: renamed "Pool" to "spawngroup"/"spawn entries" throughout (row summaries, skip reasons, confirm modal, detail panel) to match EQEmu's own vocabulary. Tab renamed "Spawns" → "Spawn Points" for consistency with the detail panel's title and the sync button text.
- Spawn Points tab design-review pass, 2026-07-19: added `SpawnDiffRow.FieldsDiffer` (Go) so "modified" rows that are only different in their spawn entries — which Sync never touches — render and select differently from rows Sync can actually fix (see the "Modified doesn't always mean syncable" note above). Added spawn-specific sort (Status/Spawngroup/Shared) and a spawngroup/NPC-name search filter to the diff list, a selection-count denominator ("N of M"), consistent `spawnRowLabel()` context on skipped preview items, aligned "shared ×N" wording between the row badge and detail panel, and a soft field-priority ordering in the Behavior section.
- Spawn Points detail panel iteration, 2026-07-19 (same day, follow-up): the inline relationship diagram from the pass above was reverted in favor of moving the spawngroup name into the Spawn Entries section header (proximity to what it describes) plus a `showSpawnHelp` right-edge drawer for the general spawn2/spawngroup/spawn-entry explanation, triggered by a "?" button — see the two bullets above this in Important Frontend Implementation Details for the reasoning. Location fields also became three axis-labeled rows (`x`/`y`/`z`) instead of a bare `(x, y, z)` tuple, since EQ's in-game `/loc` reports `Y, X, Z` while the database stores `X, Y, Z` — labeling removes the ambiguity regardless of which order someone expects.
- **`toFloat64()` float32 bug fix, 2026-07-19 (same day, found via user report):** every row in the Spawn Points tab was showing the same sink coordinates and spawngroup for every source row — caught because a matched row is supposed to be *structurally guaranteed* to show identical source/sink coordinates (that's the whole premise of coordinate-based matching), so seeing them differ was the tell that mismatched rows were being paired together at all. Root cause: `toFloat64()` (see Important Go Implementation Details) had no `float32` case, silently zeroing every spawn2 x/y/z on both databases, which collapsed `CompareSpawns`'s coordinate matching onto a single `(0,0,0)` key for the whole zone. Same missing case also affected `spawnCandidatesForNPC`'s conflict-check coordinates (false negatives against real sink conflicts) and `claimedThisSync`'s in-batch duplicate guard (false positives — every candidate after the first in one `Sync()` call looked like it collided with the first, since all their keys were also `(0,0,0)`, so only the first NPC in a multi-NPC batch needing a new spawn point would actually get one). Spawn2 rows that *were* created were still written with correct real coordinates (`createSpawnPoint` builds the INSERT from the untouched `Spawn2Fields` map, not from the zeroed derived value) — the bug corrupted matching/conflict-detection logic, not data already written to either database. First test file added to the project (`app_test.go`, `TestToFloat64`) specifically to pin this down as a regression.
- **Sync Spawn Group Entries, 2026-07-19 (same day, follow-up):** direct response to a stated workflow gap — syncing a batch of spawn2 locations left their spawngroup/spawnentries exactly as they were on the sink, with no way to bring them in line except hand-editing outside the app. Added `SyncSpawnGroupEntries()` (Go), a per-row "Sync entries from source" action with its own dry-run/confirm modal, and a `selectAllSharingSpawngroup()` quick-select. The three local `coordKey` closures in `CompareSpawns`/`SyncSpawnPoints` (and the new method) were consolidated into one shared `spawnCoordKey()` function while this was being built. See Sync Design and the two Important Go/Frontend Implementation Details bullets above for the cross-zone safety check design and why this is a separate action rather than folded into the batch spawn2 sync.
- **`scanDynamicRows()` float32→float64 normalization fix, 2026-07-19 (same day, found via user report):** selecting any "new" spawn point row and previewing a sync failed every single row with "not found in source zone data." Root cause was a second-order effect of the earlier `toFloat64()` float32 fix (see Important Go Implementation Details) — that fix corrected the *matching key* computation, but `Fields["x"]` itself still held the raw, un-widened `float32`, so the coordinate value round-tripped to the frontend and back through JSON with a different `float64` bit pattern than the one `spawnCoordKey()` computed internally moments later, failing exact-equality matching for every selected coordinate. Fixed by widening `float32` → `float64` once, at scan time, in `scanDynamicRows()` — the one shared function every dynamic row (spawn2, spawngroup, npc_types) scans through — rather than an epsilon-tolerant comparison, which would have papered over the mismatch instead of removing its source.
- **App.jsx component/lib split, 2026-07-19:** `App.jsx` (1786 lines, 59 `useState` calls, no sub-components) split into `lib/` (pure helpers) and `components/` (one file per modal/drawer/tab/panel) across four separately-verified passes. Ended at 558 lines. See Important Frontend Implementation Details above for the pass-by-pass breakdown and what deliberately stayed inline (the persistent zone header).
- **Grids tab + `updateSpawn2` pathgrid fix, 2026-07-19:** built directly after the component split, so `GridsTab`/`ConfirmGridSyncModal`/`lib/gridHelpers.js` are the first tab added as components from the start rather than extracted after the fact. Confirmed `grid`/`grid_entries` schema via fresh `SHOW CREATE TABLE` output on both databases before designing the matching strategy (see EQEmu Schema Notes) — found that `grid.id` is zone-scoped and not auto-increment, making it trustworthy identity, unlike `spawngroup.id`. That same schema check surfaced a real, already-shipped bug: `updateSpawn2()` had no exclusion for `pathgrid`, so it was silently copying source's raw value into the sink on every "modified" spawn2 sync — fixed as its own step before starting the Grids tab itself, not bundled into it. See Sync Design and Key Functions above for both.
- **Sidebar resize/collapse, NPC search filter, and a full UI/UX audit pass, 2026-07-19 (same day, later session):** the sidebar gained a drag handle (mirroring the detail panel's) and a collapse-to-rail toggle, iterated through three rounds of visual fixes purely from user-provided screenshots (sizing, clipping, contrast — no live browser access this session); `NpcsTab` gained the name filter `SpawnsTab` already had. Followed by a full read-through of every frontend component for inconsistencies/QOL gaps, with fixes applied directly rather than just reported — see the "UI/UX audit pass" and "space reclaim on the TODO tab" and "persistence" bullets under Important Frontend Implementation Details above for the specifics (unstyled modal buttons, stale tooltips, `PoolDiffers`-on-`match` badge visibility, zone list selection styling, TODO tab detail-panel reclaim, `UIPrefs` persistence, amber/orange row contrast, `ConnectModal` click-outside-to-close).
- **Spawngroups tab, 2026-07-19 (same day, follow-up):** built the roadmap item proposed during the Grids tab work. `SyncSpawnGroupEntries` was generalized into `SyncSpawnGroup` (fields + entries together, one action) after confirming with the user that syncing a spawngroup without its entries "doesn't really make sense" — the safer design also avoided a second near-duplicate write path carrying the same `OtherZoneUsage` guard. Real `spawngroup` schema pulled via `SHOW CREATE TABLE` on both databases first (found 4 source-only columns — `rand_spawns`/`rand_respawntime`/`rand_variance`/`rand_condition_` — same drift-handling as everywhere else). See Sync Design, Key Types/Functions, and EQEmu Schema Notes above for the full design (matching strategy, ambiguous-match handling, shared confirm modal).
- **`claude.md`/`CLAUDE.md` case-collision incident, 2026-07-19:** an untracked `claude.md` (lowercase) turned out to be the *same on-disk file* as the tracked `CLAUDE.md` on this case-insensitive filesystem — git's index was just confused into showing two paths for one file. Deleting the untracked "duplicate" briefly deleted the real (never-committed) file; restored from conversation context since the content was fully known, no actual data lost. If this file is still uncommitted, committing it is the real fix — git tracking it properly is what would have caught this before it became a problem.
- **SSH tunnel support, 2026-07-19 (same day, next feature):** the last "In progress" item, `ConnectionConfig.UseSSH`/`SshConfig` had existed as unused fields since early in the project. `SshConfig` gained real auth fields (`AuthMethod`/`Password`/`PrivateKeyPath`/`Passphrase`, replacing a single unused `PrivateKey` string) and `Connect()` now actually opens a tunnel (`openSSHTunnel`, `golang.org/x/crypto/ssh` + `ssh/knownhosts`) when `UseSSH` is set, verifying the SSH host's key against the user's own `~/.ssh/known_hosts` rather than skipping verification — a deliberate choice given the user's stated goal of this being a tool other operators trust, not just a personal script. `ConnectModal` gained a progressive-disclosure SSH settings panel (checkbox reveals host/port/username/auth-method/key-or-password fields, plus a native file-browse button for the private key) mirroring how TablePlus/DBeaver/Navicat handle the same feature. See Key Types/Functions and Important Go/Frontend Implementation Details above for the tunnel lifecycle, host-key verification rationale, and the `connectionConfigFor()`/`hydrateSshConfig()`/`currentFullConfig()` frontend plumbing (which also fixed a small pre-existing bug: `connect()`'s save call used to omit the `UI` prefs field entirely, silently resetting sidebar/detail width on every reconnect).

## Git
- Repo: `git@github.com:nazwadi/eqemu_dsynch_tool.git`
- Branch: `main`
