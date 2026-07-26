# EQEmu Data Sync Tool

A domain-aware database diff & sync tool for [EverQuest Emulator](https://github.com/EQEmu/Server) (EQEmu) servers. Think **Navicat Data Compare**, but it actually understands the EQEmu schema — spawn chains, patrol grids, and the shared loot/faction/spell/merchant tables, and all.

![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)
![Wails](https://img.shields.io/badge/Wails-v2-DF0000)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Status](https://img.shields.io/badge/status-early--alpha-orange)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Why this exists

If you run an EQEmu server, you've lived this: you build and test content — NPCs, spawns, loot — against a local or dev database, then need to push it to your live server. Generic DB sync tools don't know that `npc_types` is joined to `spawn2` through `spawngroup` and `spawnentry`, that `loottable_id` / `npc_faction_id` / `npc_spells_id` point at *shared* tables that can't be blindly overwritten per-NPC, or that your dev and live databases might have drifted schemas (136 columns vs. 131, in one real case).

**EQEmu Data Sync Tool** connects to a source and sink database and gives you an instant, field-level diff for any zone — NPCs, spawn points, spawn groups, patrol grids, and the shared loot/faction/spell/merchant content they reference — color-coded, sortable, and safe by design: it flags or queues anything it can't sync safely instead of guessing.

## Features

**Diffing & sync**
- Zone browser — searchable, version-aware (EQEmu zones are keyed by `short_name` + `version`)
- NPCs — full `spawn2 → spawngroup → spawnentry → npc_types` diff, dry-run preview, transactional sync; detects quest-spawned NPCs that have no static spawn point; specific `npc_types` columns (e.g. `scalerate`, `attack_speed`) can be excluded from sync so they're never overwritten on an existing sink row; syncing a row that's been removed from source deletes it from the sink, called out explicitly at every step
- Spawn Points — zone-scoped `spawn2` diffing and sync, matched by coordinate, including delete-on-sync for removed rows
- Spawngroups — spawngroup fields (`spawn_limit`, wander box, timing) and rosters, source vs sink, synced together; delete-on-sync for removed groups (blocked if anything on the sink still references them)
- Grids — patrol path (`grid`/`grid_entries`) diffing and sync, with an optional map view that plots every grid over your own Brewall's Maps files (point the app at your maps folder once, in the sidebar)
- Loot / Faction / Spells / Merchant — source-vs-sink comparisons for every shared reference table an NPC can point at; realign a table's local ID to match source (see **ID alignment**), or overwrite its actual content to match source directly from the comparison view — see **Reference content sync** below
- Conditions — read-only visibility for `spawn_conditions` (full diff), plus `spawn_condition_values` and `spawn_events` shown for reference (not diffed — the former is live per-instance server state, not authored content; the latter has no portable id to match across databases)

**Safety**
- TODO checklist — shared references get queued for manual review on every sync instead of being blindly overwritten, with a zone-scoped, dismissible tracking tab
- Missing-reference detection — flags any foreign key (loot table, faction, spells, merchant, spawn group, patrol grid) that points at a row which doesn't actually exist on that side
- Spawngroup ID-collision detection — flags a spawngroup ID that already exists on the sink as unrelated content before you sync into it, with a one-click "relocate & reclaim" (single spawngroup, or every colliding one in a zone at once) to safely free it up instead of hand-written SQL
- ID alignment — renumber a sink row's local surrogate ID (loot table, lootdrop, faction list, spell list) to match source directly from the comparison view; the row's own content is never touched, only its identity, and anything already squatting on the target id is relocated out of the way first
- Reference content sync — the complement to ID alignment: overwrite a shared row's actual content (loot table, faction list, spell list, merchant list) to match source, id untouched; warns how many other NPCs on the sink reference the same row before you commit, but never blocks the write
- Lootdrop creation — copy a source-only lootdrop straight into the sink, preserving its id when free
- Schema-drift tolerant — only ever writes columns that actually exist on the sink, so dev/live schema differences don't break a sync
- Nothing is ever guessed: shared or ambiguous data is always flagged for you to resolve, never silently merged

**Connectivity & UX**
- Dual DB connections, credentials saved locally
- SSH tunnel support, with real host-key verification against your own `~/.ssh/known_hosts`; source/sink diff queries run concurrently rather than one after another, and a global progress indicator shows whenever a backend call is in flight — both aimed at the lag a tunneled connection otherwise makes very noticeable
- Resizable, collapsible sidebar and detail panel; layout persists across restarts

See the [Roadmap](#roadmap) for what's shipped vs. still in progress.

## Tech stack

| Layer      | Tech                                                   |
|------------|---------------------------------------------------------|
| Desktop shell | [Wails v2](https://wails.io)                        |
| Backend    | Go, [`go-sql-driver/mysql`](https://github.com/go-sql-driver/mysql) |
| Frontend   | React 18, Tailwind CSS v4, Vite                        |
| Database   | MariaDB / MySQL running the EQEmu schema               |

## Getting started

### Prerequisites
- Go 1.25+
- Node 22 ([nvm](https://github.com/nvm-sh/nvm) recommended: `nvm use 22`)
- Wails CLI v2: `go install github.com/wailsapp/wails/v2/cmd/wails@latest`
- Two MariaDB/MySQL databases running an EQEmu schema (source and sink) — they can be the same server if you just want to try it out

### Run in dev mode
```bash
nvm use 22
wails dev
```
This launches the desktop app with hot reload on frontend changes. To call the Go backend directly from your browser's devtools, open [http://localhost:34115](http://localhost:34115).

### Build a release binary
```bash
wails build
```
Outputs a redistributable app bundle to `build/bin`.

## Configuration

Source/sink connection settings are saved automatically after your first successful connection, via Go's `os.UserConfigDir()` — on macOS that's `~/Library/Application Support/eqemu-sync/config.json`. Nothing is synced or sent anywhere; it's a local file next to your other app configs.

## How it works

1. Connect to your **source** (e.g. dev) and **sink** (e.g. live) databases.
2. Pick a zone from the source DB's zone list.
3. The tool joins `spawn2 → spawngroup → spawnentry → npc_types` on both databases and diffs every NPC by ID, column by column.
4. Each NPC lands in one bucket: **new** (in source only), **modified** (same ID, different fields), **removed** (in sink only), or **match**.
5. Select the NPCs you want to bring over and click "Sync" to see a dry-run preview — exactly what will change, plus any loot/faction/spell references that will be queued as TODOs. Selecting a **removed** NPC and syncing it deletes it from the sink — the preview and confirmation both call this out explicitly before you commit.
6. Click "Execute Sync" to write the selected `npc_types` rows to the sink inside a transaction. The diff view refreshes automatically so synced NPCs flip to "match".

The Spawn Points, Spawngroups, and Grids tabs follow the same diff → select → preview → sync pattern for their own tables. For loot, faction, spells, and merchant content, you get two independent actions from the comparison view: realign the sink's local ID to match source (content untouched, just its identity), or sync the row's actual content to match source (id untouched, content overwritten) — whichever the difference you're looking at actually calls for.

## Roadmap

- [x] `npc_types` diff and sync — dry-run preview, transactional execute with rollback on failure, schema-drift tolerant; specific columns can be excluded from ever overwriting an existing sink row; syncing a removed row deletes it from the sink instead of silently skipping it
- [x] TODO queue for shared references, persisted and surfaced in an in-app checklist tab (zone-scoped, dismissible — archive, not delete)
- [x] Spawn Points tab — zone-scoped `spawn2` diffing and sync, matched by coordinate; a spawn group reference that doesn't resolve on the sink is flagged, not blocked; delete-on-sync for removed rows
- [x] Spawngroups tab — spawngroup fields and rosters, source vs sink, synced together as one action; ambiguous matches are flagged rather than guessed; delete-on-sync for removed groups, blocked if the sink still has anything pointing at them
- [x] Grids tab — zone-scoped diffing and syncing for patrol paths (`grid`/`grid_entries`)
- [x] SSH tunnel support, with private-key or password auth and `~/.ssh/known_hosts` verification
- [x] Shared reference table comparison (phase 1): source-vs-sink views for faction, spells, merchant, and loot (`loottable → lootdrop → items`)
- [x] Missing-reference detection: flags a dangling faction/spells/merchant/loot-table/spawn-group/patrol-grid reference instead of silently showing nothing
- [x] Spawngroup ID-collision detection and resolution: a colliding spawngroup ID is flagged before it's synced into, with a one-click "relocate & reclaim" action to safely free it up instead of hand-written SQL — single spawngroup or, when a zone has many colliding rows at once, every distinct one in one batch
- [x] ID alignment: renumber a sink row's local surrogate ID (loot table, lootdrop, faction list, spell list) to match source directly from the comparison view — a rename, not a content overwrite; anything already occupying the target id is relocated out of the way first
- [x] Lootdrop creation: copy a source-only lootdrop (fields + entries) straight into the sink, preserving its id when free
- [x] Grids map view: plot every patrol grid in a zone over your own Brewall's Maps files, with the selected grid highlighted (waypoints, heading, centerpoints) and every other grid shown dim for context
- [x] Diff queries run source and sink concurrently instead of sequentially, plus a global progress indicator — aimed squarely at the lag an SSH-tunneled connection otherwise makes obvious
- [x] Shared reference table sync (phase 2): overwriting loot/faction/spells/merchant *content* to match source (distinct from realigning their IDs, above) — triggered standalone from the comparison view, warns how many other NPCs on the sink share the row before you commit but never blocks the write
- [x] Conditions tab: read-only visibility for `spawn_conditions` (a real diff), `spawn_condition_values`, and `spawn_events` (both shown for reference, never diffed — the former is live per-instance server state, the latter has no portable id across databases)

## Contributing

Issues and PRs are welcome. This project is built to scratch a real itch (keeping EQEmu dev and live content in sync without hand-written SQL), so bug reports from anyone running an EQEmu server are especially useful — even if you're not touching the code.

## License

[MIT](LICENSE)
