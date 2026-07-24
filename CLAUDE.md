# EQEmu Data Sync Tool — Project Context for Claude Code

## Project Overview
A Wails v2 desktop app (Go backend + React frontend) for syncing EverQuest Emulator (EQEmu) database content between two MariaDB databases. Think of it as a domain-aware Navicat Data Synchronization tool that understands the EQEmu schema.

## Tech Stack
- **Backend**: Go with Wails v2, `go-sql-driver/mysql`
- **Frontend**: React + Tailwind CSS v4 + Vite
- **Platform**: Mac (M1), developed with `wails dev`
- **Node**: v22.23.1 (via nvm — must use `nvm use 22` before running)

## Project Structure

**Go backend, split into domain files 2026-07-23** (previously one 3544-line `app.go`) — pure
reorganization, zero logic changes, verified by diffing every relocated declaration against the
original file. The split follows the same domain boundaries the code was already informally
grouped into, and maps 1:1 to the frontend tabs below (`npc.go` ↔ `NpcsTab.jsx`, `spawn.go` ↔
`SpawnsTab.jsx`, etc.) — a dev reading one side can guess where the other lives. See Repo Meta for
the full pass.
```
eqemu_dsynch_tool/
├── main.go          # Wails app entry, registers App struct
├── app.go           # App struct, Config/UIPrefs/ConnectionConfig/Zone types, lifecycle
│                     (NewApp/startup/shutdown), config persistence, GetZones
├── ssh.go           # SshConfig/sshTunnel, tunnel dial/forward, Connect, PickPrivateKeyFile
├── dbutil.go        # Shared low-level helpers used across domains: toInt64/toFloat64/
│                     mapsEqual/scanDynamicRows/insertRow/existingIds/getSinkColumns/
│                     inClausePlaceholders/isDuplicateEntryError
├── npc.go           # NPCs tab: GetNPCsForZone, CompareZones, annotateMissingReferences,
│                     upsertNPC, Sync, buildTODOItems
├── todo.go          # TODO tab: TODOItem persistence (append/load/dismiss)
├── reference.go     # Faction/spells/merchant reference-comparison drawer (3 of 4 reference
│                     types — loot is its own file, see below)
├── loot.go          # Loot tab: loottable→lootdrop→lootdrop_entries tree fetch/compare
├── spawn.go         # Spawn Points tab: CompareSpawns, SyncSpawnPoints, spawn2/spawnentry
│                     fetch, collision-risk detection
├── spawngroup.go    # Spawngroups tab: CompareSpawnGroups, SyncSpawnGroup, RelocateSpawnGroup
├── grid.go          # Grids tab: CompareGrids, SyncGrids, grid/grid_entries fetch
├── idalign.go       # Generic "ID alignment" primitive (AlignId) — renumbers a sink row's local
│                     surrogate id to match source's, for lootdrop/loottable/npc_faction/
│                     npc_spells (added 2026-07-23, see Sync Design)
├── app_test.go      # (superseded — see dbutil_test.go/spawn_test.go/grid_test.go below)
├── dbutil_test.go   # Table-driven tests for dbutil.go's pure helpers (toFloat64/toInt64/
│                     mapsEqual/inClausePlaceholders)
├── spawn_test.go    # TestSpawnEntriesEqual
├── grid_test.go     # TestGridEntriesEqual
└── frontend/
    └── src/
        ├── App.jsx        # Coordinator: zone-identity state, activeView, expandedSections,
        │                   selectZone's cross-tab reset/reload fan-out, and the JSX layout —
        │                   576 lines as of the 2026-07-23 hooks split (was 1125; see Repo Meta)
        ├── hooks/          # Custom hooks, one per tab/domain — each owns that domain's
        │   │               useState + handler functions, returned as a plain object;
        │   │               cross-hook dependencies are explicit function parameters, not
        │   │               implicit shared closure scope (see each hook's own header comment)
        │   ├── useUIPrefs.js            # sidebar/detail width + collapsed state
        │   ├── useConnections.js        # source/sink connection state, SSH config, Config
        │   │                             file load/save lifecycle (including UI prefs)
        │   ├── useReferenceDrawer.js    # faction/spells/merchant drawer
        │   ├── useNpcSync.js            # NPCs tab
        │   ├── useTodo.js               # TODO tab
        │   ├── useSpawnSync.js          # Spawn Points tab
        │   ├── useSpawnGroupsTab.js     # Spawngroups tab's own diff/selection
        │   ├── useSpawnGroupSync.js     # "Sync spawngroup from source" confirm flow,
        │   │                             shared by the Spawn Points and Spawngroups tabs
        │   ├── useRelocateSpawnGroup.js # Relocate-and-reclaim confirm flow
        │   ├── useGridSync.js           # Grids tab
        │   ├── useLoot.js               # Loot tab
        │   ├── useAlignId.js            # Confirm flow for the generic AlignId primitive,
        │   │                             triggered from the Loot tab (added 2026-07-23)
        │   └── useModalFocusTrap.js     # Shared focus-on-open + Escape-to-close behavior,
        │                                 used by all 9 modal/drawer components below
        ├── lib/            # Pure helpers/constants, no React or component state
        │   ├── constants.js
        │   ├── npcHelpers.js
        │   ├── spawnHelpers.js
        │   ├── gridHelpers.js
        │   ├── spawnGroupHelpers.js
        │   └── lootHelpers.js
        └── components/     # Presentational components, one per modal/drawer/tab/panel
            ├── ConnectModal.jsx, ConfirmSyncModal.jsx, ConfirmSpawnSyncModal.jsx,
            │   SpawnHelpDrawer.jsx, ConfirmSpawnGroupSyncModal.jsx, ConfirmGridSyncModal.jsx,
            │   ConfirmRelocateSpawnGroupModal.jsx, ConfirmAlignIdModal.jsx, ReferenceDrawer.jsx
            ├── FactionComparison.jsx, SpellsComparison.jsx, MerchantComparison.jsx
            ├── Sidebar.jsx
            ├── NpcsTab.jsx, SpawnsTab.jsx, TodoTab.jsx, GridsTab.jsx, SpawngroupsTab.jsx,
            │   LootTab.jsx
            └── DetailPanel.jsx  # Thin dispatcher on activeView + shared chrome; each tab's
                own content lives in its own NpcDetailPanel.jsx/SpawnDetailPanel.jsx/
                GridDetailPanel.jsx/SpawnGroupDetailPanel.jsx (split 2026-07-23, mirroring the
                NpcsTab/SpawnsTab/etc. split)
```

## Go Backend — Key Types

*As of the 2026-07-23 file split (see Project Structure above), these types are organized across
`app.go`/`ssh.go`/`npc.go`/`todo.go`/`reference.go`/`loot.go`/`spawn.go`/`spawngroup.go`/`grid.go`
rather than one `app.go` — the domain each type belongs to (NPC/spawn/spawngroup/grid/etc.) is the
same domain grouping the section headers below already use, so file location isn't re-annotated
per type.*

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
    MissingReferences map[string]bool  // by field name (npc_faction_id/npc_spells_id/merchant_id) — set only when at least one is dangling in THIS NPC's own database, see annotateMissingReferences
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
    DryRun        bool
    NPCIds        []int64  // empty = all NPCs in zone
}

