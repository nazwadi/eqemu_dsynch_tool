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
- **Zone browser** — searchable list of every zone in the source database
- **Schema-aware NPC diffing** — walks the real `spawn2 → spawngroup → spawnentry → npc_types` join chain and diffs *every* column, not a hardcoded subset
- **Field-level detail view** — collapsible sections (Identity, Combat, Resistances, Ability Scores, Behavior, References) with differing values highlighted
- **Color-coded status** — new / modified / removed / match, at a glance
- **Sortable, filterable, multi-select diff table** — filter to just the differences, sort by status/name/ID, select the NPCs you care about
- **`npc_types` sync, with dry-run preview** — select NPCs, preview exactly what will change (and what won't be touched), then execute inside a transaction that rolls back on any error; automatically handles source/sink schema drift (e.g. 136 columns vs. 131) by only writing columns the sink actually has
- **TODO queue** — loot tables, factions, and spells referenced by synced NPCs are queued to `~/.config/eqemu-sync/todo.json` for manual review instead of being blindly overwritten, since those tables are shared across NPCs

### In progress
- **Zone-wide spawn/grid sync** — writing `spawn2` / `spawngroup` / `spawnentry` / `grid` / `grid_entries` changes from source → sink (currently only `npc_types` rows are synced; spawn placement is not)
- **SSH tunneling** — for connecting to databases that aren't exposed directly (config fields exist; not wired up yet)

> This is an early-stage, actively-developed personal project. Diffing and `npc_types` sync work today; spawn/grid placement sync does not yet. See [Roadmap](#roadmap).

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
- [ ] Zone-wide replace of `spawn2` / `spawngroup` / `spawnentry` / `grid` / `grid_entries`
- [ ] SSH tunnel support for remote database connections

## Contributing

Issues and PRs are welcome. This project is built to scratch a real itch (keeping EQEmu dev and live content in sync without hand-written SQL), so bug reports from anyone running an EQEmu server are especially useful — even if you're not touching the code.

## License

[MIT](LICENSE)
