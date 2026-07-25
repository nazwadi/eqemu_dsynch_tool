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
│                     inClausePlaceholders/isDuplicateEntryError/runParallel
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
├── referencecontent.go  # Generic "reference content sync" primitive (SyncReferenceContent) —
│                     overwrites a shared row's fields+entries to match source, id untouched, for
│                     npc_faction/npc_spells/merchantlist/loottable (phase 2, added 2026-07-25,
│                     see Sync Design) — the complement to idalign.go, which only ever renames
├── zonemap.go       # Parses Brewall's Maps .txt files (GetZoneMap) for the Grids tab's Map view
│                     (added 2026-07-24, see Sync Design)
├── app_test.go      # (superseded — see dbutil_test.go/spawn_test.go/grid_test.go below)
├── dbutil_test.go   # Table-driven tests for dbutil.go's pure helpers (toFloat64/toInt64/
│                     mapsEqual/inClausePlaceholders)
├── spawn_test.go    # TestSpawnEntriesEqual
├── grid_test.go     # TestGridEntriesEqual
├── zonemap_test.go  # TestGetZoneMap* — includes a real-data check against EQ-Maps/Brewall/
│                     gfaydark.txt (skipped if that directory isn't present)
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
        │   ├── useBatchRelocateSpawnGroups.js # Batch relocate-and-reclaim (added 2026-07-24) —
        │   │                             every distinct colliding spawngroup id at once, see
        │   │                             lib/spawnHelpers.js's collidingSpawnGroupIds
        │   ├── useDeleteSpawnGroup.js   # Delete confirm flow for "removed" spawngroups
        │   │                             (added 2026-07-24), mirrors useRelocateSpawnGroup's shape
        │   ├── useGridSync.js           # Grids tab
        │   ├── useLoot.js               # Loot tab
        │   ├── useAlignId.js            # Confirm flow for the generic AlignId primitive,
        │   │                             triggered from the Loot tab (added 2026-07-23)
        │   ├── useCreateLootDrop.js     # Confirm flow for CreateLootDrop — the create
        │   │                             counterpart to AlignId, same shape (added 2026-07-24)
        │   ├── useSyncReferenceContent.js  # Confirm flow for the generic SyncReferenceContent
        │   │                             primitive (phase 2, added 2026-07-25) — same shape as
        │   │                             useAlignId.js, the content-overwrite complement to it
        │   ├── useZoneMap.js            # Brewall's Maps background for the Grids tab's Map
        │   │                             view (added 2026-07-24) — simpler than the other
        │   │                             domain hooks, a zone map is static, nothing to sync
        │   └── useModalFocusTrap.js     # Shared focus-on-open + Escape-to-close behavior,
        │                                 used by all 9 modal/drawer components below
        ├── lib/            # Pure helpers/constants, no React or component state
        │   ├── constants.js
        │   ├── npcHelpers.js
        │   ├── spawnHelpers.js
        │   ├── gridHelpers.js
        │   ├── spawnGroupHelpers.js
        │   ├── lootHelpers.js
        │   ├── zoneMapHelpers.js  # World-coordinate -> SVG viewBox transform (scale-to-fit +
        │   │                       Y-flip, verified against real Brewall data — see Sync Design)
        │   └── pendingGoCalls.js  # Global in-flight-backend-call counter (added 2026-07-25) —
        │                           usePendingGoCalls() + instrumentGoCalls(), see Sync Design's
        │                           "SSH lag" entry. Not really a "pure helper" like its siblings
        │                           above (it holds module-level mutable state), but lives here
        │                           rather than hooks/ since it's a plain subscribe-store, not a
        │                           React hook wired to component lifecycle
        └── components/     # Presentational components, one per modal/drawer/tab/panel
            ├── ConnectModal.jsx, ConfirmSyncModal.jsx, ConfirmSpawnSyncModal.jsx,
            │   ConfirmSpawnGroupSyncModal.jsx, ConfirmGridSyncModal.jsx,
            │   ConfirmRelocateSpawnGroupModal.jsx, ConfirmBatchRelocateSpawnGroupsModal.jsx,
            │   ConfirmDeleteSpawnGroupModal.jsx,
            │   ConfirmAlignIdModal.jsx, ConfirmCreateLootDropModal.jsx,
            │   ConfirmSyncReferenceContentModal.jsx, ReferenceDrawer.jsx
            ├── HelpDrawer.jsx  # Shared right-edge slide-over chrome (backdrop/focus-trap/header)
            │   reused by every tab's own "?" help drawer below, rather than each re-implementing it
            ├── SpawnHelpDrawer.jsx, NpcHelpDrawer.jsx, SpawngroupHelpDrawer.jsx,
            │   GridMapHelpDrawer.jsx, LootHelpDrawer.jsx  # one per tab that has inline help —
            │   see the "Inline help drawers extended" Sync Design bullet for why Grids List and
            │   TODO don't have one
            ├── ExcludedFieldsDrawer.jsx  # Configures Config.ExcludedNPCFields, built on the same
            │   HelpDrawer shell as the help drawers above despite being a settings panel, not
            │   reference content — see its own doc comment and the "Excluded fields from NPC
            │   sync" Sync Design bullet
            ├── FactionComparison.jsx, SpellsComparison.jsx, MerchantComparison.jsx
            ├── Sidebar.jsx
            ├── NpcsTab.jsx, SpawnsTab.jsx, TodoTab.jsx, GridsTab.jsx, SpawngroupsTab.jsx,
            │   LootTab.jsx
            ├── ZoneMapView.jsx  # Brewall's Maps background + every zone grid overlaid, used
            │                     by GridsTab's Map view (added 2026-07-24)
            ├── GlobalProgressBar.jsx  # Top-of-window indeterminate loading bar (added 2026-07-25),
            │                           fed by lib/pendingGoCalls.js — see Sync Design
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
    // sourceMu/sinkMu (added 2026-07-25) guard sourceDB/sourceTunnel and sinkDB/sinkTunnel
    // respectively against two Connect() calls racing on the SAME side — see Connect()'s own
    // comment. Two separate mutexes, not one shared lock, so a source reconnect and a sink
    // reconnect (genuinely independent) never block each other; safe from deadlock since
    // Connect() only ever takes one of the two per call. Deliberately scoped to this one race —
    // every OTHER `a.sourceDB`/`a.sinkDB` read site across the app stays unguarded, the same
    // accepted-gap boundary this was originally documented with.
    sourceMu sync.Mutex
    sinkMu   sync.Mutex
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
    Source        ConnectionConfig
    Sink          ConnectionConfig
    UI            UIPrefs  // added 2026-07-19 — layout prefs (sidebar/detail width, sidebar collapsed), see Repo Meta
    MapsDirectory string   // added 2026-07-24 — folder of Brewall's Maps .txt files, see zonemap.go. Not gated behind Connect like Source/Sink: saved immediately on pick (useConnections.js's setAndPersistMapsDirectory), since there's no "connect" step for a plain path
    ExcludedNPCFields []string  // added 2026-07-24 — npc_types columns Sync never overwrites on an EXISTING sink row, see NPCDiffRow.FieldsDiffer/upsertNPC. Same "plain preference, saved immediately" treatment as MapsDirectory, configured via the NPCs tab's "Excluded fields" drawer or inline per-field toggles in the NPC detail panel
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
    // FieldsDiffer (added 2026-07-24) is true if any column OUTSIDE Config.ExcludedNPCFields
    // differs — the only thing an UPDATE from Sync will actually change. Status itself stays
    // computed from the FULL, unfiltered field comparison (never hides a real difference), so a
    // "modified" row with FieldsDiffer false differs only in excluded columns — something Sync
    // deliberately won't touch, not nothing worth showing. Mirrors SpawnDiffRow's
    // FieldsDiffer/SpawnEntriesDiffer split; see npcRowSelectable/npcFieldsOnlyExcluded (frontend)
    // for how this drives selectability the same way spawnRowSelectable/spawnEntriesOnly do.
    FieldsDiffer bool
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
    ExcludedFields []string  // added 2026-07-24 — npc_types columns upsertNPC never overwrites on an EXISTING sink row (still set on a brand-new INSERT — see upsertNPC's own comment)
}

// SyncResult carries no spawn-point fields — Sync() only ever touches npc_types (see the removal
// of per-NPC spawn point creation under Sync Design). An NPC syncs regardless of whether it has a
// spawn point yet; spawn2 creation belongs exclusively to the Spawn Points tab (SyncSpawnPoints).
type SyncResult struct {
    DryRun     bool
    NPCsSynced []int64
    // Deleted (added 2026-07-24) — NPCs actually removed from the sink because they don't exist in
    // source, the implied meaning of syncing a "removed" row. See DeletedNPC and the "Delete on
    // sync for removed NPCs" Sync Design entry for why this replaced silently skipping them.
    Deleted   []DeletedNPC
    Skipped   []SkippedNPC // NPCs deliberately not synced (not found in source OR sink — see Deleted for the "removed" case, which no longer lands here) — every NPCId ends up in exactly one of NPCsSynced, Deleted, or Skipped
    TODOItems []TODOItem
    Errors    []string     // genuine unexpected failures only — never a deliberate skip, see SkippedNPC
}

type SkippedNPC struct {
    NPCID  int64
    Name   string
    Reason string
}