// SyncResult carries no spawn-point fields — Sync() only ever touches npc_types (see the removal
// of per-NPC spawn point creation under Sync Design). An NPC syncs regardless of whether it has a
// spawn point yet; spawn2 creation belongs exclusively to the Spawn Points tab (SyncSpawnPoints).
type SyncResult struct {
    DryRun     bool
    NPCsSynced []int64
    Skipped    []SkippedNPC // NPCs deliberately not synced (not found in source) — every NPCId ends up in exactly one of NPCsSynced or Skipped
    TODOItems  []TODOItem
    Errors     []string     // genuine unexpected failures only — never a deliberate skip, see SkippedNPC
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

// NPCFactionEntryDiff is one faction_id row from npc_faction_entries, merged across source and
// sink by faction_id — portable shared content (faction_list.id has no AUTO_INCREMENT, same trust
// tier as npc_types.id), not the local surrogate npc_faction.id itself.
type NPCFactionEntryDiff struct {
    FactionID      int64
    FactionName    string
    SourceExists   bool  // distinguishes "no entry for this faction" from "an entry that's all zeros"
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
// "npc_faction_id" reference — the first of four reference-comparison types built this way. Each
// gets its own concrete type rather than a shared generic shape, since each FK's target is a
// genuinely different structure (loot's two-level loottable→lootdrop nesting alone rules that
// out); what IS shared across all four is the trigger mechanism and drawer chrome on the frontend.
type NPCFactionComparison struct {
    SourceId     int64  // this NPC's npc_faction_id on source; 0 if it has no faction link there
    SinkId       int64
    SourceFields map[string]interface{}  // npc_faction header row, minus id — nil if SourceId == 0
    SinkFields   map[string]interface{}
    Entries      []NPCFactionEntryDiff
}

// NPCSpellsEntryDiff is one spellid row from npc_spells_entries, merged by spellid (portable,
// spells_new.id has no AUTO_INCREMENT). Entry fields are a dynamic map, not hardcoded struct
// fields like NPCFactionEntryDiff — npc_spells_entries has 16 columns with no single "the
// important one" the way faction's value/npc_value/temp are, so this follows spawn2's Behavior
// section's drift-tolerant approach instead.
type NPCSpellsEntryDiff struct {
    SpellID      int64
    SpellName    string
    SourceExists bool
    SourceFields map[string]interface{}  // npc_spells_entries columns, minus id/npc_spells_id/spellid
    SinkExists   bool
    SinkFields   map[string]interface{}
    Differs      bool
}

// NPCSpellsComparison is the read-only source-vs-sink view behind the "npc_spells_id" reference.
// SourceFields/SinkFields include parent_list, deliberately shown as a plain field rather than
// resolved or walked — auto-following a spell list's parent chain risks pulling in spells that
// aren't really this encounter's own.
type NPCSpellsComparison struct {
    SourceId     int64
    SinkId       int64
    SourceFields map[string]interface{}  // npc_spells header row, minus id
    SinkFields   map[string]interface{}
    Entries      []NPCSpellsEntryDiff
}

// NPCMerchantEntryDiff is one item row from merchantlist, merged by item (portable, items.id has
// no AUTO_INCREMENT) — not slot: merchantlist's PRIMARY KEY is (merchantid, slot) but its UNIQUE
// KEY is (merchantid, item), so item is the real identity and slot is closer to a display order.
type NPCMerchantEntryDiff struct {
    ItemID       int64
    ItemName     string
    SourceExists bool
    SourceFields map[string]interface{}  // merchantlist columns, minus merchantid/item
    SinkExists   bool
    SinkFields   map[string]interface{}
    Differs      bool
}

// NPCMerchantComparison is the read-only source-vs-sink view behind the "merchant_id" reference.
// Unlike npc_faction/npc_spells, merchantlist has no separate header/parent row — npc_types.
// merchant_id points straight at merchantlist rows, by merchantlist's own "merchantid" column
// (the two tables spell it differently — see EQEmu Schema Notes) — so there's no profile to fetch,
// just each side's rows diffed directly.
type NPCMerchantComparison struct {
    SourceId int64  // this NPC's merchant_id on source; 0 if no merchant link there
    SinkId   int64
    Entries  []NPCMerchantEntryDiff
}

// LootDropEntry is one item within a lootdrop — the leaf level, keyed by the portable item_id.
type LootDropEntry struct {
    ItemID   int64
    ItemName string
    Fields   map[string]interface{}  // lootdrop_entries columns, minus lootdrop_id/item_id
}

// LootDrop is one lootdrop_id's own fields plus its full item list. lootdrop.id is a local
// surrogate (AUTO_INCREMENT on both databases) — same untrustworthy-across-databases category as
// spawngroup.id, shown for reference only, never matched against the other database's lootdrop.id.
type LootDrop struct {
    Id          int64
    Fields      map[string]interface{}  // lootdrop columns, minus id
    SharedCount int  // OTHER loottables in this SAME database referencing this lootdrop_id — mirrors SpawnPoint.LocationSharedCount's "shared ×N" signal
    Entries     []LootDropEntry
}

// LootTableEntry is one loottable_entries row: a reference to one LootDrop plus this loottable's
// own weighting for it (multiplier/droplimit/mindrop/probability).
type LootTableEntry struct {
    LootDropId int64
    Fields     map[string]interface{}  // loottable_entries columns, minus loottable_id/lootdrop_id
    Drop       *LootDrop  // nil if lootdrop_id doesn't resolve to a real lootdrop row on this side (orphaned reference, shown not hidden)
}

// LootTable is one loottable_id's own fields plus its full ordered entries. loottable.id is also
// a local surrogate, same reasoning as LootDrop.
type LootTable struct {
    Id      int64
    Fields  map[string]interface{}  // loottable columns, minus id
    Entries []LootTableEntry
}

// NPCLootComparison is the read-only source-vs-sink view behind the Loot tab — anchored by an NPC
// (portable npc_types.id resolves each side's own loottable_id independently, same pattern as the
// other three reference types) or by a raw loottable_id typed directly for one side. Deliberately
// does NOT pair SourceTable's and SinkTable's LootDrops against each other: unlike spawngroup
// (which at least has spawn2 coordinates as an anchor), lootdrop has nothing linking it across
// databases, and lootdrop.name is exactly as unreliable as spawngroup.name was for the same
// reason. Renders two independent trees side by side rather than claiming a correspondence it
// can't verify — same restraint already applied to alt_currency (dropped rather than guessed) and
// ambiguous spawngroup matches (flagged, not resolved).
type NPCLootComparison struct {
    SourceId    int64  // this NPC's loottable_id on source; 0 if none
    SinkId      int64
    SourceTable *LootTable  // nil if SourceId == 0 or doesn't resolve
    SinkTable   *LootTable
}

// SpawnEntry is one NPC in a spawn point's weighted spawngroup (a spawngroup's spawnentry rows).
type SpawnEntry struct {
    NPCID    int64
    NPCName  string  // resolved against the database this entry was fetched from; if Orphaned, recovered from the OTHER database instead
    Chance   int64
    Orphaned bool  // true if npcID didn't resolve to a real npc_types row in the database this was fetched from
}

// SpawnPoint is one spawn2 row plus its linked spawngroup settings and full spawn entries roster.
// Identity across databases is coordinates (Fields["x"/"y"/"z"]), not Id — see "Spawn point identity" below.
type SpawnPoint struct {
    Id                  int64
    SpawnGroupId        int64
    SpawnGroupFields    map[string]interface{}  // dynamic spawngroup columns, minus id — includes "name"; nil if SpawnGroupMissing
    SpawnGroupMissing   bool                    // true if SpawnGroupId doesn't correspond to any real spawngroup row — a dangling reference (see SyncSpawnPoints under Sync Design)
    PathgridMissing     bool                    // true if Fields["pathgrid"] is nonzero but doesn't correspond to any real grid row for this zone in this same database — read-only diagnostic, see CompareSpawns
    LocationSharedCount int                     // OTHER spawn2 rows (this zone/version) sharing this spawngroupID — drives the "shared ×N" badge
    Fields              map[string]interface{}  // dynamic spawn2 columns, minus id/spawngroupID
    SpawnEntries        []SpawnEntry
}

// SpawnDiffRow mirrors NPCDiffRow, but matched by coordinate (see SpawnPoint) not ID.
type SpawnDiffRow struct {
    Status              string  // "new" | "modified" | "removed" | "match"
    Source              *SpawnPoint
    Sink                *SpawnPoint
    FieldsDiffer        bool  // true if Source/Sink spawn2 columns differ — the only thing "modified" status actually lets Sync fix
    SpawnEntriesDiffer  bool  // true if Source/Sink spawn entries composition differs — never auto-synced, always flagged for manual review
    // Status can be "modified" from FieldsDiffer alone, SpawnEntriesDiffer alone, or both — see the
    // "modified doesn't always mean syncable" note under Important Frontend Implementation Details.
    SpawnGroupCollisionRisk bool  // "new" rows only: Source's raw SpawnGroupId already exists as a real spawngroup on the SINK, before this location ever referenced it — cross-database check, categorically different from SpawnPoint.SpawnGroupMissing's same-database check; see annotateSpawnGroupCollisionRisk
}

type SpawnSyncOptions struct {
    ZoneShortName  string
    ZoneVersion    int8
    DryRun         bool
    SpawnIds       []int64       // sink spawn2.id — "modified" rows being synced (UPDATE spawn2's own columns only, spawngroupID untouched)
    NewSpawnCoords [][3]float64  // source (x,y,z) — "new" rows being synced (plain INSERT of spawn2's own columns, spawngroupID copied verbatim from source — see SyncSpawnPoints)
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
    Created        bool  // true if the sink's spawngroupID was dangling and a fresh one got created, repointing every sink spawn2 row that shared the dangling id — false means an existing sink spawngroup was updated in place
    FieldsChanged  bool  // whether the spawngroup's own columns (spawn_limit, wander box, etc.) differed and were (or would be) updated — always true when Created
    EntriesBefore  int
    EntriesAfter   int
    OtherZoneUsage []SpawnGroupZoneUsage  // non-empty means blocked — nothing was changed
    NotFound       bool                   // true if no sink spawn2 exists at this location yet
}

// RelocateSpawnGroupOptions identifies a sink spawngroup id flagged as SpawnDiffRow.
// SpawnGroupCollisionRisk — occupied by content unrelated to ZoneShortName/ZoneVersion — and the
// source content that should replace it there once freed. Not identified by a spawn2 coordinate
// like SyncSpawnGroupOptions: the colliding id may not belong to any spawn2 row in this zone yet.
type RelocateSpawnGroupOptions struct {
    SpawnGroupId  int64  // the sink's colliding spawngroup id, to be freed and reclaimed
    ZoneShortName string  // spawn2 rows in THIS zone/version referencing SpawnGroupId are left alone, see RelocateSpawnGroup
    ZoneVersion   int8
    SourceFields  map[string]interface{}  // source's spawngroup fields — written to the reclaimed id
    SourceSpawnEntries []SpawnEntry
    DryRun        bool
}

// RelocateSpawnGroupResult previews/reports a relocate-and-reclaim. SquatterUsage is every OTHER
// (zone, version) currently referencing SpawnGroupId — the confirm-step preview. ThisZoneCount is
// the caller's OWN zone/version's count, never touched, shown purely so the count can be
// sanity-checked against what's actually expected there rather than assumed safe (this app has no
// way to verify every one of those rows is really waiting on the reclaim vs. a genuine unrelated
// coincidental match — see RelocateSpawnGroup's own comment). NewSpawnGroupId (where the
// squatter's content ends up) is only known once the real write happens — 0 on dry run.
type RelocateSpawnGroupResult struct {
    DryRun          bool
    SpawnGroupId    int64
    SquatterName    string
    NewSpawnGroupId int64
    SquatterUsage   []SpawnGroupZoneUsage
    ThisZoneCount   int
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
    SourceSpawnEntries    []SpawnEntry
    SinkSpawnEntries      []SpawnEntry
    SourceLocationCount   int  // spawn2 rows in this zone/version referencing SourceGroupId — informational only, doesn't drive Status
    SinkLocationCount     int
    FieldsDiffer          bool  // spawngroup's own columns differ, "name" excluded
    SpawnEntriesDiffer    bool
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
// something SyncGrids is allowed to fix directly, unlike SpawnEntriesDiffer.
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

// idAlignmentTarget (idalign.go, added 2026-07-23) describes one local-surrogate-ID table the
// generic AlignId primitive can operate on: its own child-entries table (fully owned content,
// moved wholesale with the row when relocating a squatter) and every external table/column that
// merely references the id (repointed in place, content untouched). spawngroup is deliberately
// NOT one of these — it keeps its own dedicated RelocateSpawnGroup, which has a zone-scoped
// carve-out these four targets have no equivalent for (see AlignId's own comment / Sync Design
// for why unconditional repoint is correct here, not just simpler).
type idAlignmentTarget struct {
    table          string  // e.g. "lootdrop"
    childTable     string  // e.g. "lootdrop_entries" — this row's own content
    childParentCol string  // e.g. "lootdrop_id" — the FK column in childTable pointing back at table.id
    externalRefs   []fkRef // other tables/columns referencing table.id, e.g. loottable_entries.lootdrop_id
}

type fkRef struct{ table, column string }

// AlignIdOptions requests renumbering a sink row's local surrogate ID (SinkId) to match source's
// id for the same logical content (SourceId) — see AlignId's doc comment for the full semantics
// (a rename, not a content overwrite like RelocateSpawnGroup).
type AlignIdOptions struct {
    Target   string // key into idAlignmentTargets: "lootdrop" | "loottable" | "npc_faction" | "npc_spells"
    SourceId int64  // sink's row will be renumbered to this
    SinkId   int64  // sink's current id for the same logical content, being renamed away from
    DryRun   bool
}

type AlignIdResult struct {
    DryRun                 bool
    RenamedFrom, RenamedTo int64
    SquatterSummary        string // best-effort label ("name" field if the target row has one, else "record #N") — "" if SourceId was free, nothing evicted
    SquatterEvicted        bool
    NewSquatterId          int64 // where the squatter ends up — 0 on dry run or if no squatter
    ReferencesRepointed    int   // rows across childTable + externalRefs currently pointing at SinkId that will move to SourceId
}
```

## Go Backend — Key Functions

*Same file-split note as Key Types above — e.g. `Connect`/`openSSHTunnel` live in `ssh.go`,
`CompareZones`/`Sync` in `npc.go`, `CompareSpawns`/`SyncSpawnPoints` in `spawn.go`, and so on
following each function's own domain; see Project Structure for the full file list.*

- `Connect(c *ConnectionConfig, isSource bool) error` — connects to DB, pings, sets pool settings. **When `c.UseSSH` is true (added 2026-07-19), opens an SSH tunnel first** (`openSSHTunnel`) and points `sql.Open` at the tunnel's local forwarding address instead of `c.Host`/`c.Port` — the DB driver never knows a tunnel is involved, it just connects to `127.0.0.1:<ephemeral>`. DSN is built via `mysql.Config`/`FormatDSN()` (fixed 2026-07-20 — was raw string concatenation, which silently misparsed a username/password containing `@`/`:`/`/`/`?` into the wrong host or database instead of failing loudly). Closes any pre-existing tunnel **and** `sql.DB` pool on that side before replacing them (fixed 2026-07-20 — a stale tunnel is a live goroutine + open listener that would otherwise run forever, and `sql.DB` has no finalizer either: dropping the reference without calling `Close()` leaked its pooled connections, up to `MaxOpenConns`, for the rest of the process's life on every reconnect. `shutdown()` closing `sourceDB`/`sinkDB` only ever covered the *last* one). No mutex protects `sourceDB`/`sourceTunnel`/`sinkDB`/`sinkTunnel` — two `Connect()` calls racing on the *same* side (not source-vs-sink, which touch disjoint fields) could still leak a pool/tunnel; not fixed, since real protection would mean auditing every read site across the file, not just this function
- `openSSHTunnel(cfg SshConfig, remoteHost, remotePort string) (*sshTunnel, string, error)` — dials the SSH server (`sshAuthMethods` for the auth method, `sshHostKeyDB` for host-key verification **and** `HostKeyAlgorithms` pinning, see below), then opens a local listener bound to `127.0.0.1:0` (OS-assigned ephemeral port, loopback-only — so source and sink tunnels never collide and nothing outside this machine can reach the forwarded port) and returns its address. Each accepted local connection gets forwarded through the SSH client to `remoteHost:remotePort` by `forwardConn` (its own goroutine pair, one per direction, so one slow client can't stall others sharing the tunnel)
- `sshHostKeyDB() (*knownhosts.HostKeyDB, error)` — verifies the SSH server's host key against the user's own `~/.ssh/known_hosts`, deliberately **not** `ssh.InsecureIgnoreHostKey()`. Same trust model the system `ssh`/`git` already use on this machine; if the host isn't already known, `ssh.Dial` fails with a `knownhosts` error rather than silently trusting whatever key the server presents — the fix is the same one `ssh` itself would prompt for (connect via a terminal once to add it), not something this app tries to paper over with a TOFU prompt of its own. Uses `github.com/skeema/knownhosts` (a thin wrapper around `x/crypto/ssh/knownhosts`) rather than that package directly — **real, shipped bug, fixed 2026-07-21:** a user with an ED25519-only entry for a host in `known_hosts` (added by the system `ssh`, which prefers ED25519 when a server offers multiple host key types) got a "knownhosts: key is unknown" error from this app even though `ssh` itself trusted the host fine. Root cause: `ssh.ClientConfig.HostKeyAlgorithms` was left unset, so `x/crypto/ssh` used its own default preference order (RSA-family algorithms before ED25519) to negotiate with the server — which, having both key types configured, presented its RSA key instead of the ED25519 one `known_hosts` actually had recorded. `openSSHTunnel` now sets `HostKeyAlgorithms: hostKeyDB.HostKeyAlgorithms(sshAddr)`, pinning the negotiation to whichever key type(s) are actually recorded for that host — the same "known_hosts already decided" trust model, just applied at negotiation time too, not only at verification time. A host with no `known_hosts` entry at all still falls through to the library default order and fails the same way it always did (`HostKeyAlgorithms()` returns `nil` for those, and `ssh.ClientConfig` treats a nil slice as "unset," not "no algorithms allowed" — checked via `!= nil`, not `len == 0`, in `x/crypto/ssh/handshake.go`)
- `sshAddr := net.JoinHostPort(cfg.Host, cfg.Port)` is computed once in `openSSHTunnel`, before building `sshClientConfig`, specifically so `hostKeyDB.HostKeyAlgorithms(sshAddr)` and the later `ssh.Dial("tcp", sshAddr, ...)` are guaranteed to look up/dial the exact same address string
- `sshAuthMethods(cfg SshConfig) ([]ssh.AuthMethod, error)` — builds exactly one `ssh.AuthMethod` from `cfg.AuthMethod`, either `ssh.Password` or `ssh.PublicKeys` (parsing the key file at `PrivateKeyPath`, with `ssh.ParsePrivateKeyWithPassphrase` if `Passphrase` is set)
- `PickPrivateKeyFile() (string, error)` — opens a native file-choose dialog (`wailsruntime.OpenFileDialog`) for the private key field, so the user can browse to e.g. `~/.ssh/id_rsa` instead of typing the path. Returns `""` with no error if the dialog is cancelled — the frontend treats an empty result as "leave the field unchanged"
- `GetZones() ([]Zone, error)` — queries source DB zone table
- `GetNPCsForZone(shortName string, version int8, zoneIdNumber int64, isSource bool) ([]NPC, error)` — discovers NPCs for a zone via two `UNION ALL`'d branches, not one `LEFT JOIN`ed query (see Important Go Implementation Details for why): (1) a real spawn2/spawngroup/spawnentry chain scoped to `(zone, version)`, or (2) — only if the NPC has no spawn2 row in *any* zone — `npc_types.id` falling in this zone's `[zoneidnumber*1000, zoneidnumber*1000+1000)` ID block, found via a primary-key range scan (quest-spawned NPCs, e.g. Vex Thal). The branches can never overlap by construction. `NPC.HasSpawnPoint` records which path found it. Returns all npc_types columns as map
- `CompareZones(shortName string, version int8, zoneIdNumber int64) ([]NPCDiffRow, error)` — diffs source vs sink NPCs by ID, scoped to one specific `(short_name, version)` zone row; calls `annotateMissingReferences` for both sides after fetching, so each `NPC.MissingReferences` is populated before the diff rows are built
- `annotateMissingReferences(ctx, db *sql.DB, npcs []NPC) error` — flags, per NPC, any of `referenceFKColumns` (`npc_faction_id`→`npc_faction.id`, `npc_spells_id`→`npc_spells.id`, `merchant_id`→`merchantlist.merchantid`, `loottable_id`→`loottable.id` — note npc_types.merchant_id and merchantlist.merchantid spell it differently, see EQEmu Schema Notes) whose nonzero value doesn't resolve to a real row in that SAME database — batched into exactly 3 queries per side via `existingIds()`, regardless of zone size. Only called from `CompareZones`, not `GetNPCsForZone` itself (which `Sync()` also uses and has no need for this), so `Sync()` doesn't pay for checks it never displays. `alt_currency_id` is the only one still excluded (unused everywhere checked)
- `existingIds(ctx, db, table, column string, ids map[int64]bool) (map[int64]bool, error)` — batch existence check via `SELECT DISTINCT <column> FROM <table> WHERE <column> IN (...)`; `table`/`column` are always one of `referenceFKColumns`'s hardcoded pairs, never user input
- `CompareNPCFaction(sourceFactionId, sinkFactionId int64) (NPCFactionComparison, error)` — fetches the `npc_faction` header row and `npc_faction_entries` for each side independently by its own raw id (no cross-database matching — the NPC that led here is the anchor), merges entries by the portable `faction_id`. `fetchNPCFactionHeader`/`fetchNPCFactionEntries` do the actual queries; `resolveFactionNames` batch-resolves `faction_list.name` for whichever `faction_id`s showed up, against the same database the entries came from
- `CompareNPCSpells(sourceSpellsId, sinkSpellsId int64) (NPCSpellsComparison, error)` — same anchor-via-NPC shape as faction. `fetchNPCSpellsHeader`/`fetchNPCSpellsEntries` fetch the raw rows; `resolveSpellNames` resolves `spells_new.name` (scanned as `sql.NullString` — unlike `faction_list.name`, this column is nullable)
- `CompareNPCMerchant(sourceMerchantId, sinkMerchantId int64) (NPCMerchantComparison, error)` — no header fetch (merchantlist has no separate profile row, see `NPCMerchantComparison`); `fetchMerchantEntries` queries `merchantlist WHERE merchantid = ?` directly, entries merged by `item`. `resolveItemNames(ctx, db, entries, idField string)` resolves `items.Name` — generalized to take the id column name as a parameter since merchantlist calls it `item` and `lootdrop_entries` calls it `item_id`
- `CompareNPCLoot(sourceLoottableId, sinkLoottableId int64) (NPCLootComparison, error)` — same anchor-via-NPC shape, one level deeper. `fetchLootTable(ctx, db, id)` builds one side's full tree: `fetchLootTableHeader` for the loottable's own fields, then `loottable_entries` for that id, then `fetchLootDrops` batch-fetches every referenced lootdrop (headers + `lootdrop_entries` + resolved item names + `lootDropSharedCounts`, 4 queries total regardless of tree size, mirroring `getSpawnPointsForZone`'s batching). A `loottable_entries` row whose `lootdrop_id` doesn't resolve to a real `lootdrop` row still produces a `LootTableEntry` with `Drop: nil`, not a silently-dropped entry
- `GetLootTable(isSource bool, loottableId int64) (*LootTable, error)` — the Loot tab's raw-ID lookup path, necessarily one-sided: `loottable_id` isn't portable across databases (same local-surrogate category as `spawngroup.id`), so a typed-in id only means something on the database it was typed against
- `Sync(options SyncOptions) (SyncResult, error)` — dry-run preview and real execution of `npc_types` sync, keyed off `options.DryRun`; see Sync Design below
- `SaveConfig(c Config) error` — saves to `~/.config/eqemu-sync/config.json`
- `LoadConfig() (Config, error)` — loads config on startup
- `LoadTODOItems() ([]TODOItem, error)` — reads `~/.config/eqemu-sync/todo.json` back, dismissed items included; frontend filters for display
- `SetTODOItemDismissed(id int64, dismissed bool) error` — archive/un-archive one TODO item by ID
- `getSpawnPointsForZone(ctx, db, shortName string, version int8) ([]SpawnPoint, error)` — zone-scoped `spawn2` fetch plus linked `spawngroup`/`spawnentry` rosters, batched into exactly 3 queries regardless of zone size (`spawn2` by zone/version, then `spawngroup`/`spawnentry` both `IN (...)` on the distinct `spawngroupID`s found) — computes `LocationSharedCount` in-memory from the same `spawn2` result set rather than a 4th query
- `resolveOrphanedSpawnEntryNames(ctx, points []SpawnPoint, otherDB *sql.DB) error` — for any spawn entry that didn't resolve against the database it came from, looks it up in the *other* database instead; see "Spawn point identity" below for why that's a recovery, not a guess
- `CompareSpawns(shortName string, version int8, zoneIdNumber int64) ([]SpawnDiffRow, error)` — App method backing the Spawn Points tab; matches source/sink `SpawnPoint`s by exact `(x,y,z)`, classifies new/modified/removed/match, and computes `FieldsDiffer`/`SpawnEntriesDiffer` independently (via `mapsEqual()`/`spawnEntriesEqual()`) before deriving `Status` — `Status = "modified"` whenever *either* flag is true, `"match"` only when both are false, so a row's status alone can't tell the frontend which kind of difference it has; that's exactly why the two flags are exposed separately rather than collapsed. `zoneIdNumber` (added alongside `PathgridMissing`) is only needed to check `pathgrid` against each database's own `grid` rows via `fetchZoneGridIds`/`annotatePathgridMissing` — `grid` is keyed by `zoneid`, not `short_name`. Also calls `annotateSpawnGroupCollisionRisk` after building `diff`, so a "new" row's `SpawnGroupCollisionRisk` is visible in the diff list before anything gets synced
- `annotateSpawnGroupCollisionRisk(ctx, sinkDB *sql.DB, diff []SpawnDiffRow) error` — for every `"new"` row, checks whether Source's raw `SpawnGroupId` already exists as a real `spawngroup` row on the sink, via one batched `existingIds` call regardless of how many "new" rows there are. Warning only — never blocks syncing the spawn2 row itself, see the field's own comment on `SpawnDiffRow` for why a pre-existing sink group at that exact number is treated as a near-certain collision, not a coincidence worth trusting
- `updateSpawn2(ctx, tx, sinkId int64, sourceFields map[string]interface{}, sinkColumns map[string]bool) error` — plain `UPDATE` of a matched spawn2 row's own columns only; never touches `spawngroupID`, so spawn entries composition is untouched no matter what this call does
- `SyncSpawnPoints(options SpawnSyncOptions) (SpawnSyncResult, error)` — dry-run/execute for the Spawn Points tab, own transaction separate from `Sync()`'s. `SpawnIds` (sink IDs, "modified" rows) go through `updateSpawn2`; `NewSpawnCoords` (source coordinates, "new" rows) are a plain `insertRow` of spawn2's own columns, with `spawngroupID` copied verbatim from source — see the "Spawn points sync verbatim" note under Sync Design for why a dangling value here is intentional, not a bug
- `SyncSpawnGroup(options SyncSpawnGroupOptions) (SpawnGroupSyncResult, error)` — dry-run/execute for reconciling one spawngroup (fields + full spawnentry roster together). Identifies the target via a spawn2 location's coordinates, same as everywhere else spawngroup identity is derived. If the sink spawn2 row's `SpawnGroupId` is dangling (`SpawnPoint.SpawnGroupMissing`), this creates a fresh spawngroup instead of updating a nonexistent one, and repoints **every** sink spawn2 row in the zone/version still carrying that same dangling id — not just the one the caller identified — since `SyncSpawnPoints` copies the identical raw source id to every location sharing a spawngroup, so one "sync spawngroup" click resolves the whole group, not one location at a time. Blocked outright (not just warned) if the sink's spawngroupID is referenced by any spawn2 row outside the caller's zone/version, same as before this create-path existed.
- `RelocateSpawnGroup(options RelocateSpawnGroupOptions) (RelocateSpawnGroupResult, error)` — resolves a `SpawnGroupCollisionRisk` (see `SpawnDiffRow`). Copies the current occupant ("the squatter") of `options.SpawnGroupId` to a freshly-assigned id via `insertRow`, repoints every spawn2 row *outside* `ZoneShortName`/`ZoneVersion` onto the new id (`UPDATE spawn2 SET spawngroupID = ? WHERE spawngroupID = ? AND NOT (zone = ? AND version = ?)` — deliberately excludes the caller's own zone, whose rows are already pointed at the id and don't need touching, just correct content once it exists there), deletes the now-vacated old row/entries, then recreates the id with `options.SourceFields`/`SourceSpawnEntries` via an **explicit `id` override on `insertRow`** — MySQL accepts a specific value on an `AUTO_INCREMENT` column as long as it's free. `fetchSpawnGroupById` fetches the squatter's own fields first (fails loudly if the id doesn't actually exist — nothing to relocate). `SquatterUsage` (every other zone/version currently referencing the id) is always computed, dry run or not, for the confirm modal's "here's what this actually touches" preview — unlike `SyncSpawnGroup`'s `OtherZoneUsage`, this never blocks; the whole point of relocating is to safely touch it once the user's seen the list
- `spawnCoordKey(p SpawnPoint) [3]float64` — the one shared coordinate-matching key, used by `CompareSpawns`, `SyncSpawnPoints`, `CompareSpawnGroups`, and `SyncSpawnGroup` (previously three separate local closures doing the same thing — extracted after the `toFloat64` float32 bug made clear how much was riding on this one calculation being consistent everywhere it's used)
- `withoutField(m, field)` — returns a shallow copy of a dynamic field map with one key removed, added 2026-07-19 specifically to exclude `"name"` from spawngroup field comparisons/updates without touching `mapsEqual()` itself (which other tables, like `npc_types`, legitimately need `"name"` included in)
- `CompareSpawnGroups(shortName string, version int8) ([]SpawnGroupDiffRow, error)` — App method backing the Spawngroups tab (added 2026-07-19). Reuses `getSpawnPointsForZone`'s existing zone-scoped fetch (this view is just a different grouping of the same spawn2/spawngroup/spawnentry data `CompareSpawns` already pulls, not a second dedicated query) — groups each side's points by `SpawnGroupId`, then for each source spawngroup checks which sink spawngroup(s) its member coordinates resolve to: zero matches is `"new"`, exactly one is `"modified"`/`"match"` (with `FieldsDiffer`/`SpawnEntriesDiffer` computed the same two-flag way as `CompareSpawns`), and more than one is `"ambiguous"` (flagged, not guessed — see EQEmu Schema Notes). Sink spawngroups no source group ever resolved to become `"removed"` rows
- `updateSpawnGroupFields(ctx, tx, sinkGroupId, sourceFields, sinkColumns) error` — updates a spawngroup's own row on the sink to match source, excluding `"name"` (cosmetic/local, see EQEmu Schema Notes) the same way `updateSpawn2()` excludes `pathgrid`/`id`/`spawngroupID`. Mirrors `updateSpawn2()`'s shape (sorted columns so `?` placeholders can't get mismatched by Go's randomized map iteration order)
- `SyncSpawnGroup(options SyncSpawnGroupOptions) (SpawnGroupSyncResult, error)` — dry-run/execute that brings a spawngroup fully in line with source: both its own fields (`spawn_limit`, wander box, timing, etc.) and its full `spawnentry` roster, together in one transaction. **Generalized 2026-07-19 from an originally entries-only `SyncSpawnGroupEntries`** — syncing a spawngroup's fields without its entries (or vice versa) doesn't correspond to anything a user actually wants, so this replaced the narrower method rather than existing alongside it. Identified via a spawn2 location's coordinates rather than a `spawngroupID` directly (same reasoning as everywhere else spawn2/spawngroup identity is coordinate-based). Before writing anything, queries the sink for every distinct `(zone, version)` a spawn2 row references that `spawngroupID` under — if that set includes anything besides the zone/version being worked on, the whole operation is blocked (`OtherZoneUsage` populated, nothing written), dry run or not. `npcID` values need no translation (portable identity, see EQEmu Schema Notes), so entries are a plain delete-then-reinsert once cleared. Deliberately its own method, not folded into `SyncSpawnPoints` — see Sync Design below. Triggered from two places in the frontend: the Spawn Points detail panel's per-row action, and the Spawngroups tab's own row action — both funnel into the same shared confirm modal
- `getGridsForZone(ctx, db, zoneIdNumber int64) ([]GridPoint, error)` — zone-scoped `grid` fetch plus its `grid_entries` waypoints, batched into exactly 2 queries regardless of zone size (`grid` by `zoneid`, then `grid_entries` by the same `zoneid`, grouped into each `GridPoint.Entries` in memory) — mirrors `getSpawnPointsForZone`'s batching shape. `zoneIdNumber` is `zone.zoneidnumber` (a plain int), not `zone.short_name` — `grid`/`grid_entries` don't use the short_name string spawn2 does
- `gridEntriesEqual(a, b []GridEntry) bool` — compares two grids' waypoint lists by `Number`, order-independent, mirroring `spawnEntriesEqual`'s shape but keyed by waypoint position instead of NPC ID
- `CompareGrids(zoneIdNumber int64) ([]GridDiffRow, error)` — App method backing the Grids tab; matches source/sink `GridPoint`s by `Id` (not coordinate — a grid is a path, not a point), computes `FieldsDiffer`/`EntriesDiffer` independently before deriving `Status`, same two-flag shape as `SpawnDiffRow`
- `insertGridEntry`/`createGrid`/`updateGrid` — shared grid-writing helpers, mirroring the create/update split `SyncSpawnPoints`'s two row paths use, but simpler: `createGrid` reuses source's own `grid.id` directly (safe here — see `GridPoint`), and `updateGrid` replaces both a grid's own fields *and* its full waypoint list (delete-then-reinsert `grid_entries`) in one call, since unlike spawn2/spawngroup there's no shared-data risk splitting fields from entries
- `SyncGrids(options SyncGridsOptions) (SyncGridsResult, error)` — dry-run/execute for the Grids tab, own transaction. Simpler than `SyncSpawnPoints`/`SyncSpawnGroupEntries`: no coordinate-conflict or shared-pool checks needed, since `grid.id` is zone-scoped (not a global auto-increment) and a grid isn't reused across unrelated things the way a spawngroup is
- `fetchRowById(ctx, q queryer, table string, id int64) (map[string]interface{}, error)` (`dbutil.go`, added 2026-07-23) — generic "fetch one row's own fields by primary key" helper, the shape `fetchSpawnGroupById`/`fetchLootTableHeader`/`fetchNPCFactionHeader` each independently duplicated; those weren't refactored to use it (out of scope, low risk either way), but new code should prefer this over another one-off copy. `queryer` is a small local interface (`QueryContext`) satisfied by both `*sql.DB` and `*sql.Tx`, so the same helper works for a pre-transaction dry-run read and a read mid-transaction — `getSinkColumns` was widened to accept `queryer` too, for the same reason (`idalign.go`'s `copyChildRows` needs it mid-transaction)
- `fetchChildRows(ctx, q queryer, childTable, parentCol string, parentId int64) ([]map[string]interface{}, error)` (`dbutil.go`, added 2026-07-23) — fetches every row of `childTable` referencing `parentId`, as dynamic field maps; used by `idalign.go` to copy a squatter's own child-entries rows to its new id during a relocate
- `AlignId(options AlignIdOptions) (AlignIdResult, error)` (`idalign.go`, added 2026-07-23) — the generic "ID alignment" primitive: renumbers `options.SinkId` to `options.SourceId` in `idAlignmentTargets[options.Target]`'s table, preserving the sink row's own field content untouched (a rename, not a content overwrite — see Sync Design for why this differs from `RelocateSpawnGroup`). Rejects `SourceId == SinkId` (nothing to do) and a missing `SinkId` row (nothing to rename) up front. If `SourceId` already exists as a different row (a squatter), `relocateRow` moves it to a fresh id first (copies its own fields via `insertRow`, its child rows via `copyChildRows`, repoints `externalRefs` off the vacated id, deletes the old row+children) — then the target row is renamed onto the now-free `SourceId` with a plain `UPDATE ... SET id = ?`, and `repointReferences` moves every row that referenced the old `SinkId` (across `childTable` and every `externalRef`) onto the new id. `countReferences` computes `ReferencesRepointed` for the dry-run preview before anything is written. Known accepted edge case, not solved: if some `loottable` already references both the old and new lootdrop ids as separate `loottable_entries` rows, the final repoint step collides with `loottable_entries`' composite primary key and fails loudly with a wrapped SQL error, rather than silently merging — rare enough (a loottable listing the same drop twice under different ids) not to special-case
- `shutdown(ctx)` — closes both DB connections and both SSH tunnels, if open

## Important Go Implementation Details

- NPC fields use `map[string]interface{}` because `SELECT nt.*` returns all columns dynamically
- `[]byte` values from MySQL are converted to strings during scan
- `toInt64()` helper handles `int64`, `[]byte`, and `string` type assertions for NPC IDs
- **`toFloat64()` must handle `float32`, not just `float64`/`[]byte`/`string` — this was a real, shipped bug (found 2026-07-19, see Repo Meta) that silently zeroed every spawn2 coordinate.** `go-sql-driver/mysql` scans a SQL `FLOAT` column as Go `float32` when the destination is `interface{}`; only `DOUBLE` columns come back as `float64`. `spawn2.x`/`y`/`z` are `FLOAT` in the standard EQEmu schema. Every coordinate-keyed operation in the app routes through this one function (`CompareSpawns`'s `coordKey`, `SyncSpawnPoints`'s conflict-check and `coordKey`, `SyncSpawnGroup`'s `coordKey`) — a missing `float32` case doesn't fail loudly, it just makes every `[3]float64` key collapse to `(0,0,0)`, so every row in a zone collides onto one map entry. Covered by `TestToFloat64` in `app_test.go`
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
- `updateSpawn2()` is an extracted, standalone function (not an `*App` method) specifically so `SyncSpawnPoints()` can call it against its own transaction — same reasoning as `scanDynamicRows()`/`mapsEqual()` already being free functions rather than methods
- **`Sync()` no longer touches spawn2/spawngroup/spawnentry at all — it upserts `npc_types` only, regardless of `NPC.HasSpawnPoint`.** Per-NPC spawn point creation (the "Create spawn points" checkbox, `SyncOptions.SyncSpawns`, `spawnCandidate`/`spawnCandidatesForNPC`/`createSpawnPoint`) was removed 2026-07-19 — see "Spawn points sync verbatim, per-NPC creation removed" under Sync Design for why

## React Frontend — Key State

*As of the 2026-07-23 hooks split (see Project Structure above), this state lives across
`frontend/src/hooks/useXxx.js` — one hook per tab/domain — rather than directly in `App.jsx`.
Grouped below by the same domain each hook owns; a state variable's own hook is named the same
as the section it's under (e.g. everything under "Connections" is `useConnections`'s own state,
returned from the hook and read in `App.jsx` as `connections.sourceConnected` etc.). Kept as
plain `useState` declarations here rather than rewritten as hook return values, since the
declarations themselves — names, initial values, comments — are unchanged; only where they're
defined moved.*

```js
// Connections (useConnections.js)
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

// Zone — zones itself is useConnections' (populated by GetZones after connect); the rest
// (search filter, selected-zone identity) stays in App.jsx, since it's genuinely cross-tab state
// every domain hook's onZoneChange/loadDiffs needs, not owned by any one tab.
const [zones, setZones] = useState([])
const [searchFilter, setSearchFilter] = useState('')
const [selectedZoneShortName, setSelectedZoneShortName] = useState('')
const [selectedZoneLongName, setSelectedZoneLongName] = useState('')
const [selectedZoneId, setSelectedZoneId] = useState(null)        // zone.Id — the only genuinely unique zone key, used for row highlighting
const [selectedZoneVersion, setSelectedZoneVersion] = useState(0) // zone.Version — threaded into CompareZones/Sync calls
const [selectedZoneIdNumber, setSelectedZoneIdNumber] = useState(null) // zone.ZoneIdNumber, shown in the zone header and threaded into CompareZones/Sync (drives the quest-spawn ID-range fallback)

// Diff (useNpcSync.js)
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

// Sync (useNpcSync.js)
const [selectedNPCs, setSelectedNPCs] = useState(new Set())
const [showSyncPreview, setShowSyncPreview] = useState(false)
const [syncPreview, setSyncPreview] = useState(null)  // dry-run SyncResult, null while loading
const [syncing, setSyncing] = useState(false)         // true while Execute Sync is in flight
const [syncOutcome, setSyncOutcome] = useState(null)  // post-execute SyncResult
const [showSyncConfirm, setShowSyncConfirm] = useState(false)  // gates Execute Sync behind a confirm modal

// TODO tab — activeView stays in App.jsx (drives which tab's JSX renders, read by every hook's
// section in the header/detail panel, not owned by any one tab); todoItems/showDismissedTodos are
// useTodo.js's.
const [activeView, setActiveView] = useState('npcs')  // 'npcs' | 'todo' | 'spawns' | 'grids' | 'spawngroups' — tab switcher in the zone header
const [todoItems, setTodoItems] = useState([])        // full archive from LoadTODOItems(), dismissed items included
const [showDismissedTodos, setShowDismissedTodos] = useState(false)

// Sidebar resize/collapse + detail panel width (useUIPrefs.js) — added 2026-07-19, persisted to
// config.json's new UI field (see UIPrefs) so they survive an app restart; loaded in
// useConnections' startup effect (which takes useUIPrefs' return value as a parameter — see
// useConnections.js), saved via persistUIPrefs() on drag-end/collapse-toggle, not on every render
const [sidebarWidth, setSidebarWidth] = useState(256)
const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
const [npcSearchFilter, setNpcSearchFilter] = useState('')  // NPCs tab name filter (useNpcSync.js), added for parity with Spawns tab's existing one

// Spawns tab (useSpawnSync.js)
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
const [showSpawnHelp, setShowSpawnHelp] = useState(false)  // right-edge drawer, see "?" button next to the detail panel title — stays a plain App.jsx toggle, not its own hook (too small, no logic beyond open/close)

// SyncSpawnGroup confirm modal state (useSpawnGroupSync.js; generalized 2026-07-19 from
// entries-only — see Key Functions) — shared by two trigger points: the Spawn Points detail
// panel's per-row action and the Spawngroups tab's own row action. Coords/entries are captured at
// open time (via openPreview) so the hook itself never needs to know which tab triggered it.
// **Changed in the 2026-07-23 hooks split**: the string-tagged spawnGroupSyncSource
// ('spawns' | 'spawngroups') dispatch was replaced by passing the actual refresh callback
// (onSuccess) into openPreview at call time — App.jsx's openSyncSpawnGroupPreviewFromSpawn/
// FromSpawnGroup wrapper functions each build the right callback for their own tab, so
// useSpawnGroupSync.js doesn't need to know about spawnSync/spawnGroupsTab's hooks at all.
const [showSpawnGroupSyncConfirm, setShowSpawnGroupSyncConfirm] = useState(false)
const [spawnGroupSyncPreview, setSpawnGroupSyncPreview] = useState(null)  // dry-run SpawnGroupSyncResult, null while loading
const [spawnGroupSyncError, setSpawnGroupSyncError] = useState(null)  // unexpected Go-level error, separate from the "blocked"/"not found" outcomes the result itself carries
const [syncingSpawnGroup, setSyncingSpawnGroup] = useState(false)
const [spawnGroupSyncCoords, setSpawnGroupSyncCoords] = useState(null)  // [x,y,z] identifying the target spawngroup, for SyncSpawnGroup
const [spawnGroupSyncEntries, setSpawnGroupSyncEntries] = useState({source: [], sink: []})  // entry preview data for the confirm modal

// RelocateSpawnGroup confirm modal state (useRelocateSpawnGroup.js) — resolves a
// SpawnGroupCollisionRisk, triggered only from the Spawn Points detail panel's collision-risk
// banner (no Spawngroups-tab equivalent trigger the way SyncSpawnGroup has two, since collision
// risk is only ever computed for "new" spawn2 rows). relocateTarget captures the colliding id
// plus source's own spawngroup content at open time — openRelocatePreview needs no extra Go call,
// both live on the selected row already. onRelocated (the Spawn Points tab refresh) is a fixed
// hook-creation-time parameter rather than a per-call callback like useSpawnGroupSync's, since
// there's only ever the one refresh target — see useRelocateSpawnGroup.js.
const [showRelocateConfirm, setShowRelocateConfirm] = useState(false)
const [relocatePreview, setRelocatePreview] = useState(null)  // dry-run RelocateSpawnGroupResult, null while loading
const [relocateError, setRelocateError] = useState(null)
const [relocating, setRelocating] = useState(false)
const [relocateTarget, setRelocateTarget] = useState(null)  // {spawnGroupId, sourceFields, sourceEntries}
// Each overlay component (ConnectModal, ConfirmSyncModal, ConfirmSpawnSyncModal, SpawnHelpDrawer,
// ConfirmSpawnGroupSyncModal, ConfirmGridSyncModal, ConfirmRelocateSpawnGroupModal,
// ReferenceDrawer) shares one useModalFocusTrap hook (frontend/src/hooks/useModalFocusTrap.js,
// added 2026-07-23) for focus-on-open + Escape-to-close, rather than each owning its own
// duplicated useRef/useEffect pair — see that hook's own header comment.

// Grids tab (useGridSync.js)
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

// Spawngroups tab (useSpawnGroupsTab.js) — no bulk-select Set or sync-preview slide-over like the
// other tabs; syncing a spawngroup is a deliberate, single-row action triggered from the detail
// panel (via useSpawnGroupSync above), mirroring how the old entries-only sync always worked, not
// a batch-checkbox flow.
const [spawnGroupDiffRows, setSpawnGroupDiffRows] = useState([])
const [spawnGroupDiffLoading, setSpawnGroupDiffLoading] = useState(false)
const [spawnGroupDiffFilter, setSpawnGroupDiffFilter] = useState('all')  // 'all' | 'diff'
const [selectedSpawnGroupRow, setSelectedSpawnGroupRow] = useState(null)

// Shared reference comparison drawer (useReferenceDrawer.js, chrome in ReferenceDrawer.jsx) — one
// open/close flag and one data slot reused across faction/spells/merchant, triggered by clicking
// a References-section row in
// the NPC detail panel (see referenceComparisonTypes in lib/npcHelpers.js, which is what decides
// whether a field is clickable at all). referenceDrawerType picks which content component
// (FactionComparison/SpellsComparison/MerchantComparison) renders inside; referenceDrawerData is
// null while loading. Loot deliberately does NOT use this drawer — see the Loot tab below for why
// (it needs its own NPC search/raw-ID entry points, which don't fit the "click a row you're
// already looking at" trigger the other three share).
const [showReferenceDrawer, setShowReferenceDrawer] = useState(false)
const [referenceDrawerType, setReferenceDrawerType] = useState(null)  // 'faction' | 'spells' | 'merchant'
const [referenceDrawerData, setReferenceDrawerData] = useState(null)  // null while loading

// Loot tab (useLoot.js) — no bulk selection or diff-list like the other tabs, closer in
// shape to the reference drawers than to a zone-scoped diff table. An NPC search (reusing
// diffRows, already zone-scoped, so picking an NPC costs no extra Go call — both sides'
// loottable_id are already sitting in that data) drives the normal two-sided lookup;
// lootRawSide/lootRawId are the one-sided "I already know the raw ID" fallback, since a raw
// loottable_id only means something on the database it came from (loottable.id is a local
// surrogate, not portable). lootComparison holds whichever of CompareNPCLoot's/GetLootTable's
// result shapes was last looked up, normalized to {SourceId, SinkId, SourceTable, SinkTable}
// either way so LootTab only needs one render path regardless of which lookup mode produced it.
// No longer strictly read-only as of 2026-07-23 — see the AlignId block below; the raw-ID lookup
// mode stays read-only-only (it's one-sided by construction, nothing to align against).
const [lootSearchFilter, setLootSearchFilter] = useState('')
const [lootRawSide, setLootRawSide] = useState('source')  // 'source' | 'sink'
const [lootRawId, setLootRawId] = useState('')
const [lootComparison, setLootComparison] = useState(null)
const [lootLoading, setLootLoading] = useState(false)
const [lootError, setLootError] = useState(null)

// AlignId confirm flow (useAlignId.js, added 2026-07-23) — triggered from the Loot tab's
// loottable-level "Align loottable ID to source" button (ids already known, no pairing needed)
// and its lootdrop-level two-step cross-column click (see LootTab.jsx's armedSourceDrop/
// armedSinkDrop, local to that component, not part of this hook — the pairing is pure UI
// interaction state, only the confirmed {target, sourceId, sinkId} pair reaches this hook).
const [showAlignConfirm, setShowAlignConfirm] = useState(false)
const [alignPreview, setAlignPreview] = useState(null)  // dry-run AlignIdResult, null while loading
const [alignError, setAlignError] = useState(null)
const [aligning, setAligning] = useState(false)
const [alignTarget, setAlignTarget] = useState(null)  // {target, sourceId, sinkId, label}

// NPC / Spawn Point / Grid / Spawngroup Detail panel (shared panel, content switches on
// activeView) — detailWidth is useUIPrefs.js's; expandedSections stays in App.jsx, since it's
// shared across every per-tab detail panel component (see DetailPanel.jsx's own comment on why
// splitting it per-panel would lose the "collapsed state persists across tab switches" behavior).
const [detailWidth, setDetailWidth] = useState(240)
const [expandedSections, setExpandedSections] = useState({
    identity: true,
    combat: true,
    resistances: false,
    ability_scores: false,
    behavior: false,
    references: true,
    spawn_behavior: true,
    spawn_entries: true
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
- The "Sync X NPCs" button is disabled the same way while `showSyncPreview` is true, forcing "← Back to Diff" before the selection can change, same reasoning as the zone list being locked above
- **`needsSpawnPoint`/the "Create spawn points" checkbox no longer exist — removed 2026-07-19, see "Spawn points sync verbatim, per-NPC creation removed" under Sync Design.** Every NPC's checkbox is now always enabled; `HasSpawnPoint === false` still drives the purple ⚡ badge (diff row + NPC Detail panel), which stays purely informational — quest-spawned, no static spawn point — not a gate on selectability
- The tab switcher (NPCs / Spawns / TODO) lives in its own `<div className="ml-auto ...">` positioned as the **last** element in the zone header row, after every conditionally-rendered control ("Sync X NPCs" for the NPCs tab, "Sync X Spawn Points" for the Spawns tab). It used to sit right after those controls with just `ml-auto` on itself; since the controls before it appear/disappear per tab, the tab buttons visually jumped left/right on every switch. Moving the switcher to always be the last sibling (so `ml-auto` has a stable amount of empty space to eat) fixed it — the controls are free to come and go without moving anything else
- `spawnKey(row)`/`spawnCoords(row)` are the spawn-tab equivalent of using `NPC.Id` for React keys and selection-`Set` membership — `spawn2` has no cross-database ID (see "Spawn point identity" below), so every spawn-row helper (selection, sort, the detail panel's "currently selected" check) keys off a `"x,y,z"` string built from `spawnCoords()` instead
- The right-hand detail panel is shared by both tabs — one `<div>`, its body branches on `activeView` (`'npcs'` renders the existing NPC field groups off `selectedNpc`, `'spawns'` renders a static location line + a Behavior field group + a Spawn Entries table off `selectedSpawnRow`, `'todo'` shows a placeholder). `expandedSections` is one shared state object for both — the NPC keys (`identity`, `combat`, ...) and spawn keys (`spawn_behavior`, `spawn_pool`) don't collide, and each tab only ever reads its own keys, so collapsed/expanded state naturally persists per-section across tab switches without extra plumbing
- The Spawn Point detail panel's "Behavior" section isn't a hardcoded field list like the NPC panel's `fieldGroups` — `spawnBehaviorFields(row)` takes the union of `Source.Fields`/`Sink.Fields` keys minus the fixed identity columns (`spawnIdentityFieldNames = ['x','y','z']`), puts a small `spawnPriorityFieldNames` set (`respawntime`/`variance`/`pathgrid`/`enabled`) first, and sorts everything else alphabetically after. `spawn2` has far fewer columns than `npc_types` and no established grouping convention, so this drift-tolerant approach (mirroring how `getSpawnPointsForZone` already treats spawn2/spawngroup columns dynamically on the Go side) was chosen over hand-maintaining an exhaustive column list that could silently go stale against either database's actual schema — the priority list is a soft ordering hint, not an authoritative allowlist like `fieldGroups` is for NPCs
- `x`/`y`/`z` are deliberately **not** in the diffable field groups at all, only `heading` is (folded into Behavior). They're the coordinate-matching key itself (see "Spawn point identity" below), so a matched row's source and sink are guaranteed bit-identical on those three by construction — showing them as a source→sink diff pair would always render as blank, wasted panel space. They're shown once, as three axis-labeled rows (`x` / `y` / `z`, each own line) above the field groups instead — not a bare `(x, y, z)` tuple, since EQ's in-game `/loc` command reports `Y, X, Z` while the database (and this app) store/display `X, Y, Z`; a labeled row is unambiguous regardless of which order someone expects. The `showSpawnHelp` drawer has a short note spelling this out explicitly for anyone who wants the "why," not just the labels
- **"Modified" doesn't always mean "Sync can fix this," and the UI has to say so.** `SpawnDiffRow.Status` is `"modified"` whenever *either* `FieldsDiffer` or `SpawnEntriesDiffer` is true (see Key Types) — but `Sync`/`SyncSpawnPoints` only ever touches spawn2's own fields, never spawn entries. A row that's modified purely because its spawn entries changed (fields identical) has nothing for Sync to do; letting it render as an ordinary syncable "modified" row would let someone select and sync it, get a silent no-op `UPDATE`, and believe they'd handled a difference that's actually still sitting there. `spawnEntriesOnly(row)` (`Status === 'modified' && !FieldsDiffer`) detects this case; `spawnRowSelectable(row)` excludes it from being checkbox-selectable at all (the same "disable + explain why" pattern used elsewhere for a row that can't be acted on), and the diff row renders it with a muted `bg-amber-950/40` instead of the normal `bg-yellow-950` "this will sync" yellow — three visually distinct states now exist under the old single "modified" bucket: syncable (yellow), entries-only (muted amber, not selectable), and unaffected (transparent/match)
- The Spawn Points diff list has its own `spawnSortBy`/`spawnSortDir` state (Status/Spawngroup/Shared) and a `spawnSearchFilter` text box (matches spawngroup name or any spawn entry's NPC name via `spawnRowMatchesSearch()`), separate from the NPCs tab's `sortBy`/`sortDir` — reusing the NPC tab's state would have carried over a sort key with no equivalent meaning ("Name" sorts NPC name; there's no direct spawn2 analog) whenever a user switched tabs
- The spawngroup's name lives in the **Spawn Entries section's own header** (`Spawn Entries — "name"`), not as a separate row up near `location` — it's a fact about the entries listed below it, and putting it right there reads better than making the reader connect two rows that are visually far apart. An earlier version tried explaining the full spawn2→spawngroup→spawn entries relationship inline as a small bordered diagram at the top of the panel; that was reverted (2026-07-19) as too heavy to show unconditionally for something a user only needs to understand once — see the `showSpawnHelp` drawer below for where that explanation lives now
- **`showSpawnHelp`** is a right-edge slide-over drawer (own backdrop + Escape-to-close, same `ref`+`tabIndex`+`onKeyDown` pattern as the modals, but positioned `fixed right-0` instead of centered) triggered by a small "?" button next to the "Spawn Point Detail" title. It holds the spawn2→spawngroup→spawn entries explanation that used to be inline. Deliberately **not** a modal: every modal in this app currently means "you're about to commit to something" (Connect, Confirm Sync) — reusing that chrome for passive reference content would blur a signal that's otherwise reliable. Deliberately **not** a popover anchored to the button either: this app has no positioning library, and the detail panel is narrow enough (down to 180px) that an anchored popover would have nowhere good to render; a drawer sliding from the window edge (not the narrow detail column) sidesteps that and has room to grow if more reference content gets added later. The "shared ×N" fact for a *specific* row still lives inline (in the Spawn Entries section, since it's about that row, not a general concept) — only the general "how do these three tables relate" explanation moved to the drawer
- `selectAllSharingSpawngroup(row)` adds every *other* selectable location sharing `row`'s spawngroup to `selectedSpawnKeys` — the spawn2-level equivalent of the "shared ×N" badge, turned into an action instead of just a count. Compares `SpawnGroupId` only within the same side (source-to-source or sink-to-sink, picked by whichever side the anchor row actually has) — those IDs are independent auto-increment sequences from two separate databases, so comparing a source ID to a sink ID would be a meaningless coincidence, not a real relationship. Surfaced as a "Select all N →" button next to the existing "Also used at N other locations" line in the Spawn Entries section
- The **"Sync spawngroup from source" button + `showSpawnGroupSyncConfirm` modal** (originally "Sync entries from source"/`showSpawnGroupEntriesConfirm`, renamed 2026-07-19 when the backend action was generalized — see the Spawngroups tab bullet below) is deliberately a *separate* action from the regular spawn2 sync flow, triggered per-row from the Spawn Entries section (only shown when `SpawnEntriesDiffer` is true) rather than folded into "Sync N Spawn Points." This mirrors the backend split (`SyncSpawnGroup` vs `SyncSpawnPoints`) for the same reason: syncing a spawngroup is a fundamentally different risk class than syncing a spawn2 row's own fields, and bundling it into a batch action would make it too easy to sync a spawngroup's fields/entries for a spawngroup the user hasn't actually reviewed. The modal's three states — blocked (`OtherZoneUsage` populated, no confirm button at all), not-found (`NotFound`, sink has no spawn2 here yet), and the normal preview/confirm path — are handled as three distinct render branches rather than one generic "preview" shape, since a blocked or not-found outcome has nothing in common with a confirmable diff. The entry-level "before → after" table reuses `spawnEntryRows()` (already built for the read-only display) rather than a new computation — `sinkChance` is "current," `srcChance` is "what it'll become," which is exactly what that function already returns
- **App.jsx component/lib split, 2026-07-19.** `App.jsx` had grown to 1786 lines / 59 `useState` calls with four modals, a help drawer, and three tab bodies all inlined — no boundaries to navigate by. Split into four ordered passes, each verified by a full build before the next: (1) pure helpers with no closures over component state → `lib/constants.js`, `lib/npcHelpers.js`, `lib/spawnHelpers.js` (`needsSpawnPoint(row, syncSpawns)` took `syncSpawns` as an explicit param instead of closing over it, specifically so it could move); (2) the five overlay components, each now owning its own focus-on-open `ref`/`useEffect` internally rather than App.jsx managing five refs for behavior it doesn't otherwise touch; (3) `Sidebar.jsx`, with `selectZone()` staying in App.jsx as a prop (`onSelectZone`) since resetting NPC+spawn+grid selection state across three tabs and firing three `Compare*` calls is genuine cross-tab business logic, not something a presentational sidebar should own; (4) `NpcsTab`/`SpawnsTab`/`TodoTab`/`GridsTab`/`DetailPanel`. Ended at 558 lines. The **persistent zone header stayed inline** deliberately — it's a coordinator reading state from all tabs (badges, both tab-specific mini-toolbars, the tab switcher itself), which makes it parent-owned logic, not one tab's content; extracting it would only have added prop-forwarding without a real readability win
- **Grids tab, 2026-07-19 (added right after the component split, so it's the first tab built directly as its own component from the start).** Deliberately simpler than SpawnsTab: no `spawnSortBy`/`spawnSearchFilter`-style controls, since grids per zone are typically a handful to a few dozen — nowhere near spawn2's scale — so that extra surface area isn't earning its keep yet (can add later if a zone turns out to need it). `gridRowSelectable(row)` has no `spawnEntriesOnly`-style split either: unlike a spawngroup, a grid isn't shared/risky data, so every "modified" row is fully syncable, fields and waypoints together, with no separate "sync entries" action needed. `GridsTab`'s "Sync N Grids" trigger button in the persistent zone header follows the same `activeView === 'grids' && (...)` pattern as the NPCs/Spawns buttons next to it
- **UI/UX audit pass, 2026-07-19** — a full read-through of every component looking for inconsistencies/QOL gaps, then fixes applied directly (not just findings). Notable ones: `ConnectModal`'s submit button and every modal's `✕` close button had no `className` at all (rendered as unstyled native buttons in an otherwise fully dark-themed app) — fixed across all five modals plus the drawer; two `NpcsTab` tooltips still said "spawn placement isn't implemented," stale copy from before that feature shipped, now pointing at the "Create spawn points" checkbox instead; a spawn2 row can be `Status: "match"` with `SpawnEntriesDiffer: true` (own fields match, only entries differ) — invisible in the `+/~/-` header badges and tab-switcher count, so a `spawnEntriesDifferCount`/`spawnNeedsAttentionCount` pair was added so it can't hide from the summary view; the zone list's "selected" treatment (text-color-only) was brought in line with the diff tables' background-tint-plus-border convention; the entries-only spawn row color moved from `bg-amber-950/40` to `bg-orange-950/60` since amber and yellow read as too similar once both can carry the same amber ⚠ icon; `ConnectModal` gained click-outside-to-close (the Confirm modals deliberately did not, since dismissing shouldn't be reachable by an accidental click there)
- **Sidebar/detail panel space reclaim on the TODO tab, 2026-07-19 (same pass).** The detail panel and its drag handle previously stayed mounted (and sized, up to 600px if resized) even on the TODO tab, which has no matching detail content — now both unmount entirely via `activeView !== 'todo'` in App.jsx, letting the TODO list's `flex-1` center panel reclaim that width automatically instead of it sitting idle. `DetailPanel.jsx`'s now-unreachable `activeView === 'todo'` placeholder branch was removed rather than left as dead code.
- **`sidebarWidth`/`sidebarCollapsed`/`detailWidth` persistence, 2026-07-19 (same pass).** These reset to hardcoded defaults on every restart before this — undermining the point of having made them adjustable in the first place. Now round-trip through `config.json`'s new `UI` field (see `UIPrefs`): loaded in the same `useEffect` that loads Source/Sink, saved via a `persistUIPrefs()` helper called on drag-end (not on every `mousemove`, which would spam `SaveConfig` calls) and on collapse/expand toggle. The drag handlers track the in-progress width in a local `let` rather than reading back from React state at `mouseup` time, since that closure was captured at `mousedown` and would otherwise see the *starting* width, not the final one.
- **Spawngroups tab, 2026-07-19** — a fifth peer tab (NPCs / Spawn Points / Spawngroups / Grids / TODO), backed by `CompareSpawnGroups()`/`SyncSpawnGroup()` (see Key Functions/Types above and Sync Design below). Deliberately has no bulk checkbox selection, sort, or search, and no sync-preview slide-over like the other tabs — a spawngroup's "modified" state links to a single "Sync spawngroup from source" action in the detail panel, the same one-row-at-a-time flow the old entries-only sync always used, not a batch action. `spawnGroupRowSelectable(row)` (`Status === 'modified'` only) reflects that "new" spawngroup rows have no sink spawn2 location to attach to yet — sync a spawn2 location first (Spawn Points tab) to create one — and "ambiguous" rows have no single sink target to sync into by design (see EQEmu Schema Notes). The confirm modal (`ConfirmSpawnGroupSyncModal`, renamed from `ConfirmSpawnGroupEntriesModal`) is shared between this tab and the Spawn Points detail panel's existing per-row action — both now call the same generalized `SyncSpawnGroup`, so `spawnEntryRows()` (in `lib/spawnHelpers.js`) was generalized to take two spawn-entries arrays directly instead of a `SpawnDiffRow`-shaped object, since a `SpawnGroupDiffRow`'s spawn entries live at `SourceSpawnEntries`/`SinkSpawnEntries` directly rather than nested under `Source`/`Sink`.
- **SSH tunnel support, 2026-07-19** — `ConnectModal` gained a "Connect via SSH tunnel" checkbox that reveals a nested settings panel (host/port/username, a Private Key/Password auth-method toggle styled like the tab-switcher buttons elsewhere in the app, and either a native file-browse button for the key + optional passphrase, or a password field) — hidden until enabled, the same progressive-disclosure pattern TablePlus/DBeaver/Navicat use so the common no-tunnel case isn't cluttered. `sourceSsh`/`sinkSsh` each carry one flat object (`defaultSshConfig()`) rather than seven more value+setter prop pairs; `connectionConfigFor()` is the one place that maps that shape onto Go's `ConnectionConfig{UseSSH, SshConfig}`, and `hydrateSshConfig()` is its inverse for loading a saved config back into that shape — both `connect()` and `persistUIPrefs()` route through a shared `currentFullConfig()` built on `connectionConfigFor()` so neither can partially overwrite the other's half of `config.json` with zero values. That consolidation fixed a real, if minor, pre-existing bug found while wiring it up: `connect()`'s own `SaveConfig` call never included the `UI` field at all, so reconnecting to a database was silently resetting the sidebar/detail panel width back to default every time.

## UI Layout

Three columns: a resizable/collapsible **sidebar** (connections + zone list), a **center panel**
(flex-1, holds whichever tab is active — NPCs slides between its own Diff View and Sync Preview;
Spawns/Grids/Spawngroups do the same with their own preview slide-overs; TODO and Loot are single-
view, no slide-over), and a resizable **detail panel** on the right showing whatever's selected in
the active tab.

The persistent zone header sits above the center panel, outside the sliding content, so its width
never depends on which tab is open: zone name/version, that tab's own diff-count badges
(`+new ~modified -removed`, plus an amber `⚠` count where a tab has a "differs but not the usual
way" case — spawn entries only, or ambiguous spawngroup matches), that tab's own sync-trigger
button if it has one, and the tab switcher itself (NPCs / Spawn Points / Spawngroups / Grids /
Loot / TODO), always last so the switcher's position never shifts as other controls come and go.

The detail panel is shared and switches its content on `activeView`: NPCs shows the field-group
sections (Identity/Combat/Resistances/Ability Scores/Behavior/References, the last with clickable
rows that open the faction/spells/merchant reference drawer — see ReferenceDrawer.jsx); Spawns
shows Location/Behavior/Spawn Entries; Grids shows fields + Waypoints; Spawngroups shows
Fields/Spawn Entries. The detail panel and its drag handle are omitted entirely on TODO and Loot —
neither has content of its own (Loot's two-column tree already shows everything inline) — so the
center panel reclaims that width instead of it sitting idle.

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
- **Per-NPC spawn point creation, added 2026-07-18, removed 2026-07-19.** Originally: when `SyncOptions.SyncSpawns` was true (UI: "Create spawn points" checkbox next to "Sync X NPCs"), a "new" NPC needing a spawn point got a fresh single-NPC `spawngroup`/`spawnentry`/`spawn2` chain created for it, in the same transaction as its `npc_types` upsert, and was otherwise unconditionally blocked from syncing at all. User feedback surfaced the real-world failure mode: most spawn points in a live zone share a weighted spawngroup across several NPCs (see the removed "Shared spawn pools are skipped, not cloned" note below), so the vast majority of "new" NPCs hit the shared-pool skip and couldn't sync — "you created safety guards that basically say I have to manually resolve most rows in the database, which defeats the purpose of having this synch tool." The checkbox was also a Principle of Least Surprise violation in its own right: it promised a *working* spawn point, but a verbatim spawn2 copy (the replacement design below) usually can't guarantee that without either cloning shared pools (rejected — see below) or leaving the spawngroupID dangling. Removed entirely rather than patched: `Sync()` now upserts `npc_types` only, unconditionally, regardless of `NPC.HasSpawnPoint` — an NPC's own row is no longer coupled to whether it has a spawn point yet. Spawn2 creation is now exclusively the Spawn Points tab's job (see below).
- **Spawn points sync verbatim, per-NPC creation removed — redesigned 2026-07-19.** `SyncSpawnPoints`'s "new" row path no longer clones a spawngroup at all: it's a plain `insertRow` of the source spawn2 row's own columns, `spawngroupID` included as a **raw, verbatim copy of source's value** — the same "sync the table, full stop" treatment `Sync()` already gives `npc_types`. That raw id has no cross-database meaning (see "Spawn point identity" below) and will almost always be dangling on a fresh sink row; this is intentional, not a bug. The shared-pool skip is gone — every "new" spawn2 row syncs regardless of how many NPCs its spawngroup contains. A dangling `spawngroupID` surfaces as `SpawnPoint.SpawnGroupMissing` (a subtle red row badge in the Spawns tab, and a red banner + "Sync spawngroup from source →" action in the detail panel) rather than blocking anything — consistent with the stated workflow ("if I'm syncing all spawn2's in guk, and then all spawngroups, and all NPCs — that data will get there eventually") and the app's existing "shared data gets flagged, not silently resolved" rule. `SyncSpawnGroup` closes the loop: when it's invoked against a dangling `spawngroupID`, it creates a fresh spawngroup (instead of a no-op `UPDATE` against a row that doesn't exist) and repoints **every** sink spawn2 row in that zone/version still carrying the same dangling id — not just the one location the caller identified — since a shared pool synced across many new locations copies the identical raw source id to all of them; without repointing every sibling, resolving one location's spawngroup would leave the others still dangling.
- **Spawn Points tab, added 2026-07-19** — a third peer tab (NPCs / Spawns / TODO) diffing `spawn2` rows directly instead of only reactively through an NPC sync, answering the stated workflow gap: knowing which `spawngroup`/`spawnentry`/`spawn2` rows belong to the zone being revamped without guessing from IDs. Backed by `CompareSpawns()`/`SyncSpawnPoints()` (see Key Functions above). Two design decisions carry the whole feature:
  - **The row unit is `spawn2`, matched by coordinate — never deduplicated by shared `spawngroup`.** A shared pool used at 45 physical locations shows as 45 rows, each carrying a "shared ×44" badge, because `spawn2`'s own columns (`respawntime`, `variance`, `heading`, `enabled`, ...) are genuinely independent per location even when the pool is shared — collapsing them into one row would hide real per-location drift.
  - **Every row's diff status is really two layers: spawn2 fields (auto-syncable) and pool composition.** "Modified" only ever triggers a plain `UPDATE` of spawn2's own columns via `SyncSpawnPoints` (`updateSpawn2`, `spawngroupID` untouched); "new" is a plain `INSERT` of spawn2's own columns, `spawngroupID` copied verbatim from source (see "Spawn points sync verbatim" above — this replaced the original single-NPC-spawngroup-cloning design). `SpawnEntriesDiffer` (spawngroup/spawnentry composition differs) is computed and surfaced separately — with per-NPC/chance detail and a "needs manual reconciliation" note in both the diff row and the detail panel's Spawn Entries section — and is **never** written by `SyncSpawnPoints` itself, new row or modified row, matching the same "shared data gets flagged, not silently resolved" rule already applied to the TODO queue. It *can* be synced, but only through the separate, explicit `SyncSpawnGroup` action — never bundled into a batch spawn2 sync.
  - A sink spawn entry whose `npcID` doesn't resolve (`Orphaned = true`) falls back to a **source-side lookup** for the name via `resolveOrphanedSpawnEntryNames()` — this is the concrete answer to "what did a corrupted spawnentry used to point to": source is the intact copy, not a guess, whenever exactly one side has the missing NPC.
- **Sync Spawn Group Entries, added 2026-07-19** — closes the gap left by the previous bullet: after syncing a batch of spawn2 locations, their spawngroup(s) and spawnentries were still left exactly as they were on the sink, with no in-app way to bring them in line short of hand-editing via phpMyAdmin/PEQ editor. Backed by `SyncSpawnGroupEntries()` (see Key Functions above), triggered per-row from the detail panel's Spawn Entries section (only shown when `SpawnEntriesDiffer` is true), with its own dry-run preview → confirm modal, entirely separate from the spawn2 batch sync. The core safety question — a spawngroup has no zone column of its own, so what stops this from silently rewriting spawns in a zone nobody reviewed? — is answered by checking, before every write (dry run or real), every distinct `(zone, version)` a spawn2 row references the sink's spawngroupID under. Anything beyond the zone/version being worked on **blocks the sync outright** (`OtherZoneUsage` populated, no confirm button offered) rather than warning-and-allowing — consistent with this app's existing pattern of treating shared-data risk as something to stop on, not just flag. A companion `selectAllSharingSpawngroup()` quick-select ("Select all N locations sharing this spawngroup") makes it easy to gather every spawn2 row a spawngroup touches before reviewing it, but is unrelated to the entries sync itself — it only ever touches spawn2's own fields, same guarantees as selecting those rows by hand.
- **Grids tab, added 2026-07-19** — a fourth peer tab (NPCs / Spawn Points / Grids / TODO) diffing `grid`/`grid_entries` (patrol pathing), backed by `CompareGrids()`/`SyncGrids()`. Genuinely simpler than the Spawn Points tab, for two schema-driven reasons (see EQEmu Schema Notes): `grid` is directly zone-scoped and `grid.id` isn't auto-increment, so it's trusted as identity within a zone the same way `zone.short_name`+`version` already is — no coordinate matching needed; and a grid isn't shared/reused across unrelated things the way a spawngroup is, so there's no `FieldsDiffer`/`EntriesDiffer` split forcing entries into a separate sync action — `SyncGrids` replaces a grid's own fields *and* its full waypoint list together in one call. Building this surfaced a real, already-shipped bug: `updateSpawn2()` was copying `pathgrid` verbatim on every "modified" spawn2 sync (see Important Go Implementation Details), fixed by excluding it from that column set the same way `id`/`spawngroupID` already were.
- **Spawngroups tab, added 2026-07-19** — a fifth peer tab, the roadmap item proposed at the end of the Grids tab work ("view the spawngroup diff side-by-side source and sink, from a zone perspective"). Backed by `CompareSpawnGroups()`/`SyncSpawnGroup()` (see Key Functions/Types above). Two decisions carry the feature, both settled via discussion before writing code:
  - **Ambiguous matches are flagged, never guessed.** A source spawngroup's member spawn2 coordinates might resolve to more than one distinct sink spawngroup if the two databases have genuinely diverged on which pool serves which spot. Rather than picking a majority match, `CompareSpawnGroups` marks the row `"ambiguous"` and lists every candidate sink spawngroupID (`AmbiguousSinkGroupIds`) — same "shared data gets flagged, not silently resolved" rule used everywhere else spawngroup-adjacent.
  - **Syncing a spawngroup was defined to always include its entries — no fields-only or entries-only mode.** The user's own framing: "Syncing a spawngroup *must* include syncing its entries, or else it doesn't really make sense to do so." This is why `SyncSpawnGroupEntries` was generalized into `SyncSpawnGroup` (see Key Functions) rather than adding a second, narrower method next to it — the same guard (`OtherZoneUsage`) and the same confirm modal now serve both the existing Spawn Points detail panel trigger and this tab's own trigger.
  - The tab itself is intentionally the simplest of the five: no bulk selection, sort, search, or sync-preview slide-over — a spawngroup's diff status is reviewed and synced one row at a time from the detail panel, the same interaction shape the entries-only sync always had, just now also covering fields.
- **Shared reference table comparison, phase 1 — complete as of the Loot tab, built incrementally across faction → spells → merchant → loot.** All four are read-only source-vs-sink views, anchored via the NPC that led there rather than any cross-database ID matching: `npc_types.id` is portable, so each side's own raw FK value (`npc_faction_id`/`npc_spells_id`/`merchant_id`/`loottable_id`) is read independently and used to fetch that side's own data — no attempt to match `npc_faction.id`/`npc_spells.id`/`loottable.id` values against each other, since all three are local surrogates (see EQEmu Schema Notes). Faction/spells/merchant share one mechanism: clicking a clickable References-section row (`referenceComparisonTypes` in `lib/npcHelpers.js` decides which fields qualify) opens `ReferenceDrawer.jsx`, a right-edge slide-over whose content switches between `FactionComparison`/`SpellsComparison`/`MerchantComparison.jsx` on `referenceDrawerType`. **Loot deliberately does not use this drawer** — it's one level deeper (`loottable → loottable_entries → lootdrop → lootdrop_entries`, `lootdrop` itself a shared, reusable middle layer with no anchor of its own), and the intended workflow ("do comparable NPCs drop the same loot") needs picking an NPC you *don't* already have open, not just reacting to one you do — so it got its own tab (`LootTab.jsx`) with an NPC search plus a one-sided raw-`loottable_id` lookup fallback (necessarily one-sided, same reasoning as the ID itself not being portable). `NPCLootComparison` renders `SourceTable`/`SinkTable` as two independent trees rather than pairing individual lootdrops across databases — there's no anchor to pair them on (unlike spawngroup, which at least has spawn2 coordinates), so claiming a correspondence would mean guessing, not comparing. `LootDrop.SharedCount` (a lootdrop referenced by other loottables in the same database) mirrors `SpawnPoint.LocationSharedCount`'s "shared ×N" signal, added after checking the official PEQ editor's per-object lootdrop navigation for ideas — the object-oriented drill-down suits *content authoring* (managing a reusable lootdrop as its own asset) better than this tool's *diagnostic comparison* task, but the reuse-visibility it provides was worth keeping. A UI/UX pass after the disclosure triangles turned out too subtle to notice moved every expand/collapse control to the left of its row (reading-order convention — Finder, VS Code's file tree — instead of trailing after other text on the right) and added an Expand All/Collapse All toggle per column, which also makes the row-level affordance obvious by association. `alt_currency` stayed out of scope entirely (confirmed unused, 0 rows on both databases checked).
- **Per-item deselection within the sync preview — decided against, 2026-07-21.** Considered (the preview reflects exactly what was checked in the diff view; there's no way to uncheck one NPC from the preview panel itself) and rejected: the existing "← Back to Diff" round-trip is deliberate friction, not a missing shortcut — same category as the app's other "make risky things a little harder to do by accident" choices (e.g. the zone list locking during a preview). Making it trivially easy to fine-tune a selection from inside the preview screen undermines the point of the preview being a stable, reviewed snapshot of what you're about to commit.
- **Shared reference table sync, phase 2 — safely writing** `loottable`, `npc_faction`, `npc_spells`, `merchantlist` (and skipping `alt_currency`, unused) instead of only comparing them and flagging via the TODO queue. Not started. Deferred because these tables are *shared across many NPCs* — blindly overwriting one on sync risks corrupting loot/faction/spells for every other NPC that also references the same row. Needs a design for detecting "is this shared row actually different, and is it safe to touch" before it can replace the TODO-queue approach — phase 1 (comparison) exists now specifically to make that judgment call visible to a human first, the same "see it before you can touch it" step every sync-capable tab in this app went through before gaining a sync action.
- **ID alignment, added 2026-07-23 — a third category, distinct from both phases above, though it touches the same tables.** Direct response to the user's actual manual workflow: comparing loot tables almost always shows the same real content living under different `lootdrop.id`/`loottable.id` numbers (local surrogates, no cross-database meaning — same trust category as `spawngroup.id`), fixed by hand with `UPDATE lootdrop SET id = X WHERE id = y` and matching updates to every table referencing it. The one danger named: if `X` is already occupied by unrelated sink content, the rename collides — exactly the `SpawnGroupCollisionRisk`/`RelocateSpawnGroup` problem, generalized. **This is a rename, not a content overwrite** — the key distinction from both phase 1 (never writes) and phase 2 (would overwrite a shared row's *content* with source's). `AlignId` (`idalign.go`) renumbers the sink's *existing* row to source's id, preserving that row's own current field content untouched; only a pre-existing squatter at the target id gets its content relocated. Covers `lootdrop`/`loottable`/`npc_faction`/`npc_spells` (confirmed with the user: "I'm doing this across all tables... build the general primitive covering all four") — deliberately NOT `spawngroup`, which keeps its own `RelocateSpawnGroup` with its zone-scoped carve-out (see `idAlignmentTarget`'s own comment in Key Types for why the four new targets get unconditional repoint instead: none of them have spawn2/spawngroup's zone-scoped "same recent sync batch" signal, and by construction any existing reference to a colliding id is already showing the squatter's real content — repointing it to follow the squatter preserves exactly what it shows today, so there's no case where leaving it un-repointed is safer). Frontend wiring: `LootTab.jsx`'s loottable-level button (ids already known via the NPC anchor, no pairing needed) and lootdrop-level two-step cross-column click (since `lootdrop.id` has no cross-database anchor the way spawngroup has spawn2 coordinates) shipped first; `npc_faction`/`npc_spells` triggers in `FactionComparison.jsx`/`SpellsComparison.jsx` followed shortly after (2026-07-24), reusing the same `useAlignId.js`/`ConfirmAlignIdModal.jsx` — a single button next to the header's own id row in each, same shape as the loottable-level trigger, since neither has an equivalent "which entry pairs with which" ambiguity: their `Entries` are keyed by the *portable* `faction_id`/`spellid`, not a local surrogate, so only the header's own `npc_faction_id`/`npc_spells_id` ever needs realigning. `useLoot.js`'s `refreshWithIds` (and the reference drawer's equivalent, `App.jsx`'s `refreshReferenceAfterAlign`) exist specifically because a header-level align changes `npc_types.loottable_id`/`npc_faction_id`/`npc_spells_id` in the database in a way the NPCs tab's cached `diffRows` won't reflect — replaying the stale NPC row after align would look up an id that no longer exists, so the refresh uses the known-correct post-align ids directly instead. The reference-drawer case is simpler than loot's: `openReferenceComparison` already takes raw ids directly (no NPC-row indirection to route around), so refreshing is just calling it again with `SourceId` on both sides, no new hook function needed. `App.jsx`'s `refreshAfterAlign` is the single dispatch point `ConfirmAlignIdModal`'s `executeAlign` calls into, picking `refreshLootAfterAlign` vs `refreshReferenceAfterAlign` by `alignId.alignTarget.target`.

### What gets queued as TODO (not synced):
- `loottable` / `loottable_entries` / `lootdrop` / `lootdrop_entries` (via `loottable_id`)
- `npc_faction` / `npc_faction_entries` (via `npc_faction_id`)
- `npc_spells` / `npc_spells_entries` (via `npc_spells_id`)
- `merchantlist` (merchant inventory, via `npc_types.merchant_id` → `merchantlist.merchantid` — the two tables spell the column differently, see EQEmu Schema Notes)
- alternate currency definition (via `alt_currency_id`)
- `npc_emotes` (not yet detected — no FK column for this on `npc_types` in the current schema)
- `buildTODOItems()`'s `fkFields` list is the authoritative source of which columns are checked — it should stay in sync with `App.jsx`'s `fieldGroups.references`, since that's where these five were originally identified. If a future EQEmu schema variant adds another NPC-referencing shared table, both places need updating.

## EQEmu Schema Notes
- **`npc_types.merchant_id` and `merchantlist.merchantid` spell the same conceptual column differently — confirmed via `SHOW COLUMNS FROM npc_types LIKE '%merchant%'` (2026-07-20, real, shipped bug).** Every other reference FK on `npc_types` uses the FK-with-underscore convention (`loottable_id`, `npc_spells_id`, `npc_faction_id`), so the merchant one was assumed to follow the same pattern and written as `"merchantid"` throughout — `fieldGroups.references`/`referenceComparisonTypes` (frontend), `referenceFKColumns`/`buildTODOItems.fkFields` (Go). Since Go maps read by exact key, `npc.Fields["merchantid"]` silently returned nothing for every NPC — the merchant reference row never showed a value, was never clickable, and never got queued as a TODO item, without erroring. `merchantlist`'s own column (`merchantid`, no underscore) was never wrong and didn't change — only the `npc_types`-side key did. See Repo Meta for the full fix list.
- **Spawn point identity is coordinates, not IDs.** `npc_types.id` is trustworthy as a stable cross-database identifier because it comes from shared content lineage — that's the whole app's foundational assumption. A *newly-added* `spawn2`/`spawngroup` row has no such guarantee: its ID is just whatever source's own auto-increment counter assigned, with no meaning in the sink. `SyncSpawnPoints`'s "new" row path exploits this rather than working around it: `spawngroupID` is copied verbatim as a plain value (see "Spawn points sync verbatim" under Sync Design), not translated or reassigned — a dangling reference is expected, flagged (`SpawnPoint.SpawnGroupMissing`), and resolved separately by `SyncSpawnGroup`. The thing that *is* stable across two diverged databases is physical location: an exact `(x, y, z)` match against an existing sink `spawn2` row in the same zone/version is treated as "this spawn point already exists, possibly serving a different NPC now" — and when that happens, the "new" row is skipped and flagged, never auto-merged/guessed. Same "shared data gets flagged, not silently resolved" philosophy as loot/faction/spells.
- **Shared spawn pools are synced, not skipped — reversed 2026-07-19.** A `spawngroup` in EQEmu is often a weighted pool of *several* NPCs — "spawn the apprentice, initiate, or neophyte here, by chance" — reused across many physical `spawn2` locations (dungeon-style zones like Befallen can have dozens). The original per-NPC spawn creation design refused to touch these (`SharedPool` skip, see Sync Design's "Per-NPC spawn point creation" bullet) specifically to avoid the alternative — cloning a fresh, disconnected copy of a shared pool per NPC synced, which nearly created 137 duplicate spawn2 rows in Befallen (~45 real physical locations × 3 NPCs, each independently cloning the same shared spots) before that check existed. But in practice, shared pools are the *norm*, not the exception — the skip meant most rows in a real zone couldn't sync at all. The replacement design keeps the "don't clone" lesson (still true — `SyncSpawnPoints` never creates a spawngroup, only `SyncSpawnGroup` does, and only one at a time, explicitly) but drops the "skip" half: spawn2 rows sync verbatim regardless of pool size, and a dangling `spawngroupID` is a flag for `SyncSpawnGroup` to resolve, not a reason to block the spawn2 row itself.
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
- Spawn Points tab, 2026-07-19: `CompareSpawns`/`SyncSpawnPoints` + the new `SpawnEntry`/`SpawnPoint`/`SpawnDiffRow`/`SpawnSyncOptions`/`SkippedSpawn`/`SpawnSyncResult` types on the Go side; a third "Spawns" tab (diff table, detail panel with Location/Behavior/Spawn Entries sections, own sync preview + confirm modal) on the frontend. See Key Types, Key Functions, and Sync Design above.
- Spawn Points tab terminology + UX pass, 2026-07-19: renamed "Pool" to "spawngroup"/"spawn entries" throughout (row summaries, skip reasons, confirm modal, detail panel) to match EQEmu's own vocabulary. Tab renamed "Spawns" → "Spawn Points" for consistency with the detail panel's title and the sync button text.
- Spawn Points tab design-review pass, 2026-07-19: added `SpawnDiffRow.FieldsDiffer` (Go) so "modified" rows that are only different in their spawn entries — which Sync never touches — render and select differently from rows Sync can actually fix (see the "Modified doesn't always mean syncable" note above). Added spawn-specific sort (Status/Spawngroup/Shared) and a spawngroup/NPC-name search filter to the diff list, a selection-count denominator ("N of M"), consistent `spawnRowLabel()` context on skipped preview items, aligned "shared ×N" wording between the row badge and detail panel, and a soft field-priority ordering in the Behavior section.
- Spawn Points detail panel iteration, 2026-07-19 (same day, follow-up): the inline relationship diagram from the pass above was reverted in favor of moving the spawngroup name into the Spawn Entries section header (proximity to what it describes) plus a `showSpawnHelp` right-edge drawer for the general spawn2/spawngroup/spawn-entry explanation, triggered by a "?" button — see the two bullets above this in Important Frontend Implementation Details for the reasoning. Location fields also became three axis-labeled rows (`x`/`y`/`z`) instead of a bare `(x, y, z)` tuple, since EQ's in-game `/loc` reports `Y, X, Z` while the database stores `X, Y, Z` — labeling removes the ambiguity regardless of which order someone expects.
- **`toFloat64()` float32 bug fix, 2026-07-19 (same day, found via user report):** every row in the Spawn Points tab was showing the same sink coordinates and spawngroup for every source row — caught because a matched row is supposed to be *structurally guaranteed* to show identical source/sink coordinates (that's the whole premise of coordinate-based matching), so seeing them differ was the tell that mismatched rows were being paired together at all. Root cause: `toFloat64()` (see Important Go Implementation Details) had no `float32` case, silently zeroing every spawn2 x/y/z on both databases, which collapsed `CompareSpawns`'s coordinate matching onto a single `(0,0,0)` key for the whole zone. Same missing case also affected `spawnCandidatesForNPC`'s conflict-check coordinates (false negatives against real sink conflicts) and `claimedThisSync`'s in-batch duplicate guard (false positives — every candidate after the first in one `Sync()` call looked like it collided with the first, since all their keys were also `(0,0,0)`, so only the first NPC in a multi-NPC batch needing a new spawn point would actually get one). Spawn2 rows that *were* created were still written with correct real coordinates (`createSpawnPoint` builds the INSERT from the untouched `Spawn2Fields` map, not from the zeroed derived value) — the bug corrupted matching/conflict-detection logic, not data already written to either database. First test file added to the project (`app_test.go`, `TestToFloat64`) specifically to pin this down as a regression.
- **Sync Spawn Group Entries, 2026-07-19 (same day, follow-up):** direct response to a stated workflow gap — syncing a batch of spawn2 locations left their spawngroup/spawnentries exactly as they were on the sink, with no way to bring them in line except hand-editing outside the app. Added `SyncSpawnGroupEntries()` (Go), a per-row "Sync entries from source" action with its own dry-run/confirm modal, and a `selectAllSharingSpawngroup()` quick-select. The three local `coordKey` closures in `CompareSpawns`/`SyncSpawnPoints` (and the new method) were consolidated into one shared `spawnCoordKey()` function while this was being built. See Sync Design and the two Important Go/Frontend Implementation Details bullets above for the cross-zone safety check design and why this is a separate action rather than folded into the batch spawn2 sync.
- **`scanDynamicRows()` float32→float64 normalization fix, 2026-07-19 (same day, found via user report):** selecting any "new" spawn point row and previewing a sync failed every single row with "not found in source zone data." Root cause was a second-order effect of the earlier `toFloat64()` float32 fix (see Important Go Implementation Details) — that fix corrected the *matching key* computation, but `Fields["x"]` itself still held the raw, un-widened `float32`, so the coordinate value round-tripped to the frontend and back through JSON with a different `float64` bit pattern than the one `spawnCoordKey()` computed internally moments later, failing exact-equality matching for every selected coordinate. Fixed by widening `float32` → `float64` once, at scan time, in `scanDynamicRows()` — the one shared function every dynamic row (spawn2, spawngroup, npc_types) scans through — rather than an epsilon-tolerant comparison, which would have papered over the mismatch instead of removing its source.
- **App.jsx component/lib split, 2026-07-19:** `App.jsx` (1786 lines, 59 `useState` calls, no sub-components) split into `lib/` (pure helpers) and `components/` (one file per modal/drawer/tab/panel) across four separately-verified passes. Ended at 558 lines. See Important Frontend Implementation Details above for the pass-by-pass breakdown and what deliberately stayed inline (the persistent zone header).
- **Grids tab + `updateSpawn2` pathgrid fix, 2026-07-19:** built directly after the component split, so `GridsTab`/`ConfirmGridSyncModal`/`lib/gridHelpers.js` are the first tab added as components from the start rather than extracted after the fact. Confirmed `grid`/`grid_entries` schema via fresh `SHOW CREATE TABLE` output on both databases before designing the matching strategy (see EQEmu Schema Notes) — found that `grid.id` is zone-scoped and not auto-increment, making it trustworthy identity, unlike `spawngroup.id`. That same schema check surfaced a real, already-shipped bug: `updateSpawn2()` had no exclusion for `pathgrid`, so it was silently copying source's raw value into the sink on every "modified" spawn2 sync — fixed as its own step before starting the Grids tab itself, not bundled into it. See Sync Design and Key Functions above for both.
- **Sidebar resize/collapse, NPC search filter, and a full UI/UX audit pass, 2026-07-19 (same day, later session):** the sidebar gained a drag handle (mirroring the detail panel's) and a collapse-to-rail toggle, iterated through three rounds of visual fixes purely from user-provided screenshots (sizing, clipping, contrast — no live browser access this session); `NpcsTab` gained the name filter `SpawnsTab` already had. Followed by a full read-through of every frontend component for inconsistencies/QOL gaps, with fixes applied directly rather than just reported — see the "UI/UX audit pass" and "space reclaim on the TODO tab" and "persistence" bullets under Important Frontend Implementation Details above for the specifics (unstyled modal buttons, stale tooltips, `SpawnEntriesDiffer`-on-`match` badge visibility, zone list selection styling, TODO tab detail-panel reclaim, `UIPrefs` persistence, amber/orange row contrast, `ConnectModal` click-outside-to-close).
- **Spawngroups tab, 2026-07-19 (same day, follow-up):** built the roadmap item proposed during the Grids tab work. `SyncSpawnGroupEntries` was generalized into `SyncSpawnGroup` (fields + entries together, one action) after confirming with the user that syncing a spawngroup without its entries "doesn't really make sense" — the safer design also avoided a second near-duplicate write path carrying the same `OtherZoneUsage` guard. Real `spawngroup` schema pulled via `SHOW CREATE TABLE` on both databases first (found 4 source-only columns — `rand_spawns`/`rand_respawntime`/`rand_variance`/`rand_condition_` — same drift-handling as everywhere else). See Sync Design, Key Types/Functions, and EQEmu Schema Notes above for the full design (matching strategy, ambiguous-match handling, shared confirm modal).
- **`claude.md`/`CLAUDE.md` case-collision incident, 2026-07-19:** an untracked `claude.md` (lowercase) turned out to be the *same on-disk file* as the tracked `CLAUDE.md` on this case-insensitive filesystem — git's index was just confused into showing two paths for one file. Deleting the untracked "duplicate" briefly deleted the real (never-committed) file; restored from conversation context since the content was fully known, no actual data lost. If this file is still uncommitted, committing it is the real fix — git tracking it properly is what would have caught this before it became a problem.
- **SSH tunnel support, 2026-07-19 (same day, next feature):** the last "In progress" item, `ConnectionConfig.UseSSH`/`SshConfig` had existed as unused fields since early in the project. `SshConfig` gained real auth fields (`AuthMethod`/`Password`/`PrivateKeyPath`/`Passphrase`, replacing a single unused `PrivateKey` string) and `Connect()` now actually opens a tunnel (`openSSHTunnel`, `golang.org/x/crypto/ssh` + `ssh/knownhosts`) when `UseSSH` is set, verifying the SSH host's key against the user's own `~/.ssh/known_hosts` rather than skipping verification — a deliberate choice given the user's stated goal of this being a tool other operators trust, not just a personal script. `ConnectModal` gained a progressive-disclosure SSH settings panel (checkbox reveals host/port/username/auth-method/key-or-password fields, plus a native file-browse button for the private key) mirroring how TablePlus/DBeaver/Navicat handle the same feature. See Key Types/Functions and Important Go/Frontend Implementation Details above for the tunnel lifecycle, host-key verification rationale, and the `connectionConfigFor()`/`hydrateSshConfig()`/`currentFullConfig()` frontend plumbing (which also fixed a small pre-existing bug: `connect()`'s save call used to omit the `UI` prefs field entirely, silently resetting sidebar/detail width on every reconnect).
- **Spawn point sync redesign — per-NPC creation removed, spawn2 syncs verbatim, 2026-07-19 (same day, following the Spawngroups tab):** direct response to a real usability report — "This is not functional" — against the original per-NPC/shared-pool-skip design (see the "Per-NPC spawn point creation" and "Shared spawn pools" bullets above for the full before/after). Summary of what changed: `SyncOptions.SyncSpawns` and the "Create spawn points" checkbox are gone; `Sync()` upserts `npc_types` only, unconditionally; `spawnCandidate`/`spawnCandidatesForNPC`/`createSpawnPoint` are deleted (no longer used anywhere); `SyncSpawnPoints`'s "new" path is a plain verbatim `INSERT` of spawn2's own columns including a raw-copied `spawngroupID`; `SpawnPoint` gained `SpawnGroupMissing` (row badge + detail-panel banner, not a block); `SyncSpawnGroup` gained a create-path for when the target `spawngroupID` is dangling, repointing every sink spawn2 row sharing that same dangling id, not just the one the caller identified. Confirmed via multiple rounds of user correction that the intended trust model is "sync everything, flag what's incomplete, resolve it with a follow-up action" — the same rule the TODO queue and shared-reference-table drawers already embody — rather than "block anything Sync can't fully guarantee working end-to-end." The Principle of Least Surprise came up explicitly as the reason per-NPC creation specifically had to go (not just be loosened): a checkbox promising a *working* spawn point that, under the new model, would often create a dangling one is worse than no checkbox at all.
- **"Missing reference" flags extended to NPC FK columns and pathgrid, 2026-07-20:** direct follow-up after auditing where else the "verbatim-copied local ID, likely dangling" situation applies — asked "do missing references to ids now show up in all my detail views where applicable," the honest answer was no, only `spawngroupID` had it. Extended the same pattern: `NPC.MissingReferences` (new, populated by `annotateMissingReferences`/`existingIds` in `CompareZones`) flags `npc_faction_id`/`npc_spells_id`/`merchant_id` values that don't resolve in that NPC's own database — surfaced as a red ⚠ row badge in the NPCs tab diff list, per-field red coloring in the Detail panel's References section, and explicit "doesn't exist in source/sink's table" messaging in the three comparison drawers (previously they only handled the `id == 0` "no link at all" case, silently rendering dashes for a nonzero-but-dangling id). (`loottable_id` was added to the same check once the Loot tab landed — see below — `alt_currency_id` stays excluded, unused). Separately, `SpawnPoint.PathgridMissing` (new, computed by `annotatePathgridMissing` in `CompareSpawns`, which gained a `zoneIdNumber` param for this) flags a spawn2's `pathgrid` when it doesn't resolve to a real `grid` row for that zone in that same database — a **read-only diagnostic only**, deliberately not paired with a write-behavior change: unlike `spawngroupID`, `pathgrid` was never changed to copy verbatim (`updateSpawn2`/`SyncSpawnPoints` still only copy it when the target grid already exists on the sink, per the earlier documented bug fix), so this just reports on whatever value is already sitting on the row. `fetchSinkGridIds` was renamed `fetchZoneGridIds` since it's now called against both databases, not just the sink at sync time.
- **`null` diff-array crash fix, 2026-07-20 (same day, found via user-reported console errors):** `App.jsx` crashed on any zone where a `Compare*` call had nothing to return (e.g. a zone with no patrol grids at all, the common case) — `TypeError: can't access property "filter", gridDiffRows is null`. Root cause: a Go `nil` slice (e.g. `CompareGrids`'s `var diff []GridDiffRow`, never appended to) serializes to JSON `null`, not `[]`, and every `.then(setXRows)` call site in `App.jsx` wired that straight into state with no normalization — unlike `LoadTODOItems`'s existing `.then(items => setTodoItems(items ?? []))`, which is why TODO items never hit this. Fixed by changing all 8 call sites (`setDiffRows`/`setSpawnDiffRows`/`setGridDiffRows`/`setSpawnGroupDiffRows`, each with an initial-load and a post-sync-refresh site) to `.then(rows => setXRows(rows ?? []))`, matching the pattern that already worked for TODOs, rather than changing the Go side to always return non-nil (JSON `null` is the correct wire representation for "Go returned nil"; normalizing at the one place it becomes React state is the narrower fix).
- **`npc_types.merchant_id` vs `merchantlist.merchantid` column-name mismatch, 2026-07-20 (same day, found via user report):** user suspected the merchant reference "never showed up" because of a schema naming issue — confirmed via `SHOW COLUMNS FROM npc_types LIKE '%merchant%'`. Every reference FK on `npc_types` other than this one follows the `_id` suffix convention (`loottable_id`, `npc_spells_id`, `npc_faction_id`), so `merchantid` (no underscore) was assumed rather than verified when the merchant comparison drawer was built. Fixed everywhere the `npc_types`-side key was used: `fieldGroups.references`/`referenceComparisonTypes` (frontend), `referenceFKColumns`/`buildTODOItems.fkFields` (Go) — `merchantlist`'s own `merchantid` column (no underscore) was correct all along and untouched. See EQEmu Schema Notes for the full explanation. A silent, no-error map-key miss like this — not a crash, not a wrong value, just permanently empty — is exactly the kind of bug that doesn't surface itself; it took a user noticing a feature "never worked" to catch it.
- **Login/connect logic audit, 2026-07-20 (same day, requested review, not a user-reported symptom):** asked to check `Connect()` for bugs, found two real ones and fixed both — see the `Connect()` bullet under Key Functions for specifics. (1) The MySQL DSN was built via raw string concatenation (`user+":"+pass+"@tcp("+host...`) instead of `mysql.Config`/`FormatDSN()` — a password containing `@`/`:`/`/`/`?` would silently misparse into the wrong host/db rather than fail loudly; nobody had hit it yet only because no one had tested a password with those characters. (2) Reconnecting to the same side (edit settings, click Connect again) leaked the previous `sql.DB` pool's connections forever — the existing tunnel-cleanup comment claimed `sourceDB`/`sinkDB` were "pooled and eventually GC'd" as the reason they didn't need the same explicit `Close()` the tunnel got, which is wrong: `sql.DB` has no finalizer, so dropping the reference does nothing to its live MySQL connections. `shutdown()` closing them only ever covered whichever pool was current at final app exit, not any pool replaced along the way. Both fixed the same way the tunnel cleanup already worked: close the old one before assigning the new one. Not fixed: no mutex guards `sourceDB`/`sourceTunnel`/`sinkDB`/`sinkTunnel`, so two `Connect()` calls racing on the *same* side could still leak — flagged as a known gap rather than fixed, since real protection would mean auditing every read site across the file, a much bigger change than the login path itself.
- **Loot tab, 2026-07-21 — Phase 1 (shared reference table comparison) complete.** The last unbuilt reference type, deliberately saved for last since it needed its own design pass: real schema pulled for `loottable`/`loottable_entries`/`lootdrop`/`lootdrop_entries` on both databases first, confirming both `loottable.id` and `lootdrop.id` are local surrogates (`AUTO_INCREMENT` on both) before deciding anything. See the "Shared reference table comparison, phase 1" bullet under Sync Design for the full design (why Loot got its own tab instead of reusing `ReferenceDrawer`, why source/sink render as two independent trees rather than paired lootdrops, the `SharedCount`/"shared ×N" addition, and the disclosure-triangle/Expand-All UI pass). `resolveItemNames` was generalized to take the id-column name as a parameter (`"item"` for merchantlist, `"item_id"` for lootdrop_entries) rather than staying merchant-specific once loot needed the same lookup. `loottable_id` was also added to `referenceFKColumns`, so a dangling `loottable_id` now gets the same missing-reference flag the other three FK types already had.
- **Zone-switch crash audit, 2026-07-21 (same day, requested review, not resolved):** asked to audit for crashes when clicking through zones with sparse data, hypothesis being some zones are missing rows in some tables. Systematically checked and confirmed safe: every `IN (...)` SQL clause (8 call sites) is guarded against an empty id list; every Go slice that can come back `nil` for sparse data (`SpawnEntries`, `Entries`, `MissingReferences`) has a frontend `?.`/`??` guard; `toInt64`/`toFloat64`/`scanDynamicRows` all handle SQL `NULL` (Go `nil`) without panicking; every `result[0]`-style access is preceded by a length check. No new bug found through static reading alone — logged here so the next session doesn't redo the same sweep from scratch. **Parked, not being actively pursued** — needs an actual repro (console output, or which zone) to make further progress; static auditing without a concrete symptom had hit diminishing returns, and the user asked to drop it from active tracking until it resurfaces.
- **Spawngroup ID-collision detection, 2026-07-21 (same day, direct follow-up to the Befallen/Diaku collision found during manual sync verification):** that incident revealed a real gap — `SpawnPoint.SpawnGroupMissing` only ever answers "does this id exist in this side's own database," so once *some* sink spawngroup row exists at a given id (whether legitimately or coincidentally), the app had no way to distinguish "the right one" from "someone else's, sharing a number by coincidence." Added `SpawnDiffRow.SpawnGroupCollisionRisk` (`annotateSpawnGroupCollisionRisk`, called from `CompareSpawns`): for every `"new"` row, checks whether Source's raw `spawngroupID` already exists as a real `spawngroup` row on the sink, *before* that location has ever referenced it there — since sink had no spawn2 row at that coordinate before, a pre-existing group at that exact auto-increment number is essentially never a legitimate coincidence between two independently-run databases. Surfaced as a red row badge (Spawns tab) and a detail-panel banner, computed proactively during the diff/preview step rather than discovered only when a later action fails. **Deliberately warning-only, not blocking** — the spawn2 row's own fields are still real content regardless of the collision, and the app's established pattern is "flag shared/risky data, don't block on it" (same as `SpawnEntriesDiffer`, `OtherZoneUsage`, ambiguous spawngroup matches). No in-app resolution yet; see the "relocate a colliding spawngroup" discussion started the same day (not yet designed/built) for where this is headed.
- **Relocate & reclaim a colliding spawngroup, 2026-07-21 (same day, direct follow-up):** closes the loop left by the collision-detection bullet above — `RelocateSpawnGroup` (see Key Functions), triggered from the same collision-risk banner. Structurally the same mechanism `SyncSpawnGroup`'s dangling-id create-path already uses (create real, repoint every sink spawn2 row sharing a stale reference) just run in the opposite direction: move whatever's *currently* occupying the colliding id out of the way instead of creating something new at a missing one. The one design question that mattered — do spawn2 rows in the caller's own zone that already share the colliding id get repointed too? — the answer is no, deliberately: they're already pointed at the id, and once the id gets repopulated with correct content, they resolve correctly with no further action; repointing them anywhere would be wrong, since the id itself is what's being fixed, not the rows pointing at it. Only spawn2 rows *outside* the caller's zone/version (the id's actual legitimate users, e.g. Diaku's) get moved to the squatter's new home. Confirmed via user framing: "relocate-and-reclaim, with the confirmation step" — the confirm modal always shows every other zone/version the colliding id is currently used by (mirroring `SyncSpawnGroup`'s `OtherZoneUsage` list) before acting, but unlike that check, it never blocks — the whole point of this action is to safely touch that usage, not avoid it. Reclaiming the freed id uses `insertRow`'s existing `overrides` param to force an explicit `id` value — MySQL accepts this on an `AUTO_INCREMENT` column as long as it's free, no schema change or new primitive needed. **Follow-up same day:** the in-zone exclusion is a real, if narrow, honesty gap — the app assumes every in-zone spawn2 row currently referencing the colliding id is genuinely waiting on the reclaim, with no way to verify that's true rather than a coincidental unrelated match. Rather than building the more precise per-row provenance check (cross-referencing each in-zone row against source by coordinate) right away, added `RelocateSpawnGroupResult.ThisZoneCount` — the in-zone count, never touched, shown in the confirm modal specifically so it can be eyeballed against what the user actually expects to see there ("3 locations, that's right") before confirming. Cheap transparency now; the precise check stays a documented possible follow-up if the narrower assumption ever turns out to be wrong in practice.
- **"Pool" → domain-vocabulary rename, 2026-07-21 (same day, direct follow-up):** direct response to user pushback on imprecise terminology — "Pool doesn't have precise meaning for me. You mean spawngroup? Be precise," followed by "The source code needs to match the domain-specific terms (spawngroup) because otherwise, people reading the code won't know for sure what the hell that field is referencing." The 2026-07-19 terminology pass (see the "Spawn Points tab terminology + UX pass" bullet above) only ever touched UI-facing strings; this pass renamed the actual identifiers, Go and JS both, so the source itself reads in EQEmu's own vocabulary rather than a generic internal name: `PoolEntry`→`SpawnEntry`, `SpawnPoint.Pool`→`SpawnEntries`, `SpawnDiffRow.PoolDiffers`→`SpawnEntriesDiffer`, `SpawnGroupDiffRow.SourcePool`/`SinkPool`/`PoolDiffers`→`SourceSpawnEntries`/`SinkSpawnEntries`/`SpawnEntriesDiffer`, `RelocateSpawnGroupOptions.SourcePool`→`SourceSpawnEntries`, `poolsEqual`→`spawnEntriesEqual`, `resolveOrphanedPoolNames`→`resolveOrphanedSpawnEntryNames`, plus every frontend consumer (`App.jsx`'s `spawnGroupSyncPools` state and `openSyncSpawnGroupPreview`'s `pools` param, `spawnGroupHelpers.js`'s `spawnGroupPoolSummary`→`spawnGroupEntriesSummary` and its `pool` parameters, `DetailPanel.jsx`'s `expandedSections.spawn_pool` key→`spawn_entries` to match the Spawngroups tab's existing `spawngroup_entries` convention, and the confirm modal's `sourcePool`/`sinkPool` props→`sourceEntries`/`sinkEntries`). Verified via `go build`/`go vet`/`go test` and `vite build`, both clean, after every occurrence was accounted for — the only "Pool" text left anywhere in the codebase is the legitimate `sql.DB` connection-pool comments in `Connect()`'s tunnel-cleanup code and one deliberately-preserved historical comment in `spawnHelpers.js` explaining the old field name for context. This is a durable rule for the rest of the project, not a one-time cleanup: internal identifiers must use EQEmu's own domain vocabulary, not generic names, even when nobody user-facing will ever see them.
- **Tech-debt cleanup: file organization, 2026-07-23.** Direct response to "clean up tech debt... optimize the code for readability and maintainability so that we can reduce the time needed to onboard a new human developer team member." A pure reorganization pass — no logic, safety behavior, or UI copy changed anywhere; only *where code lives* changed. Four phases, each verified by a full build before the next (same discipline as the 2026-07-19 component/lib split):
  1. **`app.go` (3544 lines, 74 funcs, 42 types, all one file) split into 9 domain files** — `ssh.go`/`dbutil.go`/`npc.go`/`todo.go`/`reference.go`/`loot.go`/`spawn.go`/`spawngroup.go`/`grid.go`, `app.go` trimmed to the App struct/lifecycle/config persistence — see Project Structure for the full breakdown. Done via a small Python script that partitioned the file into (leading-comment + declaration) blocks by original line position, then regrouped those blocks by target file, preserving every byte of actual code — verified by diffing the reconstructed declaration-name list against the original (all 74 funcs + 42 types accounted for) and by `go build`/`vet`/`test` staying clean throughout. Caught two real bugs in the process, both from the same root cause (the partitioning script only tracked `type`/`func` declarations, so package-level `const`/`var` lines between two declarations got silently swept into whichever declaration preceded them): `const mysqlErrDupEntry` landed in `spawn.go` (attached to `sinkSpawnPointExists`) while its only user, `isDuplicateEntryError`, moved to `dbutil.go` — fixed by moving the const to sit with its user. `var referenceFKColumns` had the same risk but happened to land correctly (both it and its only user, `annotateMissingReferences`, went to `npc.go`). Also caught a genuine bug in the *splitting script itself* mid-pass: the first version's comment-attribution heuristic walked backward from a declaration through any non-blank line, not just `//` comment lines — for any two declarations with zero blank lines between them (there were a few), it silently swallowed the *entire first declaration's body* as if it were the second declaration's leading comment. Fixed by requiring `//`-prefixed lines specifically; re-verified the whole file end to end afterward. Added table-driven tests for the pure helpers relocated into `dbutil.go`/`spawn.go`/`grid.go` (`toInt64`, `mapsEqual`, `inClausePlaceholders`, `spawnEntriesEqual`, `gridEntriesEqual` — `toFloat64` already had coverage) as executable documentation of edge cases, replacing `app_test.go` with `dbutil_test.go`/`spawn_test.go`/`grid_test.go` alongside the files they test.
  2. **`DetailPanel.jsx` (483 lines, 5-way branch on `activeView`) split into a thin dispatcher + `NpcDetailPanel.jsx`/`SpawnDetailPanel.jsx`/`GridDetailPanel.jsx`/`SpawnGroupDetailPanel.jsx`**, mirroring the `NpcsTab`/`SpawnsTab`/`GridsTab`/`SpawngroupsTab` split that tab-level components already went through — `DetailPanel` never got the same treatment until now. Each panel takes only the props its own branch actually used, a strict subset of the old single 13-prop signature.
  3. **8 modal/drawer components' duplicated focus-on-open + Escape-to-close block extracted into `frontend/src/hooks/useModalFocusTrap.js`** — each had its own near-identical `useRef`/`useEffect`/inline `onKeyDown` (~6-7 lines apiece); now one hook, one place to fix the WKWebView-alert-sound-suppression behavior if it ever needs to change again.
  4. **`App.jsx` (1125 lines — grown back from the 558-line 2026-07-19 low, per that entry's own note flagging the regrowth) decomposed into 11 custom hooks** under `frontend/src/hooks/` (`useUIPrefs`/`useConnections`/`useReferenceDrawer`/`useNpcSync`/`useTodo`/`useSpawnSync`/`useSpawnGroupsTab`/`useSpawnGroupSync`/`useRelocateSpawnGroup`/`useGridSync`/`useLoot`), one per tab/domain — same domain boundaries as the Go split, so the two sides of the codebase now mirror each other. `App.jsx` dropped to 576 lines: zone-identity state, `activeView`, `expandedSections` (all genuinely cross-tab, stay put — see Key State above for why each), the `selectZone` fan-out (each hook now owns its own `onZoneChange`, so this shrank from ~50 inlined `setX(...)` calls to five one-line delegations), and the JSX layout. The one real design question this phase raised — several hooks need things from *each other* (e.g. `useTodo`'s `jumpToNpc` needs `useNpcSync`'s `diffRows`/`setSelectedNpc`; `useNpcSync`'s `executeSync` wants to call `useTodo`'s `refreshTodoItems`) — was resolved two ways depending on direction: a hook created *later* can freely take an earlier hook's return values as constructor-time parameters (no cycle); the one genuine cycle (`useNpcSync` ⇄ `useTodo`) was broken by having `executeSync` accept its `onSuccess` callback *at call time* instead of at hook-creation time, so `App.jsx` wires `executeSync={() => npcSync.executeSync(todo.refreshTodoItems)}`. The same call-time-callback pattern replaced `useSpawnGroupSync`'s old string-tagged `spawnGroupSyncSource` ('spawns' | 'spawngroups') dispatch — `openPreview` now takes the actual refresh callback directly, which is both simpler and removes a whole category of "forgot to handle a source string" bug. Verification for this phase specifically: `vite build` clean, plus (since there's no frontend test runner and Wails renders a native window this session couldn't drive) two static-analysis passes before considering it done — a script diffing every `hookVar.property` access in `App.jsx` against that hook's actual `return {...}` keys (zero mismatches), and a second diffing the full ordered list of JSX prop *names* (not values) between the pre-change and post-change `App.jsx` (identical, confirming no prop got renamed or dropped in transit, only its value source changed). **The user still needs to run `wails dev` and click through each tab plus a couple of modals as the real acceptance test** — this phase's static checks confirm the wiring is shaped correctly, not that the running app behaves identically.
- **Generic "ID alignment" primitive, 2026-07-23 (same day, direct follow-up).** Built in response to the user naming their actual recurring manual workflow (hand-written `UPDATE lootdrop SET id = X WHERE id = y` plus matching updates to every referencing table) and confirming they wanted it generalized across all four applicable tables, not just loot. See the "ID alignment" bullet under Sync Design for the full design (why it's a rename, not a content overwrite; why unconditional repoint is correct for these four targets when `RelocateSpawnGroup`'s zone carve-out isn't available; why `spawngroup` itself was deliberately left untouched). New `idalign.go` (`idAlignmentTarget`/`fkRef`/`idAlignmentTargets`, `AlignId`, `relocateRow`/`copyChildRows`/`repointReferences`/`countReferences`), two new generic `dbutil.go` helpers (`fetchRowById`/`fetchChildRows`, both accepting the new `queryer` interface so they work both pre-transaction and mid-transaction — `getSinkColumns` was widened to accept `queryer` too rather than adding a near-duplicate transaction-aware copy). Frontend: `useAlignId.js` + `ConfirmAlignIdModal.jsx` (summary-level confirm, not a per-entry table — the four targets' child-row shapes are too heterogeneous to force into one generic table the way spawn entries could), wired into `LootTab.jsx` per a UX decision confirmed with the user via explicit options (two-step cross-column click to pair a source lootdrop with its sink counterpart, vs. a click-then-pick-from-a-dropdown alternative — the former was chosen as more consistent with how the two-column tree already invites visual comparison). Surfaced a real correctness subtlety caught during design, not after: a loottable-level align changes `npc_types.loottable_id` in the database, but the NPCs tab's cached `diffRows` has no way to know that, so simply "replaying the NPC row that led here" after a successful align would look up an id that no longer exists — `useLoot.js`'s `refreshWithIds` sidesteps this by refetching with the known-correct post-align ids directly instead of re-deriving them from the (now stale) row. `go build`/`vet`/`test` and `vite build` clean; `wails generate module` run to bind the new `AlignId` method. Not yet manually smoke-tested against real source/sink databases — flagged to the user as the outstanding verification step, same as the hooks-split phase above.
- **`loottable_id` made clickable in the NPC detail panel, 2026-07-24.** Direct response to "there's no way to click it directly from the npc." Rather than building a second loot-rendering surface inside `ReferenceDrawer.jsx` (duplicating `LootTab.jsx`'s tree UI and losing its alignment action), clicking it switches to the Loot tab with this NPC's comparison preloaded — a new `referenceNavigationTypes` map in `lib/npcHelpers.js` (parallel to `referenceComparisonTypes`, but for "navigate elsewhere" fields rather than "open the drawer" ones) and `App.jsx`'s `jumpToLoot()`, reusing `lookupLootByNpc` exactly as the Loot tab's own NPC search already does. Caught mid-session: `idalign.go` — the file implementing the whole `AlignId` backend from the ID-alignment pass above — had been left out of that pass's commit (`git commit -a` doesn't pick up new untracked files), leaving HEAD in a state where the frontend called a Go method that didn't exist in git history; fixed by committing it separately once noticed.
- **ID-alignment UI extended to `npc_faction`/`npc_spells`, 2026-07-24 (same day, direct follow-up).** Closes the gap the `idalign.go` pass deliberately deferred. A single "Align \_\_\_ ID to source →" button next to each drawer's own id row in `FactionComparison.jsx`/`SpellsComparison.jsx` (same shape as the Loot tab's loottable-level trigger, not lootdrop's two-step click — neither header has an equivalent pairing ambiguity, since their `Entries` are keyed by the portable `faction_id`/`spellid`, not a local surrogate). `App.jsx` gained `alignReferenceId`/`refreshReferenceAfterAlign`, and a `refreshAfterAlign` dispatcher (keyed on `alignId.alignTarget.target`) now sits between `ConfirmAlignIdModal`'s `executeAlign` and whichever refresh actually applies, so that one modal can serve both the Loot tab's and the reference drawers' align flows without either needing to know about the other.

## Git
- Repo: `git@github.com:nazwadi/eqemu_dsynch_tool.git`
- Branch: `main`
