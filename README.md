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
- NPCs — full `spawn2 → spawngroup → spawnentry → npc_types` diff, dry-run preview, transactional sync; detects quest-spawned NPCs that have no static spawn point
- Spawn Points — zone-scoped `spawn2` diffing and sync, matched by coordinate
- Spawngroups — spawngroup fields (`spawn_limit`, wander box, timing) and rosters, source vs sink, synced together
- Grids — patrol path (`grid`/`grid_entries`) diffing and sync
- Loot / Faction / Spells / Merchant — read-only source-vs-sink comparisons for every shared reference table an NPC can point at

**Safety**
- TODO checklist — shared references get queued for manual review on every sync instead of being blindly overwritten, with a zone-scoped, dismissible tracking tab
- Missing-reference detection — flags any foreign key (loot table, faction, spells, merchant, spawn group, patrol grid) that points at a row which doesn't actually exist on that side
- Schema-drift tolerant — only ever writes columns that actually exist on the sink, so dev/live schema differences don't break a sync
- Nothing is ever guessed: shared or ambiguous data is always flagged for you to resolve, never silently merged

**Connectivity & UX**
- Dual DB connections, credentials saved locally
- SSH tunnel support, with real host-key verification against your own `~/.ssh/known_hosts`
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
5. Select the NPCs you want to bring over and click "Sync" to see a dry-run preview — exactly what will change, plus any loot/faction/spell references that will be queued as TODOs.
6. Click "Execute Sync" to write the selected `npc_types` rows to the sink inside a transaction. The diff view refreshes automatically so synced NPCs flip to "match".

The Spawn Points, Spawngroups, and Grids tabs follow the same diff → select → preview → sync pattern for their own tables. Loot, faction, spells, and merchant content is comparison-only for now (see Roadmap).

## Roadmap

- [x] `npc_types` diff and sync — dry-run preview, transactional execute with rollback on failure, schema-drift tolerant
- [x] TODO queue for shared references, persisted and surfaced in an in-app checklist tab (zone-scoped, dismissible — archive, not delete)
- [x] Spawn Points tab — zone-scoped `spawn2` diffing and sync, matched by coordinate; a spawn group reference that doesn't resolve on the sink is flagged, not blocked
- [x] Spawngroups tab — spawngroup fields and rosters, source vs sink, synced together as one action; ambiguous matches are flagged rather than guessed
- [x] Grids tab — zone-scoped diffing and syncing for patrol paths (`grid`/`grid_entries`)
- [x] SSH tunnel support, with private-key or password auth and `~/.ssh/known_hosts` verification
- [x] Shared reference table comparison (phase 1): read-only source-vs-sink views for faction, spells, merchant, and loot (`loottable → lootdrop → items`)
- [x] Missing-reference detection: flags a dangling faction/spells/merchant/loot-table/spawn-group/patrol-grid reference instead of silently showing nothing
- [ ] Shared reference table sync (phase 2): actually writing loot/faction/spells/merchant instead of only comparing and flagging — needs its own "is this shared row safe to touch" design, since these tables are referenced by many NPCs at once

## Contributing

Issues and PRs are welcome. This project is built to scratch a real itch (keeping EQEmu dev and live content in sync without hand-written SQL), so bug reports from anyone running an EQEmu server are especially useful — even if you're not touching the code.

## License

[MIT](LICENSE)