// DeletedNPC is an NPC actually removed from the sink — real, intentional action taken, not
// something declined (contrast with SkippedNPC). Sync() does not cascade this into spawnentry
// rows still referencing the deleted npcID on the sink — those become Orphaned the same way any
// other dangling spawnentry reference already does (see SpawnEntry.Orphaned), rather than Sync()
// reaching into a different domain's tables to auto-clean up, consistent with this app never
// silently fixing a dangling reference it finds, only flagging it.
type DeletedNPC struct {
    NPCID int64
    Name  string
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

// CreateLootDropOptions/CreateLootDropResult (loot.go, added 2026-07-24) — the create counterpart
// to AlignId, for a source lootdrop with nothing on the sink to rename yet (AlignId explicitly
// refuses when SinkId == 0). See CreateLootDrop's own doc comment for why this copies content
// (align never does) while still reusing align's squatter-eviction machinery.
type CreateLootDropOptions struct {
    SourceId int64
    DryRun   bool
}

type CreateLootDropResult struct {
    DryRun          bool
    SourceId        int64
    SquatterSummary string  // same convention as AlignIdResult — "" if SourceId was free on sink
    SquatterEvicted bool
    NewSquatterId   int64   // where the squatter ends up — 0 on dry run or if no squatter
    EntriesCreated  int
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
    SpawnGroupCollisionRisk bool  // "new" rows only: Source's raw SpawnGroupId exists as a spawngroup on the SINK whose CONTENT doesn't match source's — cross-database check, categorically different from SpawnPoint.SpawnGroupMissing's same-database check; content-aware as of 2026-07-24 (not just existence), specifically so this clears once RelocateSpawnGroup has actually fixed it — see annotateSpawnGroupCollisionRisk
}

type SpawnSyncOptions struct {
    ZoneShortName  string
    ZoneVersion    int8
    DryRun         bool
    SpawnIds       []int64       // sink spawn2.id — "modified" rows being synced (UPDATE spawn2's own columns only, spawngroupID untouched)
    NewSpawnCoords [][3]float64  // source (x,y,z) — "new" rows being synced (plain INSERT of spawn2's own columns, spawngroupID copied verbatim from source — see SyncSpawnPoints)
    DeleteSpawnIds []int64       // added 2026-07-24 — sink spawn2.id for "removed" rows (no source counterpart) being deleted; see the "Delete on sync for removed rows" Sync Design entry
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
    Deleted int  // added 2026-07-24 — spawn2 rows actually deleted because they don't exist in source. A plain count, not a structured list like NPC Sync()'s DeletedNPC — the frontend already knows which selected rows are "removed" from its own loaded spawnDiffRows
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
// (zone, version) currently referencing SpawnGroupId that will actually get repointed to the
// squatter's new home — the confirm-step preview. ThisZoneCount is the caller's OWN zone/version's
// count, never touched, shown purely so the count can be sanity-checked against what's actually
// expected there rather than assumed safe (this app has no way to verify every one of those rows
// is really waiting on the reclaim vs. a genuine unrelated coincidental match — see
// RelocateSpawnGroup's own comment). NewSpawnGroupId (where the squatter's content ends up) is
// only known once the real write happens — 0 on dry run.
//
// SharedSourceUsage (added 2026-07-24, real shipped-bug fix) is the other half of what used to be
// lumped into SquatterUsage: OTHER (zone, version) pairs whose sink spawn2 rows reference
// SpawnGroupId AND whose SOURCE *also* legitimately references this same id — a spawngroup shared
// across multiple zones (it has no zone column of its own, see EQEmu Schema Notes). These are
// excluded from the repoint step exactly like ThisZoneCount, for the same reason: once the id is
// reclaimed with source's real content, they resolve correctly with no further action. Before this
// fix, RelocateSpawnGroup's exclusion set was only ever the caller's single zone — any OTHER zone
// sharing the same source spawngroup got silently repointed to the squatter's unrelated content,
// which from the outside looked exactly like "the collision never actually got fixed" even though
// the id the caller relocated was populated correctly. See RelocateSpawnGroup's own comment.
type RelocateSpawnGroupResult struct {
    DryRun            bool
    SpawnGroupId      int64
    SquatterName      string
    NewSpawnGroupId   int64
    SquatterUsage     []SpawnGroupZoneUsage
    ThisZoneCount     int
    SharedSourceUsage []SpawnGroupZoneUsage
}

// BatchRelocateSpawnGroupsOptions/RelocateSpawnGroupOutcome/BatchRelocateSpawnGroupsResult
// (spawngroup.go, added 2026-07-24) — the "relocate every colliding spawngroup at once" batch
// counterpart to RelocateSpawnGroup, for zones where SpawnGroupCollisionRisk is the norm (hundreds
// of "new" spawn2 rows sharing a much smaller set of distinct SpawnGroupIds — see
// RelocateSpawnGroups' own comment).
type BatchRelocateSpawnGroupsOptions struct {
    ZoneShortName string
    ZoneVersion   int8
    SpawnGroupIds []int64  // sink spawngroup ids to relocate — the distinct colliding ids, not spawn2 rows
    DryRun        bool
}

// RelocateSpawnGroupOutcome pairs one requested SpawnGroupId with its own RelocateSpawnGroupResult,
// or an error message if that specific id's relocate failed — never silently drops either half,
// same "always show what actually happened per item" discipline as SyncResult's per-NPC buckets.
type RelocateSpawnGroupOutcome struct {
    SpawnGroupId int64
    Result       RelocateSpawnGroupResult
    Error        string  // "" on success
}

type BatchRelocateSpawnGroupsResult struct {
    DryRun   bool
    Outcomes []RelocateSpawnGroupOutcome
}

// DeleteSpawnGroupOptions/Result (spawngroup.go, added 2026-07-24) — deletes a "removed" sink
// spawngroup (no source counterpart at all). Usage is every (zone, version) currently referencing
// SpawnGroupId with NO exclusion for the caller's own zone — unlike RelocateSpawnGroupResult's
// SquatterUsage/ThisZoneCount split, ANY usage at all blocks the delete: a "removed" status only
// means no source spawngroup resolved to this id, not that nothing on the sink still depends on
// it, and deleting a spawngroup still referenced anywhere would orphan those spawn2 rows into
// SpawnGroupMissing. See DeleteSpawnGroup's own comment.
type DeleteSpawnGroupOptions struct {
    SpawnGroupId int64
    DryRun       bool
}

type DeleteSpawnGroupResult struct {
    DryRun         bool
    SpawnGroupName string
    Usage          []SpawnGroupZoneUsage  // non-empty means blocked — nothing was changed
    EntriesDeleted int                    // spawnentry rows deleted (or that would be) alongside it
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

// referenceContentTarget (referencecontent.go, added 2026-07-25 — phase 2) describes one shared
// reference table SyncReferenceContent can overwrite the CONTENT of — the complement to
// idAlignmentTarget, which only ever renames. spawngroup/lootdrop are deliberately not here:
// spawngroup keeps its own zone-scoped SyncSpawnGroup, and lootdrop content already has AlignId/
// CreateLootDrop — this primitive's loottable entry only ever copies lootdrop_id references
// verbatim, never lootdrop content itself.
type referenceContentTarget struct {
    headerTable    string  // "" if there's no separate header row (merchantlist has none)
    childTable     string  // npc_faction_entries / npc_spells_entries / merchantlist / loottable_entries
    childParentCol string  // FK column in childTable equal to the anchoring id on this side
    npcFKColumn    string  // column on npc_types referencing this same id — the usage-count query
}

var referenceContentTargets = map[string]referenceContentTarget{
    "npc_faction":  {"npc_faction", "npc_faction_entries", "npc_faction_id", "npc_faction_id"},
    "npc_spells":   {"npc_spells", "npc_spells_entries", "npc_spells_id", "npc_spells_id"},
    "merchantlist": {"", "merchantlist", "merchantid", "merchant_id"},
    "loottable":    {"loottable", "loottable_entries", "loottable_id", "loottable_id"},
}

// SyncReferenceContentOptions/Result — SinkId is never renumbered (unlike AlignIdOptions'
// SinkId, which gets renamed to SourceId); only what's stored under it changes.
type SyncReferenceContentOptions struct {
    Target   string  // key into referenceContentTargets
    SourceId int64   // content is read from here
    SinkId   int64   // content is overwritten here — id itself untouched
    DryRun   bool
}

type SyncReferenceContentResult struct {
    DryRun        bool
    SinkId        int64
    UsageCount    int   // OTHER NPCs on the sink referencing SinkId via npcFKColumn — warning only, never blocks
    EntriesBefore int   // sink's current child-row count at SinkId
    EntriesAfter  int   // source's child-row count at SourceId — what EntriesBefore becomes
    HeaderChanged bool  // whether the header row's own fields differ — always false when headerTable == ""
}

// MapLineSegment is one L-line from a Brewall's Maps .txt file (zonemap.go, added 2026-07-24) —
// world-space coordinates (the same X/Y/Z space spawn2/grid_entries already use), not screen
// pixels; the frontend owns the transform to an SVG viewBox (lib/zoneMapHelpers.js).
type MapLineSegment struct {
    X1, Y1, Z1 float64
    X2, Y2, Z2 float64
    R, G, B    uint8
}

type ZoneMap struct {
    Segments []MapLineSegment // empty (not an error) if no map file exists for this zone — see GetZoneMap
}
```

## Go Backend — Key Functions

*Same file-split note as Key Types above — e.g. `Connect`/`openSSHTunnel` live in `ssh.go`,
`CompareZones`/`Sync` in `npc.go`, `CompareSpawns`/`SyncSpawnPoints` in `spawn.go`, and so on
following each function's own domain; see Project Structure for the full file list.*

- `Connect(c *ConnectionConfig, isSource bool) error` — connects to DB, pings, sets pool settings. **When `c.UseSSH` is true (added 2026-07-19), opens an SSH tunnel first** (`openSSHTunnel`) and points `sql.Open` at the tunnel's local forwarding address instead of `c.Host`/`c.Port` — the DB driver never knows a tunnel is involved, it just connects to `127.0.0.1:<ephemeral>`. DSN is built via `mysql.Config`/`FormatDSN()` (fixed 2026-07-20 — was raw string concatenation, which silently misparsed a username/password containing `@`/`:`/`/`/`?` into the wrong host or database instead of failing loudly). Closes any pre-existing tunnel **and** `sql.DB` pool on that side before replacing them (fixed 2026-07-20 — a stale tunnel is a live goroutine + open listener that would otherwise run forever, and `sql.DB` has no finalizer either: dropping the reference without calling `Close()` leaked its pooled connections, up to `MaxOpenConns`, for the rest of the process's life on every reconnect. `shutdown()` closing `sourceDB`/`sinkDB` only ever covered the *last* one). **Real, shipped bug, fixed 2026-07-25** (asked directly: "fix the race condition if that's actually a bug"): no mutex protected `sourceDB`/`sourceTunnel`/`sinkDB`/`sinkTunnel`, so two `Connect()` calls racing on the *same* side (not source-vs-sink, which touch disjoint fields) could each read the old db/tunnel as non-nil-to-close, then race to assign the new ones — a genuine lost-update data race, silently leaking whichever db/tunnel lost the write race (never `Close()`'d, never reachable again). Fixed by having `Connect()` hold `a.sourceMu`/`a.sinkMu` (whichever matches `isSource`) for the entire call — not just the final swap, so a second `Connect()` for the same side waits for the first to fully finish (tunnel dial, DB ping, all of it) rather than interleaving; source and sink still connect fully in parallel, since each side has its own mutex, and there's no lock-ordering deadlock risk since a single call only ever takes one of the two. `shutdown()` takes the same two mutexes before closing, so it can't race a `Connect()` still in flight either. Deliberately scoped to exactly this race, same boundary the original gap was documented with — every other `a.sourceDB`/`a.sinkDB` read site across the app (the `if a.sourceDB == nil` guards in nearly every `Compare*`/`Sync*` method) stays unguarded; fixing those would mean auditing every read site across the codebase, a much bigger change than the connection-swap race itself
- `openSSHTunnel(cfg SshConfig, remoteHost, remotePort string) (*sshTunnel, string, error)` — dials the SSH server (`sshAuthMethods` for the auth method, `sshHostKeyDB` for host-key verification **and** `HostKeyAlgorithms` pinning, see below), then opens a local listener bound to `127.0.0.1:0` (OS-assigned ephemeral port, loopback-only — so source and sink tunnels never collide and nothing outside this machine can reach the forwarded port) and returns its address. Each accepted local connection gets forwarded through the SSH client to `remoteHost:remotePort` by `forwardConn` (its own goroutine pair, one per direction, so one slow client can't stall others sharing the tunnel)
- `sshHostKeyDB() (*knownhosts.HostKeyDB, error)` — verifies the SSH server's host key against the user's own `~/.ssh/known_hosts`, deliberately **not** `ssh.InsecureIgnoreHostKey()`. Same trust model the system `ssh`/`git` already use on this machine; if the host isn't already known, `ssh.Dial` fails with a `knownhosts` error rather than silently trusting whatever key the server presents — the fix is the same one `ssh` itself would prompt for (connect via a terminal once to add it), not something this app tries to paper over with a TOFU prompt of its own. Uses `github.com/skeema/knownhosts` (a thin wrapper around `x/crypto/ssh/knownhosts`) rather than that package directly — **real, shipped bug, fixed 2026-07-21:** a user with an ED25519-only entry for a host in `known_hosts` (added by the system `ssh`, which prefers ED25519 when a server offers multiple host key types) got a "knownhosts: key is unknown" error from this app even though `ssh` itself trusted the host fine. Root cause: `ssh.ClientConfig.HostKeyAlgorithms` was left unset, so `x/crypto/ssh` used its own default preference order (RSA-family algorithms before ED25519) to negotiate with the server — which, having both key types configured, presented its RSA key instead of the ED25519 one `known_hosts` actually had recorded. `openSSHTunnel` now sets `HostKeyAlgorithms: hostKeyDB.HostKeyAlgorithms(sshAddr)`, pinning the negotiation to whichever key type(s) are actually recorded for that host — the same "known_hosts already decided" trust model, just applied at negotiation time too, not only at verification time. A host with no `known_hosts` entry at all still falls through to the library default order and fails the same way it always did (`HostKeyAlgorithms()` returns `nil` for those, and `ssh.ClientConfig` treats a nil slice as "unset," not "no algorithms allowed" — checked via `!= nil`, not `len == 0`, in `x/crypto/ssh/handshake.go`)
- `sshAddr := net.JoinHostPort(cfg.Host, cfg.Port)` is computed once in `openSSHTunnel`, before building `sshClientConfig`, specifically so `hostKeyDB.HostKeyAlgorithms(sshAddr)` and the later `ssh.Dial("tcp", sshAddr, ...)` are guaranteed to look up/dial the exact same address string
- `sshAuthMethods(cfg SshConfig) ([]ssh.AuthMethod, error)` — builds exactly one `ssh.AuthMethod` from `cfg.AuthMethod`, either `ssh.Password` or `ssh.PublicKeys` (parsing the key file at `PrivateKeyPath`, with `ssh.ParsePrivateKeyWithPassphrase` if `Passphrase` is set)
- `PickPrivateKeyFile() (string, error)` — opens a native file-choose dialog (`wailsruntime.OpenFileDialog`) for the private key field, so the user can browse to e.g. `~/.ssh/id_rsa` instead of typing the path. Returns `""` with no error if the dialog is cancelled — the frontend treats an empty result as "leave the field unchanged"
- `GetZones() ([]Zone, error)` — queries source DB zone table
- `GetNPCsForZone(shortName string, version int8, zoneIdNumber int64, isSource bool) ([]NPC, error)` — discovers NPCs for a zone via two `UNION ALL`'d branches, not one `LEFT JOIN`ed query (see Important Go Implementation Details for why): (1) a real spawn2/spawngroup/spawnentry chain scoped to `(zone, version)`, or (2) — only if the NPC has no spawn2 row in *any* zone — `npc_types.id` falling in this zone's `[zoneidnumber*1000, zoneidnumber*1000+1000)` ID block, found via a primary-key range scan (quest-spawned NPCs, e.g. Vex Thal). The branches can never overlap by construction. `NPC.HasSpawnPoint` records which path found it. Returns all npc_types columns as map
- `runParallel(fns ...func() error) error` (`dbutil.go`, added 2026-07-25) — runs each function concurrently, waits for all to finish, returns the first non-nil error in argument order (or nil). Direct response to reported UI lag over SSH tunnels: every `Compare*` method fetches source and sink independently, but did so sequentially — each round trip through a tunnel pays real network latency, so N sequential queries cost N times that latency where they could cost it once. `*sql.DB` is safe for concurrent use by multiple goroutines (its own connection pool), so running source's and sink's fetch/annotate pipelines concurrently is a pure latency win with nothing to lock. Deliberately waits for every function even after an earlier one errors, rather than cancelling the rest — a query already in flight should finish cleanly, not be abandoned mid-flight, and these are cheap reads. Used by `CompareZones`/`CompareSpawns`/`CompareGrids`/`CompareSpawnGroups`/`CompareNPCFaction`/`CompareNPCSpells`/`CompareNPCMerchant`/`CompareNPCLoot` — every read-only diff/comparison method that fetches both sides. Deliberately NOT used on any write path (`Sync`/`SyncSpawnPoints`/`RelocateSpawnGroup`/etc.) — a `*sql.Tx`, unlike `*sql.DB`, is NOT safe for concurrent use, so those stay sequential. Covered by `TestRunParallel` in `dbutil_test.go` (all-succeed, a failing function doesn't abandon the others, first error wins in argument order not completion order)
- `CompareZones(shortName string, version int8, zoneIdNumber int64, excludedFields []string) ([]NPCDiffRow, error)` — diffs source vs sink NPCs by ID, scoped to one specific `(short_name, version)` zone row; calls `annotateMissingReferences` for both sides after fetching, so each `NPC.MissingReferences` is populated before the diff rows are built. `excludedFields` (added 2026-07-24, from `Config.ExcludedNPCFields`) computes each row's `FieldsDiffer` via `withoutFields()` on top of the same full field maps `Status` already compared — see `NPCDiffRow.FieldsDiffer`'s own comment. **Source/sink fetch+annotate run concurrently via `runParallel`, added 2026-07-25** — see that function's own entry
- `annotateMissingReferences(ctx, db *sql.DB, npcs []NPC) error` — flags, per NPC, any of `referenceFKColumns` (`npc_faction_id`→`npc_faction.id`, `npc_spells_id`→`npc_spells.id`, `merchant_id`→`merchantlist.merchantid`, `loottable_id`→`loottable.id` — note npc_types.merchant_id and merchantlist.merchantid spell it differently, see EQEmu Schema Notes) whose nonzero value doesn't resolve to a real row in that SAME database — batched into exactly 3 queries per side via `existingIds()`, regardless of zone size. Only called from `CompareZones`, not `GetNPCsForZone` itself (which `Sync()` also uses and has no need for this), so `Sync()` doesn't pay for checks it never displays. `alt_currency_id` is the only one still excluded (unused everywhere checked)
- `existingIds(ctx, db, table, column string, ids map[int64]bool) (map[int64]bool, error)` — batch existence check via `SELECT DISTINCT <column> FROM <table> WHERE <column> IN (...)`; `table`/`column` are always one of `referenceFKColumns`'s hardcoded pairs, never user input
- `CompareNPCFaction(sourceFactionId, sinkFactionId int64) (NPCFactionComparison, error)` — fetches the `npc_faction` header row and `npc_faction_entries` for each side independently by its own raw id (no cross-database matching — the NPC that led here is the anchor), merges entries by the portable `faction_id`. `fetchNPCFactionHeader`/`fetchNPCFactionEntries` do the actual queries; `resolveFactionNames` batch-resolves `faction_list.name` for whichever `faction_id`s showed up, against the same database the entries came from. Each side's whole header→entries→names pipeline runs concurrently via `runParallel`, added 2026-07-25
- `CompareNPCSpells(sourceSpellsId, sinkSpellsId int64) (NPCSpellsComparison, error)` — same anchor-via-NPC shape as faction. `fetchNPCSpellsHeader`/`fetchNPCSpellsEntries` fetch the raw rows; `resolveSpellNames` resolves `spells_new.name` (scanned as `sql.NullString` — unlike `faction_list.name`, this column is nullable). Each side's pipeline runs concurrently via `runParallel`, added 2026-07-25
- `CompareNPCMerchant(sourceMerchantId, sinkMerchantId int64) (NPCMerchantComparison, error)` — no header fetch (merchantlist has no separate profile row, see `NPCMerchantComparison`); `fetchMerchantEntries` queries `merchantlist WHERE merchantid = ?` directly, entries merged by `item`. `resolveItemNames(ctx, db, entries, idField string)` resolves `items.Name` — generalized to take the id column name as a parameter since merchantlist calls it `item` and `lootdrop_entries` calls it `item_id`. Each side's pipeline runs concurrently via `runParallel`, added 2026-07-25
- `CompareNPCLoot(sourceLoottableId, sinkLoottableId int64) (NPCLootComparison, error)` — same anchor-via-NPC shape, one level deeper. `fetchLootTable(ctx, db, id)` builds one side's full tree: `fetchLootTableHeader` for the loottable's own fields, then `loottable_entries` for that id, then `fetchLootDrops` batch-fetches every referenced lootdrop (headers + `lootdrop_entries` + resolved item names + `lootDropSharedCounts`, 4 queries total regardless of tree size, mirroring `getSpawnPointsForZone`'s batching). A `loottable_entries` row whose `lootdrop_id` doesn't resolve to a real `lootdrop` row still produces a `LootTableEntry` with `Drop: nil`, not a silently-dropped entry. `CompareNPCLoot`'s two `fetchLootTable` calls (each already several sequential queries on its own) run concurrently via `runParallel`, added 2026-07-25
- `GetLootTable(isSource bool, loottableId int64) (*LootTable, error)` — the Loot tab's raw-ID lookup path, necessarily one-sided: `loottable_id` isn't portable across databases (same local-surrogate category as `spawngroup.id`), so a typed-in id only means something on the database it was typed against
- `CreateLootDrop(options CreateLootDropOptions) (CreateLootDropResult, error)` (`loot.go`, added 2026-07-24) — copies a source-only lootdrop (fields + `lootdrop_entries`) to the sink, preserving source's own id when free. `fetchRowById`/`fetchChildRows` pull source's current content fresh (never trusts client-supplied field data for a write, same discipline every other sync-capable method in this app already follows); if source's id is already occupied by unrelated content on the sink, `relocateRow` (`idalign.go`) evicts that squatter first — the exact function `AlignId` already uses for the same situation, reused rather than reimplemented so both actions agree on what "the id is safe to write to" means. Deliberately does NOT also create a `loottable_entries` row linking the new lootdrop into any loottable — the confirm modal says so explicitly, since guessing which loottable and what multiplier/probability/droplimit to use would be exactly the kind of correspondence-guessing this app otherwise refuses to do
- `Sync(options SyncOptions) (SyncResult, error)` — dry-run preview and real execution of `npc_types` sync, keyed off `options.DryRun`; see Sync Design below. A selected id not found in source but found in sink (a "removed" row) is deleted from the sink's `npc_types`, not skipped (added 2026-07-24, see "Delete on sync for removed NPCs" in Sync Design) — an id in neither database still falls back to the original `Skipped` behavior, since that's a genuinely stale/invalid id, not a delete target
- `SaveConfig(c Config) error` — saves to `~/.config/eqemu-sync/config.json`
- `LoadConfig() (Config, error)` — loads config on startup
- `LoadTODOItems() ([]TODOItem, error)` — reads `~/.config/eqemu-sync/todo.json` back, dismissed items included; frontend filters for display
- `SetTODOItemDismissed(id int64, dismissed bool) error` — archive/un-archive one TODO item by ID
- `getSpawnPointsForZone(ctx, db, shortName string, version int8) ([]SpawnPoint, error)` — zone-scoped `spawn2` fetch plus linked `spawngroup`/`spawnentry` rosters, batched into exactly 3 queries regardless of zone size (`spawn2` by zone/version, then `spawngroup`/`spawnentry` both `IN (...)` on the distinct `spawngroupID`s found) — computes `LocationSharedCount` in-memory from the same `spawn2` result set rather than a 4th query
- `resolveOrphanedSpawnEntryNames(ctx, points []SpawnPoint, otherDB *sql.DB) error` — for any spawn entry that didn't resolve against the database it came from, looks it up in the *other* database instead; see "Spawn point identity" below for why that's a recovery, not a guess
- `CompareSpawns(shortName string, version int8, zoneIdNumber int64) ([]SpawnDiffRow, error)` — App method backing the Spawn Points tab; matches source/sink `SpawnPoint`s by exact `(x,y,z)`, classifies new/modified/removed/match, and computes `FieldsDiffer`/`SpawnEntriesDiffer` independently (via `mapsEqual()`/`spawnEntriesEqual()`) before deriving `Status` — `Status = "modified"` whenever *either* flag is true, `"match"` only when both are false, so a row's status alone can't tell the frontend which kind of difference it has; that's exactly why the two flags are exposed separately rather than collapsed. `zoneIdNumber` (added alongside `PathgridMissing`) is only needed to check `pathgrid` against each database's own `grid` rows via `fetchZoneGridIds`/`annotatePathgridMissing` — `grid` is keyed by `zoneid`, not `short_name`. Also calls `annotateSpawnGroupCollisionRisk` after building `diff`, so a "new" row's `SpawnGroupCollisionRisk` is visible in the diff list before anything gets synced. Each side's whole fetch→resolve-orphans→grid-ids pipeline runs concurrently via `runParallel`, added 2026-07-25
- `annotateSpawnGroupCollisionRisk(ctx, sinkDB *sql.DB, diff []SpawnDiffRow) error` — for every `"new"` row, checks whether Source's raw `SpawnGroupId` exists as a `spawngroup` row on the sink AND, if so, whether its content actually matches source's (via `spawnGroupContentMatches`, using `mapsEqual`/`spawnEntriesEqual` with `"name"` excluded). **Real, shipped bug fixed 2026-07-24** (found via user report: "when does the error ever go away?" — after a real collision was fixed with `RelocateSpawnGroup`, every OTHER `"new"` row still sharing that same spawngroupID — the common case, since a spawngroup is usually a pool shared across many locations — kept showing `SpawnGroupCollisionRisk: true` forever): the original version only checked existence (`existingIds`), never content, so once the id was legitimately populated with source's real content there was no way for the flag to ever clear — a sink spawngroup existing at that id was *always* treated as someone else's, even right after this exact function's own `RelocateSpawnGroup` had put the correct content there. Fixed by fetching the sink's actual content for every colliding id (`fetchSpawnGroupContentByIds`, batched into 2 queries regardless of row count) and comparing it against source's (already loaded on each row's `Source.SpawnGroupFields`/`SpawnEntries`, no extra query needed for that half) — only a genuine content mismatch is now flagged. `spawnGroupContentMatches` is extracted as its own pure function (`spawn_test.go`'s `TestSpawnGroupContentMatches`) specifically so this comparison — the same one both this bug and `RelocateSpawnGroup`'s cross-zone repoint bug hinged on, in the same session — is pinned down by a test rather than only living inline. Warning only — never blocks syncing the spawn2 row itself
- `updateSpawn2(ctx, tx, sinkId int64, sourceFields map[string]interface{}, sinkColumns map[string]bool) error` — plain `UPDATE` of a matched spawn2 row's own columns only; never touches `spawngroupID`, so spawn entries composition is untouched no matter what this call does
- `SyncSpawnPoints(options SpawnSyncOptions) (SpawnSyncResult, error)` — dry-run/execute for the Spawn Points tab, own transaction separate from `Sync()`'s. `SpawnIds` (sink IDs, "modified" rows) go through `updateSpawn2`; `NewSpawnCoords` (source coordinates, "new" rows) are a plain `insertRow` of spawn2's own columns, with `spawngroupID` copied verbatim from source — see the "Spawn points sync verbatim" note under Sync Design for why a dangling value here is intentional, not a bug. `DeleteSpawnIds` (added 2026-07-24, sink IDs, "removed" rows) are a plain `DELETE FROM spawn2 WHERE id = ?` — nothing else references `spawn2.id`, so unlike `DeleteSpawnGroup` there's no usage check needed first
- `SyncSpawnGroup(options SyncSpawnGroupOptions) (SpawnGroupSyncResult, error)` — dry-run/execute for reconciling one spawngroup (fields + full spawnentry roster together). Identifies the target via a spawn2 location's coordinates, same as everywhere else spawngroup identity is derived. If the sink spawn2 row's `SpawnGroupId` is dangling (`SpawnPoint.SpawnGroupMissing`), this creates a fresh spawngroup instead of updating a nonexistent one, and repoints **every** sink spawn2 row in the zone/version still carrying that same dangling id — not just the one the caller identified — since `SyncSpawnPoints` copies the identical raw source id to every location sharing a spawngroup, so one "sync spawngroup" click resolves the whole group, not one location at a time. Blocked outright (not just warned) if the sink's spawngroupID is referenced by any spawn2 row outside the caller's zone/version, same as before this create-path existed.
- `RelocateSpawnGroup(options RelocateSpawnGroupOptions) (RelocateSpawnGroupResult, error)` — resolves a `SpawnGroupCollisionRisk` (see `SpawnDiffRow`). Copies the current occupant ("the squatter") of `options.SpawnGroupId` to a freshly-assigned id via `insertSpawnGroupWithNameFallback` (see its own comment — **real, shipped bug fixed 2026-07-24**: both this and the id-reclaim insert below originally called `insertRow` directly with no name-collision handling, so a squatter or source name that happened to independently collide with some other unrelated sink spawngroup made relocate fail outright on exactly the case it exists to handle — common in practice, not an edge case, since two independently-evolved databases routinely generate the same auto-named groups), repoints spawn2 rows outside an *excluded set* onto the new id, deletes the now-vacated old row/entries, then recreates the id with `options.SourceFields`/`SourceSpawnEntries` via `insertSpawnGroupWithNameFallback` again, with an **explicit `id` override** — MySQL accepts a specific value on an `AUTO_INCREMENT` column as long as it's free. `fetchSpawnGroupById` fetches the squatter's own fields first (fails loudly if the id doesn't actually exist — nothing to relocate). **Real, shipped bug, also fixed 2026-07-24** (found via user report: "it creates a spawngroup, but the spawngroupID collision still remains because the source has different content"): the repoint step's exclusion set was originally just `ZoneShortName`/`ZoneVersion` — the caller's single zone. But a spawngroup has no zone column of its own, so it's entirely legitimate for one source spawngroup to be referenced by spawn2 rows in *multiple* zones; if it is, the old single-zone exclusion meant every OTHER zone sharing that same source spawngroup got silently repointed to the squatter's unrelated content during the repoint step, leaving that other zone pointed at content that didn't match source — which reads, from the outside, as "the collision was never actually fixed," even though the id the caller relocated was itself populated correctly. Fixed by querying `a.sourceDB` for every `(zone, version)` that also references `SpawnGroupId` there (`SELECT DISTINCT zone, version FROM spawn2 WHERE spawngroupID = ?`) and folding those into the exclusion set alongside the caller's own zone; the repoint `UPDATE`'s `WHERE` clause is now a dynamically-built `NOT ((zone=? AND version=?) OR ...)` covering the whole set instead of a single hardcoded pair. `SquatterUsage`/`SharedSourceUsage`/`ThisZoneCount` (every other zone/version currently referencing the id, split three ways: real squatter usage that gets repointed, other zones sharing the id in source that get left alone, and the caller's own zone) are always computed, dry run or not, for the confirm modal's "here's what this actually touches, and what it doesn't" preview — unlike `SyncSpawnGroup`'s `OtherZoneUsage`, this never blocks; the whole point of relocating is to safely touch it once the user's seen the list
- `insertSpawnGroupWithNameFallback(ctx, tx, fields, sinkColumns, overrides, disambiguatorId) (int64, error)` (added 2026-07-24) — inserts a spawngroup row, retrying once with a disambiguated name (`"<name>_grp<disambiguatorId>"`) if the verbatim insert collides on `spawngroup.name`'s UNIQUE constraint. Extracted from `SyncSpawnGroup`'s create path (which had this fallback already) so `RelocateSpawnGroup`'s two spawngroup inserts could reuse the identical, already-correct handling instead of each needing their own copy — see the bug this fixed in `RelocateSpawnGroup`'s own entry above
- `RelocateSpawnGroups(options BatchRelocateSpawnGroupsOptions) (BatchRelocateSpawnGroupsResult, error)` (`spawngroup.go`, added 2026-07-24) — batch counterpart to `RelocateSpawnGroup`, direct response to a reported workflow: a zone with hundreds of "new" spawn2 rows can have every one of them flagged `SpawnGroupCollisionRisk`, but since a spawngroup is usually a pool shared across many locations, those hundreds of rows typically collapse to a much smaller set of *distinct* `SpawnGroupId`s — reviewing/confirming each colliding row one at a time doesn't scale, but reviewing each distinct id still does. Fetches source's current fields/entries for every requested id fresh, batched into 2 queries via `fetchSpawnGroupContentByIds` (reused from `annotateSpawnGroupCollisionRisk`'s sink-side content check — it's DB-agnostic, called against `a.sourceDB` here instead) rather than trusting client-supplied field data for a write, then calls the existing `RelocateSpawnGroup` once per id — reused directly, not duplicated. Each id gets its own independent transaction (`RelocateSpawnGroup` opens/commits its own per call) rather than one shared transaction wrapping the whole batch, deliberately unlike `Sync()`'s single all-or-nothing transaction across an NPC selection: a batch of colliding spawngroups is N genuinely independent fixes, not one coherent atomic action, so an unexpected failure on one id shouldn't roll back others already correctly relocated ahead of it. `RelocateSpawnGroupOutcome` pairs each requested id with its own result or error, so a batch of 50 where one id fails still reports the other 49 as succeeded
- `DeleteSpawnGroup(options DeleteSpawnGroupOptions) (DeleteSpawnGroupResult, error)` (`spawngroup.go`, added 2026-07-24) — deletes a "removed" spawngroup (and its `spawnentry` rows) from the sink. Fetches usage the same way `SyncSpawnGroup`/`RelocateSpawnGroup` already do (`SELECT zone, version, COUNT(*) FROM spawn2 WHERE spawngroupID = ? GROUP BY zone, version`) but keeps *every* row into `Usage`, no exclusion for the caller's own zone — blocks the delete outright if `Usage` is non-empty, dry run or not, same "check before touching a shared row" discipline those two functions already established, just with a stricter "any usage at all" bar since this removes the row entirely rather than fixing its content in place
- `spawnCoordKey(p SpawnPoint) [3]float64` — the one shared coordinate-matching key, used by `CompareSpawns`, `SyncSpawnPoints`, `CompareSpawnGroups`, and `SyncSpawnGroup` (previously three separate local closures doing the same thing — extracted after the `toFloat64` float32 bug made clear how much was riding on this one calculation being consistent everywhere it's used)
- `withoutField(m, field)` — returns a shallow copy of a dynamic field map with one key removed, added 2026-07-19 specifically to exclude `"name"` from spawngroup field comparisons/updates without touching `mapsEqual()` itself (which other tables, like `npc_types`, legitimately need `"name"` included in)
- `CompareSpawnGroups(shortName string, version int8) ([]SpawnGroupDiffRow, error)` — App method backing the Spawngroups tab (added 2026-07-19). Reuses `getSpawnPointsForZone`'s existing zone-scoped fetch (this view is just a different grouping of the same spawn2/spawngroup/spawnentry data `CompareSpawns` already pulls, not a second dedicated query) — groups each side's points by `SpawnGroupId`, then for each source spawngroup checks which sink spawngroup(s) its member coordinates resolve to: zero matches is `"new"`, exactly one is `"modified"`/`"match"` (with `FieldsDiffer`/`SpawnEntriesDiffer` computed the same two-flag way as `CompareSpawns`), and more than one is `"ambiguous"` (flagged, not guessed — see EQEmu Schema Notes). Sink spawngroups no source group ever resolved to become `"removed"` rows. Each side's fetch→resolve-orphans pipeline runs concurrently via `runParallel`, added 2026-07-25
- `updateSpawnGroupFields(ctx, tx, sinkGroupId, sourceFields, sinkColumns) error` — updates a spawngroup's own row on the sink to match source, excluding `"name"` (cosmetic/local, see EQEmu Schema Notes) the same way `updateSpawn2()` excludes `pathgrid`/`id`/`spawngroupID`. Mirrors `updateSpawn2()`'s shape (sorted columns so `?` placeholders can't get mismatched by Go's randomized map iteration order)
- `SyncSpawnGroup(options SyncSpawnGroupOptions) (SpawnGroupSyncResult, error)` — dry-run/execute that brings a spawngroup fully in line with source: both its own fields (`spawn_limit`, wander box, timing, etc.) and its full `spawnentry` roster, together in one transaction. **Generalized 2026-07-19 from an originally entries-only `SyncSpawnGroupEntries`** — syncing a spawngroup's fields without its entries (or vice versa) doesn't correspond to anything a user actually wants, so this replaced the narrower method rather than existing alongside it. Identified via a spawn2 location's coordinates rather than a `spawngroupID` directly (same reasoning as everywhere else spawn2/spawngroup identity is coordinate-based). Before writing anything, queries the sink for every distinct `(zone, version)` a spawn2 row references that `spawngroupID` under — if that set includes anything besides the zone/version being worked on, the whole operation is blocked (`OtherZoneUsage` populated, nothing written), dry run or not. `npcID` values need no translation (portable identity, see EQEmu Schema Notes), so entries are a plain delete-then-reinsert once cleared. Deliberately its own method, not folded into `SyncSpawnPoints` — see Sync Design below. Triggered from two places in the frontend: the Spawn Points detail panel's per-row action, and the Spawngroups tab's own row action — both funnel into the same shared confirm modal
- `getGridsForZone(ctx, db, zoneIdNumber int64) ([]GridPoint, error)` — zone-scoped `grid` fetch plus its `grid_entries` waypoints, batched into exactly 2 queries regardless of zone size (`grid` by `zoneid`, then `grid_entries` by the same `zoneid`, grouped into each `GridPoint.Entries` in memory) — mirrors `getSpawnPointsForZone`'s batching shape. `zoneIdNumber` is `zone.zoneidnumber` (a plain int), not `zone.short_name` — `grid`/`grid_entries` don't use the short_name string spawn2 does
- `gridEntriesEqual(a, b []GridEntry) bool` — compares two grids' waypoint lists by `Number`, order-independent, mirroring `spawnEntriesEqual`'s shape but keyed by waypoint position instead of NPC ID
- `CompareGrids(zoneIdNumber int64) ([]GridDiffRow, error)` — App method backing the Grids tab; matches source/sink `GridPoint`s by `Id` (not coordinate — a grid is a path, not a point), computes `FieldsDiffer`/`EntriesDiffer` independently before deriving `Status`, same two-flag shape as `SpawnDiffRow`. Source/sink fetch runs concurrently via `runParallel`, added 2026-07-25
- `insertGridEntry`/`createGrid`/`updateGrid` — shared grid-writing helpers, mirroring the create/update split `SyncSpawnPoints`'s two row paths use, but simpler: `createGrid` reuses source's own `grid.id` directly (safe here — see `GridPoint`), and `updateGrid` replaces both a grid's own fields *and* its full waypoint list (delete-then-reinsert `grid_entries`) in one call, since unlike spawn2/spawngroup there's no shared-data risk splitting fields from entries
- `SyncGrids(options SyncGridsOptions) (SyncGridsResult, error)` — dry-run/execute for the Grids tab, own transaction. Simpler than `SyncSpawnPoints`/`SyncSpawnGroupEntries`: no coordinate-conflict or shared-pool checks needed, since `grid.id` is zone-scoped (not a global auto-increment) and a grid isn't reused across unrelated things the way a spawngroup is
- `fetchRowById(ctx, q queryer, table string, id int64) (map[string]interface{}, error)` (`dbutil.go`, added 2026-07-23) — generic "fetch one row's own fields by primary key" helper, the shape `fetchSpawnGroupById`/`fetchLootTableHeader`/`fetchNPCFactionHeader` each independently duplicated; those weren't refactored to use it (out of scope, low risk either way), but new code should prefer this over another one-off copy. `queryer` is a small local interface (`QueryContext`) satisfied by both `*sql.DB` and `*sql.Tx`, so the same helper works for a pre-transaction dry-run read and a read mid-transaction — `getSinkColumns` was widened to accept `queryer` too, for the same reason (`idalign.go`'s `copyChildRows` needs it mid-transaction)
- `fetchChildRows(ctx, q queryer, childTable, parentCol string, parentId int64) ([]map[string]interface{}, error)` (`dbutil.go`, added 2026-07-23) — fetches every row of `childTable` referencing `parentId`, as dynamic field maps; used by `idalign.go` to copy a squatter's own child-entries rows to its new id during a relocate
- `AlignId(options AlignIdOptions) (AlignIdResult, error)` (`idalign.go`, added 2026-07-23) — the generic "ID alignment" primitive: renumbers `options.SinkId` to `options.SourceId` in `idAlignmentTargets[options.Target]`'s table, preserving the sink row's own field content untouched (a rename, not a content overwrite — see Sync Design for why this differs from `RelocateSpawnGroup`). Rejects `SourceId == SinkId` (nothing to do) and a missing `SinkId` row (nothing to rename) up front. If `SourceId` already exists as a different row (a squatter), `relocateRow` moves it to a fresh id first (copies its own fields via `insertRow`, its child rows via `copyChildRows`, repoints `externalRefs` off the vacated id, deletes the old row+children) — then the target row is renamed onto the now-free `SourceId` with a plain `UPDATE ... SET id = ?`, and `repointReferences` moves every row that referenced the old `SinkId` (across `childTable` and every `externalRef`) onto the new id. `countReferences` computes `ReferencesRepointed` for the dry-run preview before anything is written. Known accepted edge case, not solved: if some `loottable` already references both the old and new lootdrop ids as separate `loottable_entries` rows, the final repoint step collides with `loottable_entries`' composite primary key and fails loudly with a wrapped SQL error, rather than silently merging — rare enough (a loottable listing the same drop twice under different ids) not to special-case
- `SyncReferenceContent(options SyncReferenceContentOptions) (SyncReferenceContentResult, error)` (`referencecontent.go`, added 2026-07-25 — phase 2) — the generic "reference content sync" primitive: overwrites `options.SinkId`'s fields+entries in `referenceContentTargets[options.Target]`'s table(s) to match `options.SourceId`'s content, `SinkId` itself never renumbered (the complement to `AlignId`, which renames and never touches content). `UsageCount` (`SELECT COUNT(*) FROM npc_types WHERE <npcFKColumn> = ?` against sink) is always computed, dry run or not, as a warning shown to the user — never blocks the write, same "flag, don't block" philosophy as `SpawnGroupCollisionRisk`/`OtherZoneUsage`. If `headerTable != ""`, the sink header row is `UPDATE`d in place via the new `updateRowById` if it already exists, or `INSERT`ed with an explicit `id` override (mirroring `RelocateSpawnGroup`'s reclaim step) if it doesn't — a dangling `MissingReferences` sink id becomes real content instead of staying dangling. Child rows (`childTable`) are always a plain delete-then-reinsert at `SinkId`, stripping only `"id"` (if present) and `childParentCol` before reinsert via `insertRow` — the exact same stripping `idalign.go`'s `copyChildRows` already uses, so every portable content column (`faction_id`/`spellid`/`item`/`lootdrop_id`/value columns) travels through untouched. Never touches `npc_types` itself, so unlike `AlignId` there's no NPCs-tab cache-invalidation concern on the frontend side. `loottable`'s entries carry `lootdrop_id` verbatim from source — since `lootdrop.id` is a local surrogate, this only produces useful content once the referenced lootdrop ids already match between source and sink (via `AlignId`/`CreateLootDrop`); not enforced in Go, the frontend confirm modal states it plainly instead
- `updateRowById(ctx, tx, table string, id int64, fields map[string]interface{}, sinkColumns map[string]bool) error` (`referencecontent.go`, added 2026-07-25) — generic sorted-columns `UPDATE ... WHERE id = ?`, mirroring `updateSpawnGroupFields`'/`updateSpawn2`'s shape but with no column exclusions (unlike those two, which each exclude one column — `name`/`pathgrid` — for their own domain reasons this call site has no equivalent for)
- `GetZoneMap(mapsDirectory, zoneShortName string) (ZoneMap, error)` (`zonemap.go`, added 2026-07-24) — reads `<mapsDirectory>/<zoneShortName>.txt` (Brewall's Maps' own naming, base file only — not the `_1`/`_2` detail-overlay variants) and parses its `L x1,y1,z1,x2,y2,z2,r,g,b` line segments. `mapsDirectory` is a plain parameter, not App state — this isn't a "connection" needing lifecycle management the way `sourceDB`/`sinkDB` are. A missing file returns `ZoneMap{}` with a **nil** error (most zones plausibly have no Brewall coverage, or a short_name mismatch — see EQEmu Schema Notes precedent for treating absence as a fact to show, not a failure), and non-"L" lines (comments, `P` point/label lines) are silently skipped rather than erroring the whole file. No DB access at all — purely a file parse
- `PickMapsDirectory() (string, error)` (`ssh.go`) — same native-dialog, cancel-returns-empty-string contract as `PickPrivateKeyFile`, just `wailsruntime.OpenDirectoryDialog` instead of `OpenFileDialog`
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
- `upsertNPC()` builds a dynamic `INSERT ... ON DUPLICATE KEY UPDATE`, sorting the column name slice first so the `?` placeholders and their values (indexed off that same sorted slice) can't get mismatched — map iteration order in Go is randomized. `excludedColumns` (added 2026-07-24, from `SyncOptions.ExcludedFields`) omits a column from the `ON DUPLICATE KEY UPDATE` clause only — it's deliberately still included in the `INSERT` column/value list, so a brand-new NPC still gets an accurate starting value from source. This is the actual semantics of "excluded from sync" in this app: protect whatever's already tuned on an *existing* sink row, not "this column may never have a value." A defensive `id=id` no-op clause is appended if every non-id column happened to be excluded, so `ON DUPLICATE KEY UPDATE` never ends up with an empty (invalid) clause list
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
const [mapsDirectory, setMapsDirectory] = useState('')  // Brewall's Maps folder, added 2026-07-24 — see zonemap.go/useZoneMap.js. Not gated behind Connect; saves immediately on pick (Sidebar.jsx's "Browse…")
const [excludedNpcFields, setExcludedNpcFields] = useState([])  // npc_types columns Sync never overwrites on an existing sink row, added 2026-07-24 — see Config.ExcludedNPCFields. Same immediate-persist shape as mapsDirectory; configured via the NPCs tab's ExcludedFieldsDrawer or inline per-field toggles in NpcDetailPanel, both writing through this one setter

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
// Same shape as showSpawnHelp, one per tab whose "?" trigger opens a help drawer — see
// HelpDrawer.jsx (shared chrome) and the "Inline help drawers extended" Sync Design bullet for
// why each landed where it did (NpcHelpDrawer/SpawngroupHelpDrawer trigger from DetailPanel.jsx's
// header like Spawn's; GridMapHelpDrawer triggers from GridsTab.jsx next to the List/Map toggle;
// LootHelpDrawer triggers from LootTab.jsx's own toolbar, since Loot has no detail panel).
const [showNpcHelp, setShowNpcHelp] = useState(false)
const [showSpawngroupHelp, setShowSpawngroupHelp] = useState(false)
const [showGridMapHelp, setShowGridMapHelp] = useState(false)
const [showLootHelp, setShowLootHelp] = useState(false)
const [showExcludedFieldsDrawer, setShowExcludedFieldsDrawer] = useState(false)  // added 2026-07-24 — ExcludedFieldsDrawer.jsx, triggered from the NPCs tab's own "Excluded fields" button (not DetailPanel's header — this is a settings panel, not per-tab reference content, see that component's own doc comment)

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

// Batch RelocateSpawnGroups confirm modal state (useBatchRelocateSpawnGroups.js, added 2026-07-24)
// — "relocate every colliding spawngroup at once" counterpart to the single-item flow above,
// triggered from a "Relocate N colliding spawngroups" button in the persistent zone header (shown
// only when lib/spawnHelpers.js's collidingSpawnGroupIds() finds at least one). Mirrors the
// single-item hook's shape (fixed onRelocated at hook-creation time), but batchRelocateIds is just
// a list of ids — unlike relocateTarget, no sourceFields/sourceEntries are captured from a row,
// since the Go side (RelocateSpawnGroups) fetches each id's source content itself.
const [showBatchRelocateConfirm, setShowBatchRelocateConfirm] = useState(false)
const [batchRelocatePreview, setBatchRelocatePreview] = useState(null)  // dry-run BatchRelocateSpawnGroupsResult, null while loading
const [batchRelocateError, setBatchRelocateError] = useState(null)
const [batchRelocating, setBatchRelocating] = useState(false)
const [batchRelocateOutcome, setBatchRelocateOutcome] = useState(null)  // post-execute BatchRelocateSpawnGroupsResult
const [batchRelocateIds, setBatchRelocateIds] = useState([])

// DeleteSpawnGroup confirm modal state (useDeleteSpawnGroup.js, added 2026-07-24) — deletes a
// "removed" spawngroup (no source counterpart), triggered only from the Spawngroups tab's own
// detail panel. Mirrors useRelocateSpawnGroup.js's shape exactly, including the fixed
// hook-creation-time onDeleted callback (only one refresh target — the Spawngroups tab's own
// diff list) — deleteSpawnGroupId alone is enough to identify the target, no extra content needed
// the way relocateTarget needs sourceFields/sourceEntries.
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
const [deletePreview, setDeletePreview] = useState(null)  // dry-run DeleteSpawnGroupResult, null while loading
const [deleteError, setDeleteError] = useState(null)
const [deleting, setDeleting] = useState(false)
const [deleteSpawnGroupId, setDeleteSpawnGroupId] = useState(null)
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
// viewMode ('list' | 'map') — GridsTab's List/Map toggle. Started as local useState inside
// GridsTab.jsx, lifted here 2026-07-24 so App.jsx's jumpToGrid (the Spawn Points detail panel's
// pathgrid "view on map" navigation) can switch straight to Map view from outside the tab.
const [viewMode, setViewMode] = useState('list')
// selectedWaypointNumber (added 2026-07-24) — cross-highlight between ZoneMapView's waypoint
// markers and GridDetailPanel's own waypoint table (click either, the other highlights + the
// table scrolls the row into view). Lives here, not as local state in either component, because
// both need to read AND write it. Cleared by an internal useEffect keyed on the selected grid's
// id whenever the grid selection itself changes — a waypoint number from the previous grid's
// roster shouldn't stay "selected" against a different one.
const [selectedWaypointNumber, setSelectedWaypointNumber] = useState(null)
const [showGridSyncPreview, setShowGridSyncPreview] = useState(false)
const [gridSyncPreview, setGridSyncPreview] = useState(null)
const [gridSyncing, setGridSyncing] = useState(false)
const [gridSyncOutcome, setGridSyncOutcome] = useState(null)
const [showGridSyncConfirm, setShowGridSyncConfirm] = useState(false)

// Zone map (useZoneMap.js, added 2026-07-24) — the Brewall's Maps background for the Grids
// tab's Map view. Much simpler than the other domain hooks: a zone's map is static, nothing to
// diff or sync, just fetch-and-cache. Loaded on every zone switch (selectZone's fan-out), not
// only when Map view is opened, so GridsTab's List/Map toggle is instant either direction.
const [zoneMap, setZoneMap] = useState(null)
const [zoneMapLoading, setZoneMapLoading] = useState(false)

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

// CreateLootDrop confirm flow (useCreateLootDrop.js, added 2026-07-24) — triggered from the Loot
// tab's per-lootdrop "create in sink" link, source column only (see LootTab.jsx). Single id, no
// pairing state to track the way align's armedSourceDrop/armedSinkDrop needs — there's no sink row
// to pick, so this is a simpler shape than useAlignId despite mirroring its open-preview/execute flow.
const [showCreateConfirm, setShowCreateConfirm] = useState(false)
const [createPreview, setCreatePreview] = useState(null)  // dry-run CreateLootDropResult, null while loading
const [createError, setCreateError] = useState(null)
const [creating, setCreating] = useState(false)
const [createSourceId, setCreateSourceId] = useState(null)

// SyncReferenceContent confirm flow (useSyncReferenceContent.js, added 2026-07-25 — phase 2) —
// triggered from the Loot tab's loottable-level "Sync content from source" button and the
// npc_faction/npc_spells/merchant reference drawers' own equivalent buttons. Same shape as
// useAlignId.js's state (this is its content-overwrite complement), including the call-time
// (not hook-creation-time) onSuccess callback executeSyncContent takes — App.jsx's
// refreshAfterSyncContent dispatches by syncContentTarget.target the same way refreshAfterAlign
// does for alignTarget.target.
const [showSyncContentConfirm, setShowSyncContentConfirm] = useState(false)
const [syncContentPreview, setSyncContentPreview] = useState(null)  // dry-run SyncReferenceContentResult, null while loading
const [syncContentError, setSyncContentError] = useState(null)
const [syncingContent, setSyncingContent] = useState(false)
const [syncContentTarget, setSyncContentTarget] = useState(null)  // {target, sourceId, sinkId, label}

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
- **Shared reference table sync, phase 2 — writing** `loottable`, `npc_faction`, `npc_spells`, `merchantlist` content, added 2026-07-25.** Direct follow-up to "let's start planning phase 2," scoped via two decisions confirmed up front: **trigger** is standalone, from the existing comparison drawers/Loot tab, independent of any NPC selection — not folded into the NPC sync flow, since a shared reference row isn't "this NPC's" content, it's whatever NPC happened to lead you there; and **safety gate** is a usage-count warning (how many other NPCs on the sink reference this same id), never a block — the same "flag, don't block" philosophy `SpawnGroupCollisionRisk`/`OtherZoneUsage` already established, chosen over blocking outright because this app's standing pattern trusts the user to review the count rather than refusing the action for them. `SyncReferenceContent` (`referencecontent.go`, see Key Functions) is the generic primitive — the deliberate complement to `AlignId`: that one renames an id and never touches content, this one leaves the id alone and overwrites content. `SinkId` is never renumbered here, which is also why (unlike `AlignId`) there's no NPCs-tab cache-invalidation concern — nothing in `npc_types` changes.
  - `loottable` is scoped narrowly on purpose: syncing it overwrites the loottable's own fields and its `loottable_entries` (which `lootdrop_id`s it lists, and each one's multiplier/probability/droplimit), but never touches `lootdrop` content itself — that already has its own dedicated tools (`AlignId`, `CreateLootDrop`), and duplicating that here would just be a second, less careful path to the same write. Since `loottable_entries` copies `lootdrop_id` verbatim from source and `lootdrop.id` is a local surrogate, this only produces useful content once the referenced lootdrop ids already match between source and sink — surfaced as a plain caveat in the confirm modal (`ConfirmSyncReferenceContentModal.jsx`, shown only for the `loottable` target), not enforced in Go, same restraint as everywhere else this app tells rather than blocks.
  - Frontend: one generic hook + modal (`useSyncReferenceContent.js` + `ConfirmSyncReferenceContentModal.jsx`), reused across all four targets and all four trigger points — mirrors `useAlignId.js`/`ConfirmAlignIdModal.jsx`'s exact shape, including the call-time (not hook-creation-time) `onSuccess` callback. A "Sync content from source →" button was added to `FactionComparison.jsx`/`SpellsComparison.jsx` (next to the existing align button), `MerchantComparison.jsx` (new — that component never had an align button, since merchantlist was never an `AlignId` target), and `LootTab.jsx` (loottable level only). Refresh-after-success is simpler than align's: since `SourceId`/`SinkId` never change, Loot reuses `loot.refreshLoot()` as-is, and the reference drawers replay `openReferenceComparison(type, sourceId, sinkId)` with the *original* (unchanged) ids — not `(sourceId, sourceId)` the way `refreshReferenceAfterAlign` does, since nothing was renamed here. `App.jsx`'s `refreshAfterSyncContent` is the single dispatch point, mirroring `refreshAfterAlign`'s shape.
  - `go build`/`vet`/`test -race` and `vite build` clean; `wails generate module` run for `SyncReferenceContent`/`SyncReferenceContentOptions`/`SyncReferenceContentResult`. Not yet manually smoke-tested in `wails dev`.
- **ID alignment, added 2026-07-23 — a third category, distinct from both phases above, though it touches the same tables.** Direct response to the user's actual manual workflow: comparing loot tables almost always shows the same real content living under different `lootdrop.id`/`loottable.id` numbers (local surrogates, no cross-database meaning — same trust category as `spawngroup.id`), fixed by hand with `UPDATE lootdrop SET id = X WHERE id = y` and matching updates to every table referencing it. The one danger named: if `X` is already occupied by unrelated sink content, the rename collides — exactly the `SpawnGroupCollisionRisk`/`RelocateSpawnGroup` problem, generalized. **This is a rename, not a content overwrite** — the key distinction from both phase 1 (never writes) and phase 2 (would overwrite a shared row's *content* with source's). `AlignId` (`idalign.go`) renumbers the sink's *existing* row to source's id, preserving that row's own current field content untouched; only a pre-existing squatter at the target id gets its content relocated. Covers `lootdrop`/`loottable`/`npc_faction`/`npc_spells` (confirmed with the user: "I'm doing this across all tables... build the general primitive covering all four") — deliberately NOT `spawngroup`, which keeps its own `RelocateSpawnGroup` with its zone-scoped carve-out (see `idAlignmentTarget`'s own comment in Key Types for why the four new targets get unconditional repoint instead: none of them have spawn2/spawngroup's zone-scoped "same recent sync batch" signal, and by construction any existing reference to a colliding id is already showing the squatter's real content — repointing it to follow the squatter preserves exactly what it shows today, so there's no case where leaving it un-repointed is safer). Frontend wiring: `LootTab.jsx`'s loottable-level button (ids already known via the NPC anchor, no pairing needed) and lootdrop-level two-step cross-column click (since `lootdrop.id` has no cross-database anchor the way spawngroup has spawn2 coordinates) shipped first; `npc_faction`/`npc_spells` triggers in `FactionComparison.jsx`/`SpellsComparison.jsx` followed shortly after (2026-07-24), reusing the same `useAlignId.js`/`ConfirmAlignIdModal.jsx` — a single button next to the header's own id row in each, same shape as the loottable-level trigger, since neither has an equivalent "which entry pairs with which" ambiguity: their `Entries` are keyed by the *portable* `faction_id`/`spellid`, not a local surrogate, so only the header's own `npc_faction_id`/`npc_spells_id` ever needs realigning. `useLoot.js`'s `refreshWithIds` (and the reference drawer's equivalent, `App.jsx`'s `refreshReferenceAfterAlign`) exist specifically because a header-level align changes `npc_types.loottable_id`/`npc_faction_id`/`npc_spells_id` in the database in a way the NPCs tab's cached `diffRows` won't reflect — replaying the stale NPC row after align would look up an id that no longer exists, so the refresh uses the known-correct post-align ids directly instead. The reference-drawer case is simpler than loot's: `openReferenceComparison` already takes raw ids directly (no NPC-row indirection to route around), so refreshing is just calling it again with `SourceId` on both sides, no new hook function needed. `App.jsx`'s `refreshAfterAlign` is the single dispatch point `ConfirmAlignIdModal`'s `executeAlign` calls into, picking `refreshLootAfterAlign` vs `refreshReferenceAfterAlign` by `alignId.alignTarget.target`.
- **Lootdrop creation, added 2026-07-24 — the create counterpart to ID alignment, for the case it explicitly refuses.** "For lootdrop and lootdrop_entries, I'd like a way to select a lootdrop in the list and basically insert the lootdrop and its entries into the sink... This will save me a lot of time manually building out that lootdrop in the existing editor." `AlignId` only ever renames an *existing* sink row (`SinkId == 0` is rejected outright — "nothing to rename"), which is correct for its own job but left exactly the case this request is about unaddressed: a lootdrop that doesn't exist on the sink under any id yet. `CreateLootDrop` (`loot.go`) fills that gap as its own primitive rather than an `AlignId` mode, because the core guarantee is inverted: `AlignId` is a rename that deliberately never touches content ("preserving the sink row's own current field content untouched"), but here there's no existing sink content to preserve — the entire point is to write source's own fields and `lootdrop_entries` onto the sink for the first time. Reuses `relocateRow` (`idalign.go`) unchanged for the one piece that genuinely is shared: if source's id happens to already be occupied by unrelated content on the sink (a squatter), it gets relocated out of the way first, exactly the way `AlignId` already handles the same situation — so both actions agree on what "safe to write to this id" means, without a second squatter-eviction implementation to keep in sync. Deliberately scoped to lootdrop only, not generalized into `idAlignmentTargets`-style multi-table config the way `AlignId` eventually was — the user asked specifically for lootdrop/lootdrop_entries, and `AlignId` itself only got generalized after being built for loot first and confirmed wanted more broadly; same incremental approach here, not assumed in advance. Also deliberately does *not* create a `loottable_entries` row wiring the new lootdrop into any loottable — which loottable, and what multiplier/probability/droplimit values, is exactly the kind of correspondence this app has consistently refused to guess (same restraint as never pairing lootdrops across the two tree columns); the confirm modal says as much, so wiring it in is a conscious, separate next step for the user, not silently assumed.
  - Frontend: `useCreateLootDrop.js` + `ConfirmCreateLootDropModal.jsx`, structurally identical to `useAlignId.js`/`ConfirmAlignIdModal.jsx`'s open-preview/execute shape but simpler — no pairing state to track (no sink row to pick, unlike lootdrop alignment's two-step arm), just the one source id. Trigger is a "create in sink" link next to each row's existing "align" link in `LootTab.jsx`'s `LootTableEntryRow`, offered only on the **source** column (`onCreateInSink` passed to `LootTableColumn` for Source, omitted for Sink) — mirrors this app's established "source is the reference dataset" convention rather than allowing sink→source creation, which nothing about this feature's design was asked to support. Refreshing afterward reuses the existing `loot.refreshLoot()` as-is: unlike align, creating a lootdrop never changes `SourceId`/`SinkId` (it never touches `npc_types.loottable_id`), so there's no id-tracking equivalent to `refreshLootAfterAlign` needed.
  - `wails generate module` run for `CreateLootDrop`. `go build`/`vet`/`test` and `vite build` clean.
- **Delete on sync for removed NPCs, added 2026-07-24.** "For NPC sync, update the logic so that when I click on an npc that doesn't exist in source data, it's permitted. Just have the confirmation confirm I mean to delete it (if it doesn't exist in source, and I'm syncing, the implied task is delete it)." A "removed" row (present in sink, not in source) was already checkbox-selectable in the NPCs tab — nothing blocked clicking it — but `Sync()` treated it as a safe no-op, adding it to `Skipped` with reason "not found in source zone data." That made selecting a removed row *feel* unpermitted: you could check it, but syncing did nothing, silently. `Sync()`'s loop now checks `sinkById` too when an id isn't in `sourceById`: if it exists there, that's the "removed" case, and it's genuinely deleted from the sink's `npc_types` (`DELETE FROM npc_types WHERE id = ?`) — not a no-op. An id present in *neither* database (a stale/invalid id, not a real delete target) still falls back to the original skip behavior, now with a clarified reason ("not found in source or sink zone data") so it doesn't read as a near-miss for the delete case. Every selected id still ends up in exactly one bucket, just three now instead of two: `NPCsSynced`, `Deleted`, or `Skipped`.
  - **Deliberately does not cascade the delete** into `spawnentry` rows still referencing the deleted `npcID` on the sink — those become `Orphaned` the same way any other dangling spawnentry reference already does (see `SpawnEntry.Orphaned`/`resolveOrphanedSpawnEntryNames`), rather than `Sync()` reaching into a different domain's tables to auto-clean up. Consistent with this app's standing rule: flag a dangling reference, never silently resolve it — the existing Orphaned-name recovery already gives a concrete answer to "what did this spawn entry used to point to" without Sync() needing to know anything about spawn2/spawngroup at all.
  - Made visible at every stage a destructive action should be, not just the final confirm: the diff-list checkbox gets an explanatory `title` on hover for removed rows ("Not in source — selecting and syncing this will delete it from sink"); the dry-run preview's per-row list gets a distinct red 🗑 entry ("not in source — will be deleted from sink") instead of blending into the amber "skipped" bucket it used to land in; `ConfirmSyncModal` gets its own explicit red ⚠ line naming the count before the existing generic "This cannot be undone"; and the post-execute outcome screen lists exactly what got deleted, by name, the same structured-not-prose treatment `Skipped` already got.
  - `go build`/`vet`/`test` and `vite build` clean; `wails generate module` run for the new `SyncResult.Deleted`/`DeletedNPC` fields.
  - **Two-step arming discoverability fix, added 2026-07-24, found via user report ("it does this toggle to 'arm' but no clue where to go from there").** The confirm banner (`armedSourceDrop && armedSinkDrop`) only ever appeared once *both* sides were armed — arming just the first side (the natural first click) produced no feedback at all about there being a second step, let alone which column to click in. Fixed by adding an intermediate hint banner, shown whenever exactly one side is armed, naming which lootdrop got armed and which column (Source or Sink) to click the matching row in next, plus a Cancel to back out. The existing two-armed confirm banner is unchanged; this only fills the previously-silent gap between "armed one side" and "both armed, ready to confirm."
- **Delete on sync for removed Spawn Points and Spawngroups, added 2026-07-24.** Direct follow-up: "NPC, Grids, and Loot synch'ing is working pretty well. What's not working well currently is Spawn Points and Spawngroups synching. Let's plan a way forward for this" — narrowed via follow-up questions to the same missing capability the NPC delete-on-sync pass just fixed, extended to spawn2 and spawngroup. Planned in Plan Mode first since the two cases aren't symmetric and one of them (spawngroup) needed real safety design, not just a copy of the NPC pattern.
  - **spawn2 ("Spawn Points" tab) mirrors the NPC fix almost exactly** — nothing else references `spawn2.id`, so there's no cascade/orphan risk to design around. `spawnRowSelectable` (`lib/spawnHelpers.js`) now returns `true` for `"removed"` rows (previously hard-blocked, with the checkbox's own `title` explicitly saying so — that message is what actually needed rewriting first). `SyncSpawnPoints` gained a third loop over the existing Created/Updated ones: `DeleteSpawnIds` (sink spawn2.id) → plain `DELETE FROM spawn2 WHERE id = ?`, counted into `SpawnSyncResult.Deleted`. Unlike NPC Sync()'s `Deleted []DeletedNPC`, this is a plain `int` — the frontend already has every "removed" row's own data in its already-loaded `spawnDiffRows`, so there's nothing a structured list would add that a count doesn't already cover. Same visibility treatment as NPCs got: per-row red 🗑 in the dry-run preview, explicit red warning in `ConfirmSpawnSyncModal`, a red count line in the post-execute outcome.
  - **spawngroup ("Spawngroups" tab) deliberately does NOT mirror the NPC fix** — a "removed" spawngroup row only means *no source spawngroup resolves to it*, which says nothing about whether real spawn2 content on the sink still depends on it. Blind-deleting one could orphan live spawn2 rows into `SpawnGroupMissing`, exactly the failure mode `SyncSpawnGroup`'s `OtherZoneUsage` block and `RelocateSpawnGroup`'s squatter-eviction already exist to prevent for the same table. `DeleteSpawnGroup` (`spawngroup.go`) reuses that same "check usage before touching a shared row" query shape, but stricter: `Usage` keeps *every* `(zone, version)` referencing the id, including the caller's own — unlike `RelocateSpawnGroup`'s `SquatterUsage`/`ThisZoneCount` split (which deliberately leaves the caller's own zone's spawn2 rows alone, since that operation fixes the id's *content* in place), here the whole row is going away, so even the caller's own zone's references would dangle. Any usage at all blocks the delete outright, dry run or not — only a genuinely unreferenced spawngroup is safe to remove, and when it is, its `spawnentry` rows are deleted alongside it in the same transaction (owned content, not a separate reference to flag).
  - **No batch selection added for spawngroups, on purpose** — the Spawngroups tab already had none (spawngroup actions are single-row, detail-panel-triggered, per its own existing design note), so `DeleteSpawnGroup`'s trigger follows that same shape: a "Delete spawngroup from sink →" link in `SpawnGroupDetailPanel.jsx`, shown only for `Status === "removed"`, right below the existing red "Exists on the sink only…" message — same placement pattern the amber "Sync spawngroup from source →" trigger already uses for `modified` rows. New `useDeleteSpawnGroup.js` mirrors `useRelocateSpawnGroup.js`'s shape exactly, including the fixed hook-creation-time `onDeleted` callback (only one refresh target, the Spawngroups tab's own diff list — same reasoning `useRelocateSpawnGroup` already documents for its own `onRelocated`). New `ConfirmDeleteSpawnGroupModal.jsx` mirrors `ConfirmSpawnGroupSyncModal`'s blocked-vs-normal branching shape, listing the actual usage (zone/version/count) when blocked rather than just saying no.
  - `go build`/`vet`/`test` and `vite build` clean; `wails generate module` run for `SpawnSyncResult.Deleted` and the new `DeleteSpawnGroup` method/types.
- **RelocateSpawnGroup name-collision bug, fixed 2026-07-24, found via user report ("it usually fails because there is a 'name collision'").** Direct follow-up to the delete-on-sync work above, while exercising the same relocate-and-reclaim flow it's paired with: "for adding new spawngroups that exist in the source but not in the sink, there is usually a spawngroupID collision, so... the need to relocate and reclaim the spawngroup is required... However, it usually fails." Root cause: `SyncSpawnGroup`'s create path already retried with a disambiguated name (`"<name>_grp<id>"`) when a verbatim `spawngroup` insert collided on `spawngroup.name`'s UNIQUE constraint, but `RelocateSpawnGroup`'s own two `spawngroup` inserts — evicting the squatter to a fresh id, then reclaiming the freed id with source's content — never had that fallback, calling `insertRow` directly. Since `spawngroup.name` is a locally auto-generated label, not shared identity (same trap as `spawngroup.id`), two independently-evolved databases routinely generate the same name for unrelated groups — meaning the squatter's own name, or source's, colliding with some *other* unrelated sink spawngroup was common, not a rare edge case, and it made relocate fail outright on precisely the id-collision case it exists to resolve. Fixed by extracting the existing fallback logic into `insertSpawnGroupWithNameFallback` (`spawngroup.go`) and using it at all three call sites — `SyncSpawnGroup`'s create path (refactored, not just left alone) and both of `RelocateSpawnGroup`'s inserts — so there's one tested implementation instead of the original one-correct/two-missing split. `go build`/`vet`/`test` clean; no API/type shape changed, so no `wails generate module` or frontend changes needed.
- **Zone map pan/zoom + waypoint selection, added 2026-07-24 (same day, direct follow-up)** — asked "as a UX expert" to make more of the Map view once it shipped; the map drew the whole zone at one fixed fit-to-container scale, unusable for inspecting a single waypoint in a zone with dozens of grids (Old Guk has 63). Two decisions carry the pass: **auto-focus on the selected grid, not freeform pan/zoom, is the actual value** (selecting a grid frames it automatically; manual pan/zoom is the complement for exploring beyond that) and **waypoint selection cross-links with `GridDetailPanel`'s existing waypoint table** (click a point on the map, its row highlights and scrolls into view; click a row, the point highlights on the map) — the thing that makes this a debugging aid rather than a picture. Implementation is a **second transform layered on top of the existing, already-verified base one**, not a rework of it: `ZoneMapView.jsx` wraps everything the base `transform.sx/sy` already positions in one `<g transform="translate(offsetX,offsetY) scale(scale)">`, so "reset zoom" is plain identity (the base transform already fits the whole zone) and `lib/zoneMapHelpers.js`'s new `fitTransformFor(points, viewSize, padding)` only has to compute a scale/translate for a *sub-region* already in viewBox space, not redo the world→viewBox math. Wheel-zoom is a native (non-passive) `addEventListener('wheel', ..., {passive:false})` in a `useEffect`, not the JSX `onWheel` prop — React attaches that as passive by default, which silently no-ops `e.preventDefault()`. Both wheel-zoom-to-cursor and drag-to-pan convert mouse coordinates via `svg.getScreenCTM()`/`matrixTransform()` rather than hand-rolling the math from `getBoundingClientRect()`, since that's what correctly accounts for the SVG's `viewBox`/`preserveAspectRatio` diverging from its actual rendered CSS size. Drag-to-pan reuses the same window-level mousemove/mouseup pattern already established for the sidebar/detail-panel resize handles in `App.jsx`. `selectedWaypointNumber` (see React Key State) is lifted into `useGridSync.js` rather than living locally in either `ZoneMapView` or `GridDetailPanel`, since both need to read and write it for the bidirectional highlight; it's cleared whenever the selected grid itself changes. Stroke widths and marker radii inside the pan/zoom `<g>` are divided by the current `scale` so they stay a constant on-screen size regardless of zoom, rather than growing/shrinking with it the way SVG strokes do by default under a scaling transform. `go build`/`vet` (no Go changes this pass) and `vite build` clean; not yet manually smoke-tested in `wails dev`.
- **Source-vs-sink waypoint diff visualization, added 2026-07-24 (same day, direct follow-up)** — direct response to "this is a synch and diffing tool... show me the difference between source and sink waypoints, that's important when determining which waypoint to keep." Two gaps closed together, since they're really the same question asked two ways: `GridDetailPanel`'s waypoint table only ever colored a whole row yellow when *anything* about that waypoint differed, with no way to tell which field; and `ZoneMapView` only ever plotted source's waypoints, so there was no way to *see* how far a drifted sink waypoint actually sits from source. New `waypointFieldDiffs(src, sink)` (`lib/gridHelpers.js`) breaks one waypoint into its five fields (x/y/z/heading/pause) with a per-field `differs` flag, `true` only when both sides have the waypoint at all — a whole-side-missing row isn't "this field differs," it's "this waypoint doesn't exist there yet," already conveyed by the row rendering a bare `—`. `GridDetailPanel`'s table now colors each field independently instead of the row as a whole, which is the distinction that actually matters for "which side do I keep": a Z-only drift usually reads as terrain/elevation noise, an X/Y drift as a genuinely different spot. `ZoneMapView` now plots **both** sides for the selected grid — source as filled amber dots (unchanged), sink as hollow teal rings (new) — joined by a dashed red connector when X/Y actually differs (skipped when only Z/heading/pause differ, since the dots would coincide and a connector would be a meaningless dot at a point). Reuses `gridEntryRows()` (already shared with the detail panel) for the source/sink pairing rather than re-deriving it in the map component. Waypoint selection's white ring (from the pan/zoom pass) is drawn as an independent extra shape rather than baked into the marker's fill/stroke color — needed now specifically so a selected marker's source/sink identity color stays legible instead of being overwritten by "selected," which wasn't a concern yet when there was only ever one marker per waypoint. The "fit to selected grid" auto-frame (also from the pan/zoom pass) now includes sink's entries in its bounding box too, not just source's — otherwise a significantly drifted sink waypoint could get silently clipped outside the auto-framed view, defeating the point of showing it at all. A small always-visible legend (top-left, mirroring the zoom controls' bottom-right placement) explains the two marker styles and the drift-line color; the "position differs" line only appears in the legend when at least one waypoint in the selected grid actually has one. `go build`/`vet` (no Go changes) and `vite build` clean.
- **Heading-tick zoom fix, 2026-07-24 (same day, found via user-reported screenshot).** The waypoint diff visualization above surfaced a real bug in the pan/zoom pass, not new — a screenshot of grid #13 in Old Guk (a genuine grid-ID collision, source and sink meaning two entirely different patrol paths that happen to share the number 13, unrelated to this app) showed a "starburst" of long spikes radiating from every waypoint once "fit to selected grid" zoomed in tight on the dense cluster. Root cause: `headingTickEnd`'s tick length (default `15`, in pre-zoom viewBox space) was never divided by `view.scale` the way stroke widths and marker radii already were, so a short direction-indicator line stayed a *fixed* viewBox-space length while zoom stretched it — at ~12x zoom, 15 units becomes 180px on screen. Fixed by passing `15 / view.scale` into `headingTickEnd()` in `renderWaypointMarker`, the same scale-compensation already applied everywhere else in that function.
- **Pathgrid → Grids map navigation, added 2026-07-24 (same day, direct follow-up)** — "can I click on the pathgrid and it take me to that path on the map tab?" `SpawnDetailPanel.jsx`'s Behavior section already showed `pathgrid` per side with a `PathgridMissing`-driven red flag for a dangling reference (see the 2026-07-20 "Missing reference" pass); each side's value is now independently clickable — only when it's a real nonzero value that isn't `PathgridMissing` on that side, since 0 means "no patrol" and a dangling id has nothing to navigate to — and jumps to the Grids tab in Map view with that grid selected, the same "click a reference, land on it" pattern `loottable_id`'s `jumpToLoot` already established. One piece of lifting was needed to make this possible: `GridsTab.jsx`'s List/Map `viewMode` toggle was local `useState`, unreachable from outside the component — moved into `useGridSync.js` alongside `selectedGridRow` so `App.jsx`'s new `jumpToGrid(id)` can drive both together (`setSelectedGridRow` + `setViewMode('map')`) in one call. `jumpToGrid` looks up the target purely from `gridSync.gridDiffRows`, already loaded eagerly on every zone switch same as every other tab's diffs (see `selectZone`'s fan-out) — no new Go call, matching either side's `Id` since `CompareGrids` already pairs source/sink by the same raw id. `go build`/`vet` (no Go changes) and `vite build` clean.
- **Inline "?" help drawers extended to NPCs/Spawngroups/Grids Map/Loot, added 2026-07-24 (same day, direct follow-up)** — direct response to "does it make sense to add relevant inline documentation via that ? button like we did for spawn point detail... look at each tab and determine if relevant inline docs is needed." Audited all six tabs against the bar the Spawn Points tab's existing drawer already set (a one-time-read conceptual explanation of something genuinely non-obvious from the UI alone, not a restatement of what's already visible): **NPCs** (the ⚡ quest-spawned badge, red ⚠ missing-reference flags, and why some References fields open a drawer while `loottable_id` navigates away instead), **Spawngroups** (what "ambiguous" means, and this tab's relationship to Spawn Points), and **Loot** (why the two columns render as independent, unpaired trees, "shared ×N", and why loottable alignment is one button but lootdrop alignment is a two-step pairing click) all cleared that bar. **Grids List** did not — it already has an inline caption bar doing the same job inline in the diff list header. **TODO** did not — dismiss/undismiss is a familiar enough (Gmail-style) pattern not to need explaining. **Grids Map** (see the pathgrid-navigation bullet's own follow-up below) got one too, specifically to carry the grid-ID-collision caveat that has nowhere else to live.
  - `HelpDrawer.jsx` (new) extracts the backdrop/slide-over/focus-trap/header chrome `SpawnHelpDrawer.jsx` had implemented standalone, since five near-identical copies of that same shell was exactly the duplication `useModalFocusTrap` was already extracted earlier in the session to avoid one layer up. `SpawnHelpDrawer.jsx` was refactored to a thin content wrapper around it (same props, same rendered output — a pure internal refactor, not a behavior change) before the four new drawers (`NpcHelpDrawer.jsx`, `SpawngroupHelpDrawer.jsx`, `GridMapHelpDrawer.jsx`, `LootHelpDrawer.jsx`) were built the same way.
  - Each new drawer's own state (`showNpcHelp`/`showSpawngroupHelp`/`showGridMapHelp`/`showLootHelp`) is a plain `App.jsx` toggle, same "too small for its own hook" reasoning as `showSpawnHelp` (see React Key State).
  - Trigger placement follows the content, not a copy-paste of the Spawn Points "?" spot: NPCs and Spawngroups both put it in `DetailPanel.jsx`'s header (next to the panel title, same as Spawn Points) since their content is genuinely about that detail panel. `DetailPanel.jsx` gained a `helpButtons` lookup map (keyed by `activeView`, mirroring the existing `detailPanelTitles` map) instead of three hand-copied conditional blocks, so a future tab's drawer is a one-line addition. Grids Map's trigger lives in `GridsTab.jsx` next to the List/Map toggle instead, shown only when `viewMode === 'map'` — its content (pan/zoom controls, the marker/line legend, the ID-collision caveat) is about the *map*, not the Grid Detail side panel, which already has its own waypoint-table content unrelated to any of that. Loot's trigger lives in `LootTab.jsx`'s own toolbar row, since that tab has no detail panel at all to attach one to (see "The detail panel... [is] omitted entirely on TODO and Loot" under UI Layout).
  - `GridMapHelpDrawer.jsx` is the one drawer that documents a safety caveat rather than just a mechanic: grid.id is a hand-assigned number, not shared content lineage the way `npc_types.id` is (see EQEmu Schema Notes) — two independently-maintained databases can end up with an unrelated grid #N each, and `CompareGrids` has no way to detect that (unlike the equivalent `spawngroup.id` collision, which `SpawnGroupCollisionRisk` does catch). This was found live, not designed in the abstract: a screenshot of Old Guk's grid #13 showed source's and sink's waypoints in two completely non-overlapping clusters, prompting "am I to believe source and sink have the same pathgrid this far off?" — the answer was no, and the drawer now carries that same reasoning (each side internally tight and coherent, but the two sides not overlapping at all, is the signature of a coincidental id collision, not real drift) so the next person who sees it doesn't have to ask.
  - `go build`/`vet` (no Go changes) and `vite build` clean; a static grep cross-check confirmed all four new `setShowXHelp` prop names match between each call site and component definition.
- **Loot tab item-level diff, added 2026-07-24 (same day, direct follow-up)** — "I think a helpful analysis for the loot tab would be calling out what items are missing overall between the lootdrops in source and sink... often the exact table composition is different, but overall the idea is the same items would drop, just organized differently." The tree view's own restraint (never pairing individual lootdrops across databases — see `NPCLootComparison`'s comment) is exactly why this was missing: there was no way to ask "does sink drop the same items overall" without visually cross-referencing two independently-organized trees by eye. `lootItemSetDiff(sourceTable, sinkTable)` (`lib/lootHelpers.js`) answers a different, narrower question than the tree does — not "which lootdrop matches which" (unanswerable, no anchor) but "which *items*, anywhere in the whole table, exist on one side and not the other" — by dedupping every item by its portable `ItemID` across *all* of a table's lootdrops (not per-drop), then set-differencing the two sides. Entirely a frontend computation over data the tab already has loaded (`lootComparison.SourceTable`/`SinkTable`) — no new Go call. Surfaced as a new collapsible `ItemDiffSummary` section above the two-column tree in `LootTab.jsx`: collapsed by default when there's something to show (the header's own counts already answer "is this worth opening" without dumping every item name up front), a single quiet line when there's nothing to show. Colors reuse the app's existing new/removed convention (green = source has it, sink doesn't = "missing from sink"; red = sink has it, source doesn't = "extra, not in source") rather than inventing a third color scheme. Mentioned in `LootHelpDrawer.jsx` alongside "shared ×N", since it has the same kind of non-obvious "why does it dedup across lootdrops instead of per-drop" reasoning the rest of that drawer already exists to carry. `go build`/`vet` (no Go changes) and `vite build` clean. **Two follow-up fixes same day, both found via user report.** First: each side's list was a bare `max-h-40 overflow-y-auto` div with no visible border — with only a handful of items this looked fine, but with a lot of extra items it just silently clipped with no visual cue that more content existed below, reading as "broken/too small" rather than "scroll for more." Fixed by giving each side's list its own bordered box (`rounded border border-gray-700 bg-gray-900/40`) at a taller `max-h-72`. **That fix wasn't enough** — a follow-up screenshot (35 sink-only items) showed the list rendering as overlapping, illegible text, not just clipped. Real root cause: the scrollable box was `flex flex-col`, making every row a flex item, and flex items default to `min-height: auto` — with more rows than the box's `max-h-72` could fit, the browser shrank all 35 rows down to cram them in rather than triggering the scrollbar, squashing everything into overlapping garbage instead of scrolling past it. Fixed by taking the rows out of flex layout entirely — plain block-level divs with `space-y-0.5` on the parent instead of `flex flex-col gap-0.5` — since a block element has no flex-shrink to be squeezed by in the first place, `overflow-y-auto` is the only way remaining to see content that doesn't fit, which is what was actually wanted both times. **Third follow-up same day:** "for that diff view - can we add a refresh button?" — until now, the only way to see updated loot content (after an ID alignment, or a sync elsewhere that touched the underlying data) was re-searching for the same NPC or re-typing the same raw id. `useLoot.js` gained `lastLookup` (`{type: 'npc', sourceId, sinkId}` or `{type: 'raw', isSource, id}`, whichever lookup last populated `lootComparison`) and a `runLookup(lookup)` helper both `lookupLootByNpc`/`lookupLootByRawId` now funnel through instead of each having its own near-duplicate fetch — `refreshLoot()` is then just `runLookup(lastLookup)` again, guaranteed to replay the exact same fetch rather than a parallel reimplementation that could drift from it. `refreshWithIds` (the post-align refresh, see the ID-alignment pass) also updates `lastLookup`, so a manual refresh click right after an align continues to refetch the correct post-align ids rather than stale pre-align ones. Surfaced as a "⟳ Refresh" button in `LootTab.jsx`'s toolbar, shown only once something's actually loaded (`lootComparison` truthy) — nothing to refresh before that.
- **Excluded fields from NPC sync, added 2026-07-24** — "I'd like to figure out a way to exclude certain fields from syncing when syncing npc_types rows... maybe I don't want to sync scalerate or attack speed, but sync everything else." Discussed as a UX question first (recommendation given, confirmed, then built): a small persisted list (`Config.ExcludedNPCFields`, same "plain preference, saved immediately, not gated behind Connect" treatment as `MapsDirectory`) rather than a per-sync choice, since the motivating examples read as a standing preference, not something re-decided every sync.
  - **What "excluded" actually means was the real design decision, not the UI.** `upsertNPC` still includes an excluded column in the `INSERT` column/value list — only the `ON DUPLICATE KEY UPDATE` clause omits it (see the function's own comment). So a brand-new NPC still gets an accurate starting value from source for that column; only an *existing* sink row's value is protected from being overwritten. The alternative (never write the column at all) would leave freshly-inserted NPCs with a half-initialized value for no benefit — the point of exclusion is "don't clobber what's already tuned on sink," and a new row has nothing there yet to protect.
  - **Status stays fully transparent; a new `FieldsDiffer` flag tells the frontend what Sync can actually fix.** `NPCDiffRow.Status` is still computed from the complete, unfiltered field comparison — an NPC differing only in an excluded field still shows as "modified," never silently reclassified as "match." `FieldsDiffer` (computed the same way, minus excluded columns via the existing `withoutFields()` helper — already used for spawngroup's `name` exclusion, reused rather than adding a parallel mechanism) is the new signal for "does an UPDATE actually change anything here." Mirrors `SpawnDiffRow`'s `FieldsDiffer`/`SpawnEntriesDiffer` split precisely: `npcRowSelectable`/`npcFieldsOnlyExcluded` (`lib/npcHelpers.js`) gate checkbox-selectability and row color (`bg-orange-950/60`, matching the same muted treatment `spawnEntriesOnly` rows already use) the same way `spawnRowSelectable`/`spawnEntriesOnly` do — a row that's "modified" purely from excluded-field differences can't be selected for sync, so it can't produce a real-but-pointless no-op UPDATE that looks like progress.
  - **Two configuration surfaces, one underlying list** — decided during the UX discussion rather than picking one: a dedicated `ExcludedFieldsDrawer.jsx` (search-and-add against `npcAllFieldNames(diffRows)`, the full real column set derived from already-loaded diff data rather than the curated `fieldGroups` list, so schema drift doesn't leave a column unreachable) reachable from a new "Excluded fields (N)" button next to "Sync N NPCs" in the persistent zone header; and a lightweight inline toggle directly on each field row in `NpcDetailPanel.jsx` (a small "exclude" link that fades in on row hover, `⊘` shown persistently once excluded), so a field you're already annoyed by can be excluded right where you noticed it. Both call the same `App.jsx` dispatch point (`toggleExcludedNpcField`/`connections.setExcludedNpcFields`) into the one persisted list — no separate state to keep in sync. References fields are included too, on equal footing with every other field (see the reversal noted right below — an earlier version of this pass excluded them, on reasoning that turned out not to hold up); the exclude toggle's own `stopPropagation()` keeps it from conflicting with a References row's existing click behavior (open a comparison drawer / jump to Loot) even though both live on the same row.
  - `wails generate module` run for `CompareZones`'s new `excludedFields` parameter and the `Config`/`SyncOptions`/`NPCDiffRow` field additions. `go build`/`vet`/`test` and `vite build` clean.
  - **Reversed same day, found via user questions — References fields ARE excludable after all.** First follow-up ("does this also exclude synch'ing references?") surfaced that the two entry points into `excludedFields` disagreed — the inline toggle refused a References field, but the drawer's search box didn't filter them out, so it could add one anyway. That got "fixed" by blocking References from the drawer too, matching the inline toggle — but the very next question ("so if I sync npc_types, it will not actually change any values in references?" → "yes I want to exclude those FK if needed... I may want to sync most of the npc data, but I'm not ready to update factions or loot tables, so I'm also not ready to lose track of what ids they were pointing to") revealed the *original* restriction was the actual mistake, not the inconsistency. The reasoning that shipped first — "excluding a shared reference FK isn't the same kind of decision, the TODO queue and ID alignment already exist for that" — doesn't hold up: the TODO queue and ID alignment are about the *reference content*, and do nothing to stop the FK *id column itself* from being clobbered by a plain `npc_types` sync in the meantime, which is precisely the real, stated need. Both `NpcDetailPanel.jsx`'s inline toggle and `ExcludedFieldsDrawer.jsx`'s search now offer every `npc_types` column with no exceptions — the two entry points agree again, just in the opposite direction from the first fix. Reconfirmed for the record, since it's easy to conflate the two "references": excluding a reference FK column only ever protects that id from being overwritten on an *existing* sink row (still set from source on a brand-new insert, same as any other excluded column) — it has no effect on, and never did have any effect on, the actual shared reference *content* (faction values, spell lists, loot tables), which Sync has never written regardless of this feature.
  - **Icon styling fix, same day, found via user report ("exclusions in the references section don't get the same excluded icon as the other fields").** The `⊘` badge was rendering for excluded References fields — just nested inside the same `<span>` that gets `text-cyan-400 underline decoration-dotted` when the field is `comparable`, so the underline bled through it and the orange competed with the cyan, reading as a different (worse) treatment than the clean badge non-Reference fields got on their plain gray span. Fixed by splitting that span in two — the field name keeps its own `comparable`-conditional styling, the `⊘` badge is now a sibling with only its own `text-orange-500`, unaffected by whether the row happens to be comparable.
  - **Open question, not yet resolved:** does an excluded reference field still queue a TODO item on sync? Currently yes — `buildTODOItems` has no awareness of `ExcludedNPCFields` at all, it only checks whether source's value is nonzero, so excluding e.g. `loottable_id` still gets it flagged for manual review same as before. This matches the pre-existing "TODO items are queued regardless of whether the sink already matches" philosophy (see `buildTODOItems`'s own comment), but the user's stated reasoning for excluding a reference field in the first place ("not ready to touch this yet") arguably means the TODO nag is unwanted noise, not a useful flag, for that specific case — asked, not yet answered as of this pass.
- **Grids tab Map view (Brewall's Maps), added 2026-07-24.** The Grids tab previously showed patrol paths as text only (a waypoint list in the detail panel) — no way to see where a grid actually runs relative to the zone's own geometry. The user supplied a full Brewall's Maps set (`EQ-Maps/Brewall/`, 1707 files) and asked for grids plotted on top of it. Two things were verified against real data *before* any code was written, not assumed: (1) the file format — base files (`<short_name>.txt`) are pure `L x1,y1,z1,x2,y2,z2,r,g,b` line-segment records, no comments; `P x,y,z,r,g,b,size,label` point/label lines only showed up in the `_1.txt`/`_2.txt` detail-overlay variants, out of scope for v1 by the user's own choice (base file only, no multi-file layering). (2) The coordinate transform — `gfaydark.txt` (2730 segments) was parsed and rendered to a standalone SVG with world X → screen X and world Y → screen Y *inverted* (no axis swap), rasterized via `qlmanage -t` (no `matplotlib`/`rsvg-convert`/browser tooling available in-session) and visually confirmed as an immediately recognizable Greater Faydark — the big-tree village cluster, the zone-line notches at the borders. That's the exact transform `lib/zoneMapHelpers.js`'s `makeTransform` implements. This matters because this codebase has already shipped two real coordinate-axis bugs (`toFloat64`'s missing `float32` case, and the in-game `/loc` command's Y,X,Z-vs-database's-X,Y,Z ordering) — guessing at a third one instead of checking was exactly the failure mode to avoid. Absolute compass orientation still can't be verified without a labeled reference, so the plan's own verification step asks the user to confirm a real grid's plotted position against where they know it runs in-game, same "flag what can't be self-verified" honesty as `RelocateSpawnGroup`'s `ThisZoneCount` note.
  - Backend: `zonemap.go`'s `GetZoneMap(mapsDirectory, zoneShortName)` — a plain file parse, no DB access at all, `mapsDirectory` passed explicitly rather than stored on `App` (not a "connection" needing lifecycle management). A missing file is `ZoneMap{}` + nil error, not an error — most zones plausibly have no Brewall coverage. `Config` gained `MapsDirectory`, set via `PickMapsDirectory()` (mirrors `PickPrivateKeyFile`'s native-dialog shape) and saved immediately on pick (`useConnections.js`'s `setAndPersistMapsDirectory`), not gated behind Connect.
  - Frontend: `useZoneMap.js` (much simpler than the other domain hooks — a zone map is static, nothing to diff or sync, just fetch-and-cache; loaded on every zone switch via `selectZone`'s fan-out so the Grids tab's new List/Map toggle is instant either direction) and `ZoneMapView.jsx` (background segments + every grid in the zone as a `<polyline>`, always source's grids per this app's existing "source is the reference dataset" convention — full waypoint/heading/Centerpoint detail only for the *selected* grid, every other grid rendered thin and dim for context so a zone with many grids doesn't turn into noise). `GridsTab.jsx` gained a `viewMode` toggle (originally local UI state, later lifted into `useGridSync.js` — see the "Pathgrid → Grids map navigation" bullet above) that swaps its list body for a compact grid-picker + `ZoneMapView`, mirroring how the TODO/Loot tabs already reclaim the detail panel's width when it isn't earning its keep. `Sidebar.jsx` gained a "Maps folder" row below the source/sink connection boxes.
  - Deliberately out of scope for v1 (see the feature's own plan for the full list): zoom/pan (fit-to-container only), `_1`/`_2` overlay layering and `P`-line labels, showing sink's grids or a source/sink toggle, an NPC/Spawn-Points overlay on the same map (a natural follow-up, not silently bundled in), and click-a-path-to-select-its-row (currently one-way: list → highlighted map).

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
- **Login/connect logic audit, 2026-07-20 (same day, requested review, not a user-reported symptom):** asked to check `Connect()` for bugs, found two real ones and fixed both — see the `Connect()` bullet under Key Functions for specifics. (1) The MySQL DSN was built via raw string concatenation (`user+":"+pass+"@tcp("+host...`) instead of `mysql.Config`/`FormatDSN()` — a password containing `@`/`:`/`/`/`?` would silently misparse into the wrong host/db rather than fail loudly; nobody had hit it yet only because no one had tested a password with those characters. (2) Reconnecting to the same side (edit settings, click Connect again) leaked the previous `sql.DB` pool's connections forever — the existing tunnel-cleanup comment claimed `sourceDB`/`sinkDB` were "pooled and eventually GC'd" as the reason they didn't need the same explicit `Close()` the tunnel got, which is wrong: `sql.DB` has no finalizer, so dropping the reference does nothing to its live MySQL connections. `shutdown()` closing them only ever covered whichever pool was current at final app exit, not any pool replaced along the way. Both fixed the same way the tunnel cleanup already worked: close the old one before assigning the new one. Not fixed at the time: no mutex guarded `sourceDB`/`sourceTunnel`/`sinkDB`/`sinkTunnel`, so two `Connect()` calls racing on the *same* side could still leak — flagged as a known gap rather than fixed then, since real protection would mean auditing every read site across the file, a much bigger change than the login path itself. **This specific gap was closed 2026-07-25** — see the `Connect()` Key Functions entry and `App.sourceMu`/`sinkMu` for the fix; the broader "every other read site" scope was still deliberately left out, same reasoning as before.
- **Loot tab, 2026-07-21 — Phase 1 (shared reference table comparison) complete.** The last unbuilt reference type, deliberately saved for last since it needed its own design pass: real schema pulled for `loottable`/`loottable_entries`/`lootdrop`/`lootdrop_entries` on both databases first, confirming both `loottable.id` and `lootdrop.id` are local surrogates (`AUTO_INCREMENT` on both) before deciding anything. See the "Shared reference table comparison, phase 1" bullet under Sync Design for the full design (why Loot got its own tab instead of reusing `ReferenceDrawer`, why source/sink render as two independent trees rather than paired lootdrops, the `SharedCount`/"shared ×N" addition, and the disclosure-triangle/Expand-All UI pass). `resolveItemNames` was generalized to take the id-column name as a parameter (`"item"` for merchantlist, `"item_id"` for lootdrop_entries) rather than staying merchant-specific once loot needed the same lookup. `loottable_id` was also added to `referenceFKColumns`, so a dangling `loottable_id` now gets the same missing-reference flag the other three FK types already had.
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
- **Grids tab Map view (Brewall's Maps), 2026-07-24.** See the "Grids tab Map view" bullet under Sync Design for the full design. Worth calling out here specifically: the coordinate transform was verified against real data *before* writing any application code — `EQ-Maps/Brewall/gfaydark.txt` was parsed with a standalone Python prototype, rendered to SVG, rasterized via macOS's `qlmanage -t` (no `matplotlib`, `rsvg-convert`, or browser automation available in this session), and visually confirmed as a recognizable Greater Faydark before `lib/zoneMapHelpers.js`'s `makeTransform` was written to match. `zonemap_test.go` keeps that verification alive as `TestGetZoneMapAgainstRealBrewallFile`, asserting the exact segment count (2730) found during that check — skipped gracefully if `EQ-Maps/Brewall/` isn't present (e.g. CI), not a hard dependency. New Go: `zonemap.go` (`MapLineSegment`/`ZoneMap`/`GetZoneMap`), `Config.MapsDirectory`, `PickMapsDirectory()` in `ssh.go`. New frontend: `useZoneMap.js`, `lib/zoneMapHelpers.js`, `components/ZoneMapView.jsx`; `GridsTab.jsx` gained a List/Map toggle, `Sidebar.jsx` gained the Maps-folder setting row, `useConnections.js` gained `mapsDirectory` in its `Config` load/save lifecycle. `go build`/`vet`/`test` and `vite build` clean; `wails generate module` run for `GetZoneMap`/`PickMapsDirectory`. Not yet manually smoke-tested in `wails dev` — same outstanding-verification caveat as every other frontend-touching pass this session, plus the one thing that specifically can't be self-verified: the user confirming a real grid's plotted position matches where it actually runs in-game.
- **`RelocateSpawnGroup` cross-zone repoint bug, fixed 2026-07-24, found via user report ("it seems to create a spawngroup, but the spawngroupID collision still remains because the source has different content").** A second, more subtle bug in the same function the name-collision fix (above, same day) had just touched — this one changes actual repoint *behavior*, not just an insert's error handling. `RelocateSpawnGroup`'s step 2 (`UPDATE spawn2 SET spawngroupID = ? WHERE spawngroupID = ? AND NOT (zone = ? AND version = ?)`) only ever excluded the caller's own single zone/version from being repointed onto the squatter's new home. But `spawngroup` has no zone column of its own (see EQEmu Schema Notes) — a single source spawngroup can legitimately be referenced by spawn2 rows in *more than one* zone. When that's true, any OTHER zone sharing the same source spawngroup got silently swept up by the old single-zone `NOT (...)` clause and repointed to the squatter's unrelated content, right alongside the genuine squatter usage it was supposed to catch. From the outside that looks exactly like "the collision never actually got fixed" — the id the caller relocated *was* populated correctly with source's content, but a second zone's rows, wrongly redirected away from it, now show source's content as different from what they point at. Fixed by querying `a.sourceDB` (not just `a.sinkDB`) for every `(zone, version)` that also references `options.SpawnGroupId` there, and folding all of them into the exclusion set alongside the caller's own zone — the repoint `UPDATE`'s `WHERE NOT (...)` clause is now built dynamically over the whole set (via `sort`/`strings.Join`, deterministic query text) instead of one hardcoded pair. The zones that get excluded this way are exposed to the frontend as the new `RelocateSpawnGroupResult.SharedSourceUsage` field, shown in `ConfirmRelocateSpawnGroupModal.jsx` as its own "left alone, will resolve on its own" list — distinct from `SquatterUsage` (which *will* be repointed) and `ThisZoneCount` (the caller's own zone) — so the confirm-step preview accurately reflects what does and doesn't move, the same "here's what this actually touches" transparency `ThisZoneCount` was added for on 2026-07-21. `go build`/`vet`/`test` and `vite build` clean; `wails generate module` run for the new `RelocateSpawnGroupResult` field.
- **`SpawnGroupCollisionRisk` never clearing after a real relocate, fixed 2026-07-24 (same day, direct follow-up), found via user report of a concrete workflow: "every row has a spawngroupID collision. I click relocate & reclaim... the list refreshes, but still the same error. This time its pointing to the spawngroup I want it to point to... when does the error ever go away?"** A third bug in the same collision/relocate area, but in the *detector* this time, not `RelocateSpawnGroup` itself. `annotateSpawnGroupCollisionRisk` (see `SpawnDiffRow.SpawnGroupCollisionRisk`, added 2026-07-21) only ever checked whether a spawngroup row *existed* on the sink at source's raw id — never whether its *content* matched. That's fine the first time a "new" row is seen (nothing sat there before), but a spawngroup is usually a pool shared across many spawn2 locations (see EQEmu Schema Notes), so after `RelocateSpawnGroup` correctly reclaims one colliding id with source's real content, every OTHER still-unsynced "new" row sharing that SAME spawngroupID still sees a spawngroup row sitting at that id — now the CORRECT one — and got flagged as colliding anyway, forever, since the check never distinguished "exists and already matches" from "exists and doesn't." Fixed by making the check content-aware: `annotateSpawnGroupCollisionRisk` now batch-fetches the sink's actual field/entry content for every colliding id (`fetchSpawnGroupContentByIds`, 2 queries regardless of row count) and compares it against source's own `SpawnGroupFields`/`SpawnEntries` (already loaded on the row, no extra query) via the new `spawnGroupContentMatches` — `"name"` excluded from the field comparison (cosmetic/local, and a successful relocate can leave a disambiguated name behind, which must not itself read as "different content"). Only a genuine content mismatch is flagged now, so the warning actually clears once the collision is really fixed. `spawnGroupContentMatches` is extracted as its own pure function specifically to be unit-tested (`spawn_test.go`'s `TestSpawnGroupContentMatches`) without a DB — the same comparison this bug hinged on is also exactly what the cross-zone repoint bug (above) hinged on, in the same session, which is why it's pinned down with tests rather than left inline this time. `go build`/`vet`/`test` clean (including the new test); no API/type shape changed (`SpawnGroupCollisionRisk` is still a plain `bool`), so no `wails generate module` or frontend changes needed.
- **Batch relocate-and-reclaim for colliding spawngroups, added 2026-07-24 (same day, direct follow-up).** Direct response to: "In a list with hundreds of spawn2 rows and each one has a collision, can we improve the UI/UX so that I can do a relocate comparison en masse instead of selecting each row, clicking relocate, then confirming the modal?" The key realization this design leans on: since a spawngroup is usually a pool shared across many spawn2 locations, "hundreds of colliding rows" almost always means a much smaller set of *distinct* `SpawnGroupId`s — so "relocate everything" means "review N groups", not "review hundreds of rows one at a time," which is what makes batching tractable without abandoning the existing per-item preview-then-confirm discipline.
  - Backend: `RelocateSpawnGroups` (`spawngroup.go`) takes a list of `SpawnGroupIds` and calls the existing single-item `RelocateSpawnGroup` once per id — reused directly rather than re-implementing the squatter-eviction/repoint/reclaim logic a second time. Source content for every id is fetched fresh in 2 batched queries via `fetchSpawnGroupContentByIds` (already built for `annotateSpawnGroupCollisionRisk`'s content check above, and DB-agnostic, so reused against `a.sourceDB` here instead of duplicating a source-side fetch) — consistent with this app's standing rule of never trusting client-supplied field data for a write (see `CreateLootDrop`'s own comment for the same discipline). Each id's relocate runs in its OWN transaction rather than one shared transaction wrapping the whole batch — a deliberate departure from `Sync()`'s single all-or-nothing transaction across an NPC selection, because a batch of colliding spawngroups is N genuinely independent fixes, not one coherent atomic action the way "sync this set of NPCs" is. `RelocateSpawnGroupOutcome` pairs each id with its own result or error so a batch of 50 where one id fails still reports the other 49 as succeeded, rather than the whole batch rolling back or erroring opaquely.
  - Frontend: `lib/spawnHelpers.js`'s `collidingSpawnGroupIds(spawnDiffRows)` derives the distinct-id list from the already-loaded diff data (no new Go call needed just to know what to offer). A new "Relocate N colliding spawngroups" button appears in the Spawn Points zone header (next to "Sync N Spawn Points") only when that list is non-empty. `useBatchRelocateSpawnGroups.js` + `ConfirmBatchRelocateSpawnGroupsModal.jsx` mirror the single-item `useRelocateSpawnGroup.js`/`ConfirmRelocateSpawnGroupModal.jsx`'s dry-run-preview-then-confirm shape, but render a scrollable per-id list (squatter name, "N other locations moving with it," "shared with N other zones in source, left alone" — reusing the same `SquatterUsage`/`SharedSourceUsage` transparency the single-item modal already shows) instead of one item's full detail, and add a fourth state (post-execute outcome: ✓/✗ per id) the single-item modal doesn't need since it only ever handles one outcome. The scrollable list uses plain block-level rows, not `flex flex-col`, inside its `max-h` container — deliberately avoiding the exact bug already found once in the Loot tab's item-diff list (see that Repo Meta entry): flex children default to `min-height: auto`, so a list taller than its container gets squeezed into overlapping garbage instead of scrolling.
  - `go build`/`vet`/`test` and `vite build` clean; `wails generate module` run for `RelocateSpawnGroups`/`BatchRelocateSpawnGroupsOptions`/`RelocateSpawnGroupOutcome`/`BatchRelocateSpawnGroupsResult`. Not yet manually smoke-tested against a real zone with hundreds of colliding rows in `wails dev`.
- **SSH-tunnel UI lag — parallel Compare* queries + a global progress indicator, added 2026-07-25.** Direct response to: "considering I use the ssh feature a lot, the UI often lags while queries are happening. Can we update the UI to show some kind of progress bar while queries occur? I know Go is good at asynchronous multithreading...how can we make this a smoother user experience?" Presented as a scoped choice first (visual-only vs. visual-plus-real-speedup vs. that-plus-granular-per-item-progress) rather than assumed — the user picked the middle option, so per-item "12 of 47" progress for batch actions (Sync NPCs, batch relocate, etc.) was deliberately NOT built this pass; it stays a documented possible follow-up, not silently dropped.
  - **The actual latency fix, not just a nicer wait: every read-only `Compare*` method now fetches source and sink concurrently instead of sequentially.** Root cause of the reported lag: `CompareZones`/`CompareSpawns`/`CompareGrids`/`CompareSpawnGroups`/`CompareNPCFaction`/`CompareNPCSpells`/`CompareNPCMerchant`/`CompareNPCLoot` all independently fetch source's and sink's data as two (or more) fully independent, sequential round trips — fine over a local connection, but over an SSH tunnel each round trip pays real, cumulative network latency, so N sequential queries cost N times that latency. New `runParallel(fns ...func() error) error` (`dbutil.go`) runs each side's whole fetch(+annotate/+resolve) pipeline in its own goroutine and waits for all of them, returning the first error in argument order — see its own Key Functions entry for the full design (why it never abandons a slower goroutine on an early error, why it's safe: `*sql.DB` — unlike `*sql.Tx` — is safe for concurrent use by multiple goroutines, which is also exactly why this was deliberately scoped to READ-only diff methods and never applied to any write path). Some of these functions had internal cross-side dependencies (e.g. `CompareSpawns`'s `resolveOrphanedSpawnEntryNames` for sink's points queries source's DB, and vice versa) that needed care to restructure correctly rather than a mechanical find-replace — each one was read and reasoned through individually, not batch-edited. `go test -race` added as a standing check specifically because this pass introduced the first real goroutines in the codebase; `dbutil_test.go`'s new `TestRunParallel` pins down the three behavioral guarantees (all functions actually run, a failing one doesn't abandon the others, first error wins by argument order not completion order) since these are exactly the properties easy to get subtly wrong with hand-rolled goroutine/WaitGroup code.
  - **A global progress indicator, for the wait time that's left.** Even with queries running in parallel, a slow tunnel still means some visible wait — the literal ask was "show some kind of progress bar." Built as `lib/pendingGoCalls.js`'s `instrumentGoCalls()`, called once (idempotent, safe to call every render) from `App.jsx`'s render body: it patches every method on `window.go.main.App` — the Wails-injected runtime binding object itself, not the generated `wailsjs/go/main/App.js` wrapper functions (which `wails generate module` regenerates on every build and would silently wipe out any direct edits) — to increment/decrement a shared counter around each call. This means every existing and future backend call is covered automatically; no individual hook had to be touched to opt in, and a hook calling a brand-new Go method added after this was written still gets tracked with zero extra wiring. `usePendingGoCalls()` (`useSyncExternalStore`) exposes the counter to React; `GlobalProgressBar.jsx` renders a thin, fixed, top-of-window bar whenever it's nonzero. Indeterminate, not a real percentage (a single Promise has no "% complete" to report) — `style.css`'s `global-progress-slide` keyframes mirror the standard indeterminate-progress pattern (Material UI's `LinearProgress`, GitHub/YouTube's top-of-page bar) rather than faking a width value.
  - Deliberately NOT built this pass (see the scoping discussion above): granular per-item "step N of M" progress via Wails events for the long batch loops (`Sync`, `SyncSpawnPoints`, `SyncGrids`, `RelocateSpawnGroups`) — a real, separate mechanism (`runtime.EventsEmit` from Go, `EventsOn` in JS) that would need its own design pass, offered as a clearly separate option and not chosen this time.
  - `go build`/`vet`/`test -race` and `vite build` clean; no Go API/type shape changed (only internal control flow), so no `wails generate module` needed. Not yet manually smoke-tested in `wails dev` against a real SSH-tunneled connection — the actual scenario this was built for, and the one thing that can't be verified without one.
- **`Connect()` same-side race condition, fixed 2026-07-25 (same day, direct follow-up).** The `Connect()` bullet under Key Functions has documented, since the 2026-07-20 login audit, a known-but-accepted gap: no mutex guarded `sourceDB`/`sourceTunnel`/`sinkDB`/`sinkTunnel`, so two `Connect()` calls racing on the same side (not source-vs-sink, which touch disjoint fields) could each see the old db/tunnel as safe to leave alone, then race to overwrite each other's assignment — a genuine lost-update data race, leaking whichever one lost. Asked directly whether this was "actually a bug" worth fixing: yes — this is a real Go data race (unsynchronized concurrent read/write of struct fields from separate goroutines), not just a hypothetical, even though the trigger (two concurrent `Connect()` calls for the same side) is narrow enough that normal single-click UI usage won't hit it. Fixed with two new `App` fields, `sourceMu`/`sinkMu sync.Mutex` — deliberately two separate mutexes, not one shared lock, so a source reconnect and a sink reconnect (genuinely independent operations) never block each other; safe from lock-ordering deadlock since a single `Connect()` call only ever takes one of the two. `Connect()` now holds the relevant mutex for its *entire* body (tunnel dial, DB ping, and the final field swap), not just the swap — a second `Connect()` for the same side waits for the first to fully finish rather than interleaving with it. `shutdown()` takes both mutexes before closing anything, so it can't race a `Connect()` still in flight either. Deliberately scoped to exactly this one race, the same boundary the original gap was documented with — every other `a.sourceDB`/`a.sinkDB` read site across the app (the `if a.sourceDB == nil` guard repeated in nearly every `Compare*`/`Sync*` method) stays unguarded; auditing all of those remains a much bigger, not-undertaken change. `go build`/`vet`/`test -race` clean; no API/type shape changed, so no `wails generate module` or frontend changes needed.
- **Zone-switch crash audit entry removed, 2026-07-25** — the 2026-07-21 parked "audit for crashes when clicking through zones with sparse data" entry was dropped from this doc entirely (not just marked resolved): the user confirmed it's obsolete-by-events at this point, so it no longer needs to survive as a tracked loose end. If sparse-zone crashes ever resurface, they'd be a fresh report, not a continuation of that stale audit.
- **Shared reference table sync, phase 2, added 2026-07-25 (same day, direct follow-up to "let's start planning phase 2").** Closes the last item that had been sitting on the roadmap as "not started" since phase 1 shipped. Planned in Plan Mode first: two scoping questions (standalone trigger vs. folded into NPC sync; block vs. warn on shared-usage) were put to the user directly via `AskUserQuestion` rather than assumed, since either answer was defensible and this app has precedent for both ("flag, don't block" for spawngroup risk, but a hard block for `DeleteSpawnGroup`'s usage check) — see the "Shared reference table sync, phase 2" bullet under Sync Design for the resulting design and the full backend/frontend breakdown. Worth calling out here specifically: this is the first time a *generic* primitive (`SyncReferenceContent`) was designed as the deliberate mirror-image of an existing one (`AlignId`) from the start, rather than generalized after the fact the way `AlignId` itself was (built for loot first, generalized to four tables once that was proven useful) — the phase 1 comparison work and `AlignId` had already done enough of the hard design thinking (which tables, what "id" means per table, how child rows are shaped) that phase 2 could reuse `idalign.go`'s shared helpers (`fetchRowById`, `fetchChildRows`, `insertRow`, `getSinkColumns`) directly and only needed one truly new piece, `updateRowById`, for the "header row already exists" update path `AlignId` never needed (a rename never updates a row's fields, only its id). `go build`/`vet`/`test -race` and `vite build` clean; `wails generate module` run for `SyncReferenceContent`/`SyncReferenceContentOptions`/`SyncReferenceContentResult`. README's roadmap checklist was brought current in the same pass — it had drifted behind several shipped features (delete-on-sync, excluded NPC fields, batch spawngroup relocate, lootdrop creation, the SSH-lag parallelization/progress-bar pass) since it was last touched. Not yet manually smoke-tested in `wails dev` against real source/sink content for all four targets — flagged as the outstanding verification step, same as every other backend-and-frontend pass this session.

## Git
- Repo: `git@github.com:nazwadi/eqemu_dsynch_tool.git`
- Branch: `main`
