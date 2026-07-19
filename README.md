# EQEmu Data Sync Tool

A domain-aware database diff & sync tool for [EverQuest Emulator](https://github.com/EQEmu/Server) (EQEmu) servers. Think **Navicat Data Compare**, but it actually understands the EQEmu schema — spawn chains, shared loot/faction/spell tables, and all.

![Go](https://img.shields.io/badge/Go-1.25-00ADD8?logo=go&logoColor=white)
![Wails](https://img.shields.io/badge/Wails-v2-DF0000)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
![Status](https://img.shields.io/badge/status-early--alpha-orange)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## Why this exists

If you run an EQEmu server, you've lived this: you build and test content — NPCs, spawns, loot — against a local or dev database, then need to push it to your live server. Generic DB sync tools don't know that `npc_types` is joined to `spawn2` through `spawngroup` and `spawnentry`, that `loottable_id` / `npc_faction_id` / `npc_spells_id` point at *shared* tables that can't be blindly overwritten per-NPC, or that your dev and live databases might have drifted schemas (136 columns vs. 131, in one real case).

**EQEmu Data Sync Tool** is purpose-built for this workflow: connect to a source and sink database, pick a zone, and get an instant, field-level diff of every NPC in it — color-coded, sortable, and safe by design (it queues anything it can't sync safely instead of guessing).

## Features

### Available now
- **Dual DB connections** — connect to a source (dev) and sink (live) MariaDB/MySQL database side by side; credentials are saved locally so you only enter them once
- **Zone browser** — searchable list of every zone in the source database, version-aware (EQEmu zones are keyed by `short_name` + `version`, so same-named zones with different content revisions are shown and synced separately)
- **Schema-aware NPC diffing** — walks the real `spawn2 → spawngroup → spawnentry → npc_types` join chain and diffs *every* column, not a hardcoded subset. Also detects quest-spawned NPCs (e.g. Vex Thal) that have no static spawn point at all, via zone-ID-range matching, so they show up in the diff instead of being invisible — marked with a ⚡ badge
- **Field-level detail view** — collapsible sections (Identity, Combat, Resistances, Ability Scores, Behavior, References) with differing values highlighted
- **Color-coded status** — new / modified / removed / match, at a glance
- **Sortable, filterable, multi-select diff table** — filter to just the differences, sort by status/name/ID, select the NPCs you care about
- **`npc_types` sync, with dry-run preview** — select NPCs, preview exactly what will change (and what won't be touched), then execute inside a transaction that rolls back on any error; automatically handles source/sink schema drift (e.g. 136 columns vs. 131) by only writing columns the sink actually has
- **TODO queue, with an in-app checklist tab** — loot/faction/spell/merchant/alt-currency references get queued on every sync instead of being blindly overwritten. A dedicated TODO tab (next to NPCs) shows them zone-scoped, grouped by type, with a Gmail-archive-style dismiss/restore so you can work through a zone's checklist and hide what you've already reviewed without deleting the record
- **Spawn point creation for new NPCs** — opt-in ("Create spawn points" checkbox) creation of a `spawngroup`/`spawnentry`/`spawn2` chain for a new NPC that needs one, instead of leaving it permanently blocked. Scoped to just that NPC, not a zone-wide replace — and it won't touch anything if the source's spawn location already matches an existing sink spawn point, flagging that for manual review instead of guessing. Patrol pathing (`grid`) isn't synced yet, so spawned NPCs stand still rather than patrolling
- **Spawn Points tab** — a third tab (next to NPCs/TODO) that diffs `spawn2` directly, zone-scoped, matched by coordinate since a `spawn2` row's own ID has no meaning across two diverged databases. Field-level changes (respawn time, variance, heading, enabled, etc.) sync with a plain update; a spawngroup's spawn entries are never bundled into that batch sync — shared spawngroups (one used at dozens of physical locations) are flagged with a "shared ×N" badge instead of being silently cloned, and if an entry's NPC no longer resolves on one side, its name is recovered from the other database instead of showing a bare "unknown"
- **Sync Spawn Group Entries** — a dedicated, per-spawngroup action (separate from the batch spawn2 sync) for actually bringing a spawngroup's NPC roster in line with source, since a spawngroup has no zone column of its own and could theoretically be shared outside the zone you're working on. Before writing anything, it checks whether the sink's spawngroup is referenced by any `spawn2` row outside the current zone/version — if so, it refuses outright rather than risk silently changing spawns somewhere unreviewed. A companion "select all locations sharing this spawngroup" action makes it fast to gather every affected spawn2 row first
- **Grids tab** — a fourth tab diffing `grid`/`grid_entries` (patrol pathing), zone-scoped. Simpler than the Spawn Points tab: `grid.id` is scoped to one zone and isn't auto-generated, so it's trusted as identity directly — no coordinate matching needed — and a grid isn't shared across unrelated things the way a spawngroup is, so both its fields and its full waypoint list sync together in one action
- **Spawngroups tab** — a fifth tab, a zone-scoped, spawngroup-first view (source vs sink side by side) answering the workflow gap the other tabs work around: knowing which spawngroups belong to the zone you're revamping, and what their own settings (`spawn_limit`, wander box, timing) look like — not just their entries. Matched indirectly, since a spawngroup has no zone column and its ID isn't portable across databases; if a source spawngroup's locations resolve to more than one sink spawngroup, it's flagged for manual review instead of guessed. Syncing a spawngroup always brings both its fields and its entries in line together — never one without the other
- **Resizable, collapsible sidebar and detail panel** — drag either edge to resize, or collapse the sidebar to a thin rail when you're not actively switching zones; both preferences (plus width) persist across restarts

### In progress
- **SSH tunneling** — for connecting to databases that aren't exposed directly (config fields exist; not wired up yet)
- **Per-item deselection in the sync preview** — the preview currently syncs exactly what you checked in the diff view; there's no way to uncheck an individual NPC once you're on the preview screen
- **Safely syncing shared reference tables** (loot, faction, spells, merchant inventory, alternate currency) instead of only flagging them for manual follow-up — deferred because these tables are shared across many NPCs, so a naive overwrite risks corrupting loot/faction/spells for every other NPC referencing the same row

> This is an early-stage, actively-developed project. Diffing, `npc_types` sync, per-NPC spawn point creation, the Spawn Points tab, the Grids tab, and the Spawngroups tab all work today. See [Roadmap](#roadmap).

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

## Roadmap

- [x] Execute sync: write `npc_types` (upsert) to the sink DB inside a transaction, with rollback on failure
- [x] Persist the TODO queue (loot tables, factions, spells) to `~/.config/eqemu-sync/todo.json` for manual follow-up
- [x] Dry-run mode surfaced in the UI before executing a real sync
- [x] Per-NPC `spawngroup`/`spawnentry`/`spawn2` creation for new NPCs that need a spawn point (opt-in, coordinate-conflict-safe)
- [x] In-app TODO checklist tab, zone-scoped, dismissible (archive, not delete)
- [x] Spawn Points tab: zone-scoped diffing for `spawn2`, with spawngroup/spawnentry composition always flagged for review
- [x] Sync Spawn Group Entries: dedicated action to bring a spawngroup's NPC roster in line with source, blocked outright if the spawngroup is shared outside the current zone
- [x] Grids tab: zone-scoped diffing and syncing for `grid`/`grid_entries` (patrol pathing)
- [x] Spawngroups tab: zone-scoped, spawngroup-first diffing (source vs sink side by side), matched by looking up the sink spawngroup(s) at a source spawngroup's member spawn2 coordinates, with ambiguous matches flagged rather than guessed. Diffs a spawngroup's own fields (`spawn_limit`, wander settings, etc.) for the first time, and syncs them together with entries as one action
- [ ] SSH tunnel support for remote database connections
- [ ] Per-item deselection within the sync preview
- [ ] Safely sync shared reference tables (loot, faction, spells, merchant inventory, alternate currency) instead of only flagging them as manual TODO items

## Contributing

Issues and PRs are welcome. This project is built to scratch a real itch (keeping EQEmu dev and live content in sync without hand-written SQL), so bug reports from anyone running an EQEmu server are especially useful — even if you're not touching the code.

## License

[MIT](LICENSE)
