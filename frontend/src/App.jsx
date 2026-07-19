import {useEffect, useRef, useState} from 'react';
import './App.css';
import {
    CompareSpawns,
    CompareZones,
    Connect,
    GetZones,
    LoadConfig,
    LoadTODOItems,
    SaveConfig,
    SetTODOItemDismissed,
    Sync,
    SyncSpawnGroupEntries,
    SyncSpawnPoints
} from "../wailsjs/go/main/App";

function App() {
    const [zones, setZones] = useState([])
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
    const [activeModal, setActiveModal] = useState(null)
    const [connectError, setConnectError] = useState(null)
    const [connecting, setConnecting] = useState(false)
    const connectModalRef = useRef(null)
    const syncConfirmModalRef = useRef(null)
    const [searchFilter, setSearchFilter] = useState('')
    const [selectedZoneShortName, setSelectedZoneShortName] = useState('')
    const [selectedZoneLongName, setSelectedZoneLongName] = useState('')
    const [selectedZoneId, setSelectedZoneId] = useState(null)
    const [selectedZoneVersion, setSelectedZoneVersion] = useState(0)
    const [selectedZoneIdNumber, setSelectedZoneIdNumber] = useState(null)
    const [selectedNpc, setSelectedNpc] = useState(null)
    const [diffRows, setDiffRows] = useState([])
    const [diffLoading, setDiffLoading] = useState(false)
    const [sourceConnected, setSourceConnected] = useState(false)
    const [sinkConnected, setSinkConnected] = useState(false)
    const [diffFilter, setDiffFilter] = useState('all')
    const [selectedRowKey, setSelectedRowKey] = useState(null)
    const [sortBy, setSortBy] = useState('status')
    const [sortDir, setSortDir] = useState('asc')
    const statusOrder = {'new': 0, 'modified': 1, 'removed': 2, 'match': 3}
    const [detailWidth, setDetailWidth] = useState(240)
    const [selectedNPCs, setSelectedNPCs] = useState(new Set())
    const [showSyncPreview, setShowSyncPreview] = useState(false)
    const [syncPreview, setSyncPreview] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [syncOutcome, setSyncOutcome] = useState(null)
    const [showSyncConfirm, setShowSyncConfirm] = useState(false)
    const [syncSpawns, setSyncSpawns] = useState(false)
    const [activeView, setActiveView] = useState('npcs') // 'npcs' | 'todo' | 'spawns'
    const [todoItems, setTodoItems] = useState([])
    const [showDismissedTodos, setShowDismissedTodos] = useState(false)

    // Spawns tab
    const [spawnDiffRows, setSpawnDiffRows] = useState([])
    const [spawnDiffLoading, setSpawnDiffLoading] = useState(false)
    const [selectedSpawnKeys, setSelectedSpawnKeys] = useState(new Set()) // coordinate-based keys — spawn2 has no cross-database ID
    const [showSpawnSyncPreview, setShowSpawnSyncPreview] = useState(false)
    const [spawnSyncPreview, setSpawnSyncPreview] = useState(null)
    const [spawnSyncing, setSpawnSyncing] = useState(false)
    const [spawnSyncOutcome, setSpawnSyncOutcome] = useState(null)
    const [showSpawnSyncConfirm, setShowSpawnSyncConfirm] = useState(false)
    const [selectedSpawnRow, setSelectedSpawnRow] = useState(null)
    const [spawnDiffFilter, setSpawnDiffFilter] = useState('all')
    const [spawnSortBy, setSpawnSortBy] = useState('status')  // 'status' | 'spawngroup' | 'shared'
    const [spawnSortDir, setSpawnSortDir] = useState('asc')
    const [spawnSearchFilter, setSpawnSearchFilter] = useState('')  // matches spawngroup name or any spawn entry's NPC name
    const spawnSyncConfirmModalRef = useRef(null)
    const [showSpawnHelp, setShowSpawnHelp] = useState(false)  // right-edge drawer explaining spawn2→spawngroup→spawn entries; see the Spawn Point Detail panel's "?" button
    const spawnHelpDrawerRef = useRef(null)
    const [showSpawnGroupEntriesConfirm, setShowSpawnGroupEntriesConfirm] = useState(false)
    const [spawnGroupEntriesPreview, setSpawnGroupEntriesPreview] = useState(null)  // dry-run SpawnGroupEntriesSyncResult, null while loading
    const [spawnGroupEntriesError, setSpawnGroupEntriesError] = useState(null)  // unexpected Go-level error, separate from the "blocked"/"not found" outcomes the result itself carries
    const [syncingSpawnGroupEntries, setSyncingSpawnGroupEntries] = useState(false)
    const spawnGroupEntriesConfirmModalRef = useRef(null)

    function refreshTodoItems() {
        LoadTODOItems().then(items => setTodoItems(items ?? [])).catch(err => console.error("load todo items failed:", err))
    }

    function toggleTodoDismissed(item) {
        SetTODOItemDismissed(item.ID, !item.Dismissed).then(refreshTodoItems).catch(err => console.error("toggle todo dismissed failed:", err))
    }

    function jumpToNpc(npcId) {
        setActiveView('npcs')
        const row = diffRows.find(r => (r.Source?.Id ?? r.Sink?.Id) === npcId)
        if (row) {
            setSelectedNpc(row)
            setSelectedRowKey(`${row.Source?.Id ?? ''}-${row.Sink?.Id ?? ''}`)
        }
    }

    useEffect(() => {
        refreshTodoItems()
    }, [])

    useEffect(() => {
        if (activeModal) connectModalRef.current?.focus()
    }, [activeModal])

    useEffect(() => {
        if (showSyncConfirm) syncConfirmModalRef.current?.focus()
    }, [showSyncConfirm])

    useEffect(() => {
        if (showSpawnSyncConfirm) spawnSyncConfirmModalRef.current?.focus()
    }, [showSpawnSyncConfirm])

    useEffect(() => {
        if (showSpawnHelp) spawnHelpDrawerRef.current?.focus()
    }, [showSpawnHelp])

    useEffect(() => {
        if (showSpawnGroupEntriesConfirm) spawnGroupEntriesConfirmModalRef.current?.focus()
    }, [showSpawnGroupEntriesConfirm])

    function needsSpawnPoint(row) {
        return row.Status === 'new' && row.Source?.HasSpawnPoint && !syncSpawns
    }

    function runSync(dryRun) {
        return Sync({
            ZoneShortName: selectedZoneShortName,
            ZoneVersion: selectedZoneVersion,
            ZoneIdNumber: selectedZoneIdNumber,
            SyncNPCTypes: true,
            SyncSpawns: syncSpawns,
            DryRun: dryRun,
            NPCIds: Array.from(selectedNPCs)
        })
    }

    function executeSync() {
        setSyncing(true)
        runSync(false)
            .then(result => {
                setSyncOutcome(result)
                setSelectedNPCs(new Set())
                setSelectedNpc(null)
                setSelectedRowKey(null)
                refreshTodoItems()
                return CompareZones(selectedZoneShortName, selectedZoneVersion, selectedZoneIdNumber).then(setDiffRows)
            })
            .catch(err => setSyncOutcome({Errors: [String(err)]}))
            .finally(() => setSyncing(false))
    }

    // spawn2 has no cross-database ID (see CLAUDE.md's Spawn point identity note) — coordinates
    // are the only stable identity, so every spawn row helper keys off them instead of an id.
    function spawnCoords(row) {
        const point = row.Source ?? row.Sink
        return [point?.Fields?.x, point?.Fields?.y, point?.Fields?.z].map(Number)
    }

    function spawnKey(row) {
        return spawnCoords(row).join(',')
    }

    // A "modified" row can differ in its own spawn2 fields, its spawn entries, or both — but Sync
    // only ever fixes the former (spawn entries are never auto-synced, see spawnEntriesOnly below).
    // A row that's "modified" purely because its spawn entries differ has nothing for Sync to do;
    // letting it stay checkbox-selectable would produce a no-op UPDATE that looks like progress
    // while the actual (unsyncable) difference is still sitting there unresolved.
    function spawnRowSelectable(row) {
        if (row.Status === 'new') return true
        if (row.Status === 'modified') return row.FieldsDiffer
        return false
    }

    // True when a "modified" row's only difference is its spawn entries — nothing here for Sync to
    // change. Used to visually separate "this needs syncing" from "this needs manual review" instead
    // of lumping both under one yellow "modified" treatment.
    function spawnEntriesOnly(row) {
        return row.Status === 'modified' && !row.FieldsDiffer
    }

    function spawnRowMatchesSearch(row, query) {
        if (!query.trim()) return true
        const q = query.trim().toLowerCase()
        return [row.Source, row.Sink].filter(Boolean).some(point =>
            (point.SpawnGroupFields?.name ?? '').toLowerCase().includes(q) ||
            (point.Pool ?? []).some(pe => (pe.NPCName ?? '').toLowerCase().includes(q))
        )
    }

    function loadSpawnDiffs() {
        if (!selectedZoneShortName) return
        setSpawnDiffLoading(true)
        setSpawnDiffRows([])
        CompareSpawns(selectedZoneShortName, selectedZoneVersion)
            .then(setSpawnDiffRows)
            .catch(err => console.error("compare spawns failed:", err))
            .finally(() => setSpawnDiffLoading(false))
    }

    function runSpawnSync(dryRun) {
        const selectedRows = spawnDiffRows.filter(row => selectedSpawnKeys.has(spawnKey(row)))
        return SyncSpawnPoints({
            ZoneShortName: selectedZoneShortName,
            ZoneVersion: selectedZoneVersion,
            DryRun: dryRun,
            SpawnIds: selectedRows.filter(row => row.Status === 'modified').map(row => row.Sink.Id),
            NewSpawnCoords: selectedRows.filter(row => row.Status === 'new').map(spawnCoords)
        })
    }

    function executeSpawnSync() {
        setSpawnSyncing(true)
        runSpawnSync(false)
            .then(result => {
                setSpawnSyncOutcome(result)
                setSelectedSpawnKeys(new Set())
                setSelectedSpawnRow(null)
                loadSpawnDiffs()
            })
            .catch(err => setSpawnSyncOutcome({Errors: [String(err)]}))
            .finally(() => setSpawnSyncing(false))
    }

    function fmtCoord(n) {
        return Number.isFinite(n) ? n.toFixed(1) : '—'
    }

    // A spawngroup with one spawn entry is a normal single-NPC spawn; more than one means it's a
    // weighted spawngroup shared across whichever NPCs are listed — surfaced here instead of just
    // showing a count so "what's here" is visible without opening the detail panel. Terminology
    // matches the EQEmu tables/editor (spawngroup, spawn entry), not a generic "pool", per direct
    // feedback that "Pool" wasn't recognizable vocabulary for someone editing this schema day to day.
    // Deliberately doesn't say "spawngroup" itself — spawnRowLabel() below prefixes that label
    // so it's clear this text is a preview of the linked spawngroup's contents, not the row's
    // own identity (the row is a spawn2 location; see the diff list's explanatory caption).
    function spawnPoolSummary(point) {
        if (!point || !point.Pool || point.Pool.length === 0) return '(no spawn entries)'
        if (point.Pool.length === 1) return point.Pool[0].NPCName || `NPC ${point.Pool[0].NPCID}`
        return `${point.Pool.length} NPCs`
    }

    // The one-line "coordinates · spawngroup: preview" text used everywhere a spawn2 row is
    // rendered as a single line (diff list, sync preview) — keeps the spawn2-vs-spawngroup
    // distinction consistent instead of re-templating it at each call site.
    function spawnRowLabel(point) {
        if (!point) return '-'
        return `(${fmtCoord(Number(point.Fields.x))}, ${fmtCoord(Number(point.Fields.y))}, ${fmtCoord(Number(point.Fields.z))}) · spawngroup: ${spawnPoolSummary(point)}`
    }

    // Merges source/sink spawn entries by NPCID so the detail panel can show a single table with
    // both sides' chance side by side, the same shape as the field-level source→sink comparisons
    // elsewhere in the detail panel.
    function spawnEntryRows(row) {
        const byId = new Map()
        for (const pe of row.Source?.Pool ?? []) {
            byId.set(pe.NPCID, {npcId: pe.NPCID, name: pe.NPCName || `NPC ${pe.NPCID}`, srcChance: pe.Chance})
        }
        for (const pe of row.Sink?.Pool ?? []) {
            const existing = byId.get(pe.NPCID) ?? {npcId: pe.NPCID, name: pe.NPCName || `NPC ${pe.NPCID}`}
            existing.sinkChance = pe.Chance
            byId.set(pe.NPCID, existing)
        }
        return Array.from(byId.values())
            .map(r => ({...r, differs: r.srcChance !== r.sinkChance}))
            .sort((a, b) => a.name.localeCompare(b.name))
    }

    // Adds every other selectable location sharing the given row's spawngroup to the current
    // selection — the spawn2-level equivalent of the "shared ×N" badge, turned into an action.
    // Compares SpawnGroupId only within the same side (source-to-source, sink-to-sink) since
    // those IDs are independent auto-increment sequences from separate databases; a coincidental
    // numeric match across sides would be meaningless.
    function selectAllSharingSpawngroup(row) {
        const useSource = !!row.Source
        const anchor = useSource ? row.Source : row.Sink
        if (!anchor) return
        setSelectedSpawnKeys(prev => {
            const next = new Set(prev)
            spawnDiffRows
                .filter(r => (useSource ? r.Source : r.Sink)?.SpawnGroupId === anchor.SpawnGroupId)
                .filter(spawnRowSelectable)
                .forEach(r => next.add(spawnKey(r)))
            return next
        })
    }

    function runSyncSpawnGroupEntries(row, dryRun) {
        const point = row.Source ?? row.Sink
        return SyncSpawnGroupEntries({
            ZoneShortName: selectedZoneShortName,
            ZoneVersion: selectedZoneVersion,
            X: point.Fields.x,
            Y: point.Fields.y,
            Z: point.Fields.z,
            DryRun: dryRun
        })
    }

    function openSyncSpawnGroupEntriesPreview(row) {
        setShowSpawnGroupEntriesConfirm(true)
        setSpawnGroupEntriesPreview(null)
        setSpawnGroupEntriesError(null)
        runSyncSpawnGroupEntries(row, true)
            .then(setSpawnGroupEntriesPreview)
            .catch(err => setSpawnGroupEntriesError(String(err)))
    }

    function executeSyncSpawnGroupEntries() {
        if (!selectedSpawnRow) return
        setSyncingSpawnGroupEntries(true)
        runSyncSpawnGroupEntries(selectedSpawnRow, false)
            .then(() => {
                setShowSpawnGroupEntriesConfirm(false)
                setSpawnGroupEntriesPreview(null)
                setSelectedSpawnRow(null)
                loadSpawnDiffs()
            })
            .catch(err => setSpawnGroupEntriesError(String(err)))
            .finally(() => setSyncingSpawnGroupEntries(false))
    }

    // x/y/z are the coordinate-matching key itself (see CLAUDE.md's "Spawn point identity" note) —
    // a matched row's source and sink are guaranteed identical on these three by construction, so
    // showing them as a source→sink diff pair would always be blank noise. They're rendered once,
    // as static identity, not as a diffable field group. `heading` is a genuine spawn2 column that
    // can vary independently, so it's treated as an ordinary Behavior field instead.
    const spawnIdentityFieldNames = ['x', 'y', 'z']

    // Fields most worth a glance first — a soft ordering hint, not an exhaustive/authoritative list
    // (unlike fieldGroups on the NPC panel). Anything not named here still shows, just after these,
    // alphabetically — same drift-tolerant philosophy as the rest of the spawn2 column handling.
    const spawnPriorityFieldNames = ['respawntime', 'variance', 'pathgrid', 'enabled']

    // spawn2 has far fewer columns than npc_types and no established grouping convention like
    // the NPC detail panel's fieldGroups, so instead of hardcoding a column list that could drift
    // from either database's schema, Behavior is just "whatever spawn2 columns aren't the identity
    // coordinates" — the same drift-tolerant approach getSpawnPointsForZone already takes on the Go side.
    function spawnBehaviorFields(row) {
        const allFields = new Set([
            ...Object.keys(row.Source?.Fields ?? {}),
            ...Object.keys(row.Sink?.Fields ?? {})
        ])
        const remaining = Array.from(allFields).filter(f => !spawnIdentityFieldNames.includes(f))
        const priority = spawnPriorityFieldNames.filter(f => remaining.includes(f))
        const rest = remaining.filter(f => !spawnPriorityFieldNames.includes(f)).sort()
        return [...priority, ...rest]
    }

    function connect() {
        setConnectError(null)
        setConnecting(true)
        const config = {
            Host: activeModal === 'source' ? sourceHost : sinkHost,
            Port: activeModal === 'source' ? sourcePort : sinkPort,
            Username: activeModal === 'source' ? sourceUsername : sinkUsername,
            Password: activeModal === 'source' ? sourcePassword : sinkPassword,
            DbName: activeModal === 'source' ? dbSourceName : dbSinkName
        }
        const isSource = activeModal === 'source'
        Connect(config, isSource)
            .then(() => isSource ? GetZones() : Promise.resolve())
            .then(zones => {
                if (isSource) {
                    setZones(zones)
                    setSourceConnected(true)
                } else {
                    setSinkConnected(true)
                }
                setActiveModal(null)
                SaveConfig({
                    Source: {
                        Host: sourceHost,
                        Port: sourcePort,
                        Username: sourceUsername,
                        Password: sourcePassword,
                        DbName: dbSourceName
                    },
                    Sink: {
                        Host: sinkHost,
                        Port: sinkPort,
                        Username: sinkUsername,
                        Password: sinkPassword,
                        DbName: dbSinkName
                    }
                }).catch(err => console.error("save config failed:", err))
            })
            .catch(err => setConnectError(String(err)))
            .finally(() => setConnecting(false))
    }

    useEffect(() => {
        LoadConfig()
            .then(config => {
                setSourceHost(config.Source.Host)
                setSourcePort(config.Source.Port)
                setSourceUsername(config.Source.Username)
                setSourcePassword(config.Source.Password)
                setDbSourceName(config.Source.DbName)
                setSinkHost(config.Sink.Host)
                setSinkPort(config.Sink.Port)
                setSinkUsername(config.Sink.Username)
                setSinkPassword(config.Sink.Password)
                setDbSinkName(config.Sink.DbName)

                // auto-connect source
                Connect(config.Source, true)
                    .then(() => GetZones())
                    .then(zones => {
                        setZones(zones)
                        setSourceConnected(true)
                    })
                    .catch(() => {
                    })

                // auto-connect sink
                Connect(config.Sink, false)
                    .then(() => setSinkConnected(true))
                    .catch(() => {
                    })
            })
            .catch(() => {
            }) // ignore if no config file yet
    }, [])

    const newCount = diffRows.filter(r => r.Status === 'new').length
    const removedCount = diffRows.filter(r => r.Status === 'removed').length
    const modifiedCount = diffRows.filter(r => r.Status === 'modified').length
    // Matches the Spawns tab badge's semantics (new+modified, i.e. "needs a look"), not
    // diffRows.length — otherwise this number would count "removed"/"match" rows too, which
    // aren't actionable and are already visible via the +/~/- badges when this tab is active.
    const npcActionableCount = newCount + modifiedCount
    const selectableRows = diffRows.filter(row => (diffFilter === 'all' || row.Status !== 'match') && !needsSpawnPoint(row))
    const zoneTodoItems = todoItems.filter(t => t.ZoneName === selectedZoneShortName && t.ZoneVersion === selectedZoneVersion)
    const openZoneTodoCount = zoneTodoItems.filter(t => !t.Dismissed).length
    const spawnNewCount = spawnDiffRows?.filter(r => r.Status === 'new').length
    const spawnModifiedCount = spawnDiffRows?.filter(r => r.Status === 'modified').length
    const spawnRemovedCount = spawnDiffRows?.filter(r => r.Status === 'removed').length
    const selectableSpawnRows = spawnDiffRows?.filter(spawnRowSelectable)
    // Variables for npc_types detail view
    const [expandedSections, setExpandedSections] = useState({
        identity: true,
        combat: true,
        resistances: false,
        ability_scores: false,
        behavior: false,
        references: true,
        spawn_behavior: true,
        spawn_pool: true
    })
    const fieldGroups = {
        identity: ['name', 'lastname', 'race', 'class', 'gender', 'bodytype', 'size', 'texture', 'helmtexture', 'model'],
        combat: ['level', 'maxlevel', 'scalerate', 'hp', 'mana', 'AC', 'ATK', 'mindmg', 'maxdmg', 'attack_count', 'attack_speed', 'attack_delay', 'hp_regen_rate', 'mana_regen_rate'],
        resistances: ['MR', 'CR', 'DR', 'FR', 'PR', 'Corrup', 'PhR'],
        ability_scores: ['STR', 'STA', 'DEX', 'AGI', 'INT', 'WIS', 'CHA'],
        behavior: ['aggroradius', 'assistradius', 'npc_aggro', 'always_aggro', 'see_invis', 'see_invis_undead', 'see_hide', 'trackable', 'flymode'],
        references: ['loottable_id', 'npc_spells_id', 'npc_faction_id', 'merchantid', 'alt_currency_id']
    }

    return (
        <div id="App" className="h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
            {activeModal && <div
                ref={connectModalRef}
                tabIndex={-1}
                onKeyDown={e => {
                    if (e.key === 'Escape') {
                        e.preventDefault()
                        setActiveModal(null)
                        setConnectError(null)
                    }
                }}
                className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
                <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-medium">{activeModal === 'source' ? 'Connect Source' : 'Connect Sink'}</h2>
                        <button onClick={() => {
                            setActiveModal(null)
                            setConnectError(null)
                        }}>✕</button>
                    </div>
                    <label>Host</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                           value={activeModal === 'source' ? sourceHost : sinkHost}
                           onChange={e => activeModal === 'source' ? setSourceHost(e.target.value) : setSinkHost(e.target.value)}
                           autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                    <label>Port</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                           value={activeModal === 'source' ? sourcePort : sinkPort}
                           onChange={e => activeModal === 'source' ? setSourcePort(e.target.value) : setSinkPort(e.target.value)}/>
                    <label>Username</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                           value={activeModal === 'source' ? sourceUsername : sinkUsername}
                           onChange={e => activeModal === 'source' ? setSourceUsername(e.target.value) : setSinkUsername(e.target.value)}
                           autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                    <label>Password</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                           value={activeModal === 'source' ? sourcePassword : sinkPassword}
                           onChange={e => activeModal === 'source' ? setSourcePassword(e.target.value) : setSinkPassword(e.target.value)}
                           type="password"/>
                    <label>Database</label>
                    <input className="border border-gray-600 bg-gray-700 rounded px-2 py-1"
                           value={activeModal === 'source' ? dbSourceName : dbSinkName}
                           onChange={e => activeModal === 'source' ? setDbSourceName(e.target.value) : setDbSinkName(e.target.value)}
                           autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                    {connectError && (
                        <div className="text-xs text-red-400 bg-red-950 border border-red-800 rounded px-2 py-1">
                            {connectError}
                        </div>
                    )}
                    <button onClick={connect} disabled={connecting}>
                        {connecting ? 'Connecting…' : (activeModal === 'source' ? 'Connect Source' : 'Connect Sink')}
                    </button>
                </div>
            </div>}
            {showSyncConfirm && (
                <div
                    ref={syncConfirmModalRef}
                    tabIndex={-1}
                    onKeyDown={e => {
                        if (e.key === 'Escape') {
                            e.preventDefault()
                            setShowSyncConfirm(false)
                        }
                    }}
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
                    <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-medium">Confirm Sync</h2>
                            <button onClick={() => setShowSyncConfirm(false)}>✕</button>
                        </div>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            {syncPreview?.NPCsSynced?.length ?? 0} NPCs will be upserted
                            {syncPreview?.Skipped?.length > 0 && ` (${syncPreview.Skipped.length} skipped, see preview)`}
                        </div>
                        {syncPreview?.SpawnsSynced > 0 && (
                            <div className="text-sm text-cyan-400">
                                {syncPreview.SpawnsSynced} new spawn point{syncPreview.SpawnsSynced === 1 ? '' : 's'} will be created ({syncPreview.SpawnsCreatedForNPCs?.length ?? 0} NPCs)
                            </div>
                        )}
                        <div className="text-sm text-gray-300">
                            {syncPreview?.TODOItems?.length ?? 0} TODO items will be queued
                        </div>
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowSyncConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowSyncConfirm(false)
                                    executeSync()
                                }}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300">
                                Sync Now →
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showSpawnSyncConfirm && (
                <div
                    ref={spawnSyncConfirmModalRef}
                    tabIndex={-1}
                    onKeyDown={e => {
                        if (e.key === 'Escape') {
                            e.preventDefault()
                            setShowSpawnSyncConfirm(false)
                        }
                    }}
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
                    <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-medium">Confirm Sync</h2>
                            <button onClick={() => setShowSpawnSyncConfirm(false)}>✕</button>
                        </div>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            {spawnSyncPreview?.Created ?? 0} spawn point{spawnSyncPreview?.Created === 1 ? '' : 's'} will be created
                        </div>
                        <div className="text-sm text-gray-300">
                            {spawnSyncPreview?.Updated ?? 0} spawn point{spawnSyncPreview?.Updated === 1 ? '' : 's'} will be updated
                            {spawnSyncPreview?.Skipped?.length > 0 && ` (${spawnSyncPreview.Skipped.length} skipped, see preview)`}
                        </div>
                        <div className="text-sm text-cyan-400">
                            A spawn point's spawngroup (its spawn entries) is never changed by this action — differences are flagged, not synced.
                        </div>
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowSpawnSyncConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    setShowSpawnSyncConfirm(false)
                                    executeSpawnSync()
                                }}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300">
                                Sync Now →
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showSpawnHelp && (
                <>
                    <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowSpawnHelp(false)}/>
                    <div
                        ref={spawnHelpDrawerRef}
                        tabIndex={-1}
                        onKeyDown={e => {
                            if (e.key === 'Escape') {
                                e.preventDefault()
                                setShowSpawnHelp(false)
                            }
                        }}
                        className="fixed top-0 right-0 bottom-0 w-96 max-w-full bg-gray-800 border-l border-gray-700 z-50 outline-none flex flex-col shadow-2xl">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                            <h2 className="text-sm font-medium text-gray-200">How spawn points fit together</h2>
                            <button onClick={() => setShowSpawnHelp(false)}
                                    className="text-gray-400 hover:text-white">✕</button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm text-gray-300">
                            <p>
                                These three EQEmu tables form a strict hierarchy, not a many-to-many relationship:
                            </p>
                            <div className="rounded border border-gray-700 bg-gray-850 p-3 flex flex-col gap-2 text-xs">
                                <div>
                                    <div className="text-gray-200 font-medium">spawn2</div>
                                    <div className="text-gray-500">A physical location (x, y, z) in a zone. Each row in this tab's list is one spawn2.</div>
                                </div>
                                <div className="text-gray-600 pl-3">↓ every location points at exactly one spawngroup</div>
                                <div className="pl-3">
                                    <div className="text-gray-200 font-medium">spawngroup</div>
                                    <div className="text-gray-500">A named, reusable config. The same spawngroup can be pointed at by many spawn2 locations — that's what the "shared ×N" badge means. A location can never point at more than one spawngroup at once.</div>
                                </div>
                                <div className="text-gray-600 pl-6">↓ one spawngroup can hold many spawn entries</div>
                                <div className="pl-6">
                                    <div className="text-gray-200 font-medium">spawn entries</div>
                                    <div className="text-gray-500">Rows in the spawnentry table — each links the spawngroup to one NPC and a chance %. Every location sharing a spawngroup gets the exact same entries; there's no per-location override.</div>
                                </div>
                            </div>
                            <p>
                                In practice: "shared ×9, 2 NPCs" means one spawngroup reused at 9 physical spots, each always offering the same 2 possible NPCs.
                            </p>
                            <p className="text-gray-500">
                                A spawn2 row's own fields (coordinates, respawn timing, etc.) can be synced directly. Spawn entries are shared data — this tool always flags differences there for manual review instead of guessing which side is right.
                            </p>
                            <p className="text-gray-500">
                                Note on coordinates: the database (and this tool) store and display <span className="text-gray-300">X, Y, Z</span>. In-game, the <span className="text-gray-300">/loc</span> command reports <span className="text-gray-300">Y, X, Z</span> — a different order. The Location fields in the detail panel are labeled per-axis specifically so this never has to be guessed.
                            </p>
                        </div>
                    </div>
                </>
            )}
            {showSpawnGroupEntriesConfirm && (
                <div
                    ref={spawnGroupEntriesConfirmModalRef}
                    tabIndex={-1}
                    onKeyDown={e => {
                        if (e.key === 'Escape') {
                            e.preventDefault()
                            setShowSpawnGroupEntriesConfirm(false)
                        }
                    }}
                    className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
                    <div className="bg-gray-800 p-6 rounded-lg w-[28rem] flex flex-col gap-3 max-h-[80vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-2">
                            <h2 className="text-lg font-medium">Sync Spawn Entries</h2>
                            <button onClick={() => setShowSpawnGroupEntriesConfirm(false)}>✕</button>
                        </div>
                        {spawnGroupEntriesError ? (
                            <div className="text-sm text-red-400">{spawnGroupEntriesError}</div>
                        ) : !spawnGroupEntriesPreview ? (
                            <div className="text-xs text-gray-500">Checking…</div>
                        ) : spawnGroupEntriesPreview.NotFound ? (
                            <div className="text-sm text-amber-400">
                                No matching sink spawn point exists at this location yet — sync this spawn point itself first.
                            </div>
                        ) : spawnGroupEntriesPreview.OtherZoneUsage?.length > 0 ? (
                            <>
                                <div className="text-sm text-red-400">
                                    Blocked: spawngroup "{spawnGroupEntriesPreview.SpawnGroupName}" is also referenced outside this zone/version in the sink:
                                </div>
                                <div className="flex flex-col gap-1 text-xs text-gray-300">
                                    {spawnGroupEntriesPreview.OtherZoneUsage.map((u, i) => (
                                        <div key={i}>{u.Zone} (v{u.Version}) — {u.Count} location{u.Count === 1 ? '' : 's'}</div>
                                    ))}
                                </div>
                                <div className="text-sm text-gray-400">
                                    Syncing here would silently change spawns in a zone that hasn't been reviewed, so this is blocked. Reconcile it manually if that's really intended.
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="text-sm text-gray-300">
                                    You are about to write to:
                                    <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                                </div>
                                <div className="text-sm text-gray-300">
                                    Spawngroup "{spawnGroupEntriesPreview.SpawnGroupName}": {spawnGroupEntriesPreview.EntriesBefore} → {spawnGroupEntriesPreview.EntriesAfter} entries
                                </div>
                                <div className="flex flex-col gap-1 text-xs max-h-48 overflow-y-auto">
                                    <div className="flex text-gray-500">
                                        <span className="flex-1">NPC</span>
                                        <span className="w-24 text-right">Current (sink)</span>
                                        <span className="w-24 text-right">Will become</span>
                                    </div>
                                    {selectedSpawnRow && spawnEntryRows(selectedSpawnRow).map(({npcId, name, srcChance, sinkChance, differs}) => (
                                        <div key={npcId} className={`flex ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>
                                            <span className="flex-1">{name} ({npcId})</span>
                                            <span className="w-24 text-right">{sinkChance ?? '—'}</span>
                                            <span className="w-24 text-right">{srcChance ?? '—'}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="text-sm text-red-400">This cannot be undone.</div>
                                <div className="flex justify-end gap-2 mt-2">
                                    <button
                                        onClick={() => setShowSpawnGroupEntriesConfirm(false)}
                                        className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                        Cancel
                                    </button>
                                    <button
                                        disabled={syncingSpawnGroupEntries}
                                        onClick={executeSyncSpawnGroupEntries}
                                        className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {syncingSpawnGroupEntries ? 'Syncing…' : 'Sync Entries Now →'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            <div className="flex flex-1 min-h-0">
                <div className="w-64 bg-gray-900 border-b border-gray-700 flex flex-col h-full min-h-0">
                    <div
                        className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                        Connections
                    </div>
                    <div className="px-3 py-2 flex flex-col gap-2">
                        <div className="border border-gray-600 rounded p-2 flex justify-between items-center">
                            <div>
                                <div className="text-xs text-gray-400">Source</div>
                                <div
                                    className="text-xs text-white">{sourceConnected ? sourceHost : 'Not connected'}</div>
                            </div>
                            <div className="flex flex-items gap-2">
                                <div
                                    className={`w-2 h-2 rounded-full ${sourceConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <button onClick={() => {
                                    setActiveModal('source')
                                    setConnectError(null)
                                }}
                                        className="text-xs text-gray-400 border border-gray-600 rounded px-2 py-1 hover:text-white hover:border-gray-400">
                                    {sourceConnected ? 'Edit' : 'Connect'}
                                </button>
                            </div>
                        </div>
                        <div className="border border-gray-600 rounded p-2 flex justify-between items-center">
                            <div>
                                <div className="text-xs text-gray-400">Sink</div>
                                <div className="text-xs text-white">{sinkConnected ? sinkHost : 'Not connected'}</div>
                            </div>
                            <div className="flex flex-items gap-2">
                                <div
                                    className={`w-2 h-2 rounded-full ${sinkConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                                <button onClick={() => {
                                    setActiveModal('sink')
                                    setConnectError(null)
                                }}
                                        className="text-xs text-gray-400 border border-gray-600 rounded px-2 py-1 hover:text-white hover:border-gray-400">
                                    {sinkConnected ? 'Edit' : 'Connect'}
                                </button>
                            </div>
                        </div>
                    </div>
                    <div
                        className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-t border-b border-gray-700">
                        Zones
                    </div>
                    <div className="px-3 py-2">
                        <input className="w-full border border-gray-600 bg-gray-700 rounded px-2 py-1 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                               placeholder="Filter zones..."
                               value={searchFilter}
                               onChange={e => setSearchFilter(e.target.value)}
                               disabled={showSyncPreview || showSpawnSyncPreview}
                               autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                    </div>
                    <div className="overflow-y-auto flex-1 pl-4 pt-2">
                        <div className="overflow-y-auto">
                            <ul>
                                {zones
                                    .filter(zone =>
                                        zone.ShortName.toLowerCase().includes(searchFilter.toLowerCase()) ||
                                        zone.LongName.toLowerCase().includes(searchFilter.toLowerCase())
                                    )
                                    .map(zone => (
                                        <li
                                            onClick={() => {
                                                if (showSyncPreview || showSpawnSyncPreview) return
                                                setSelectedZoneShortName(zone.ShortName)
                                                setSelectedZoneLongName(zone.LongName)
                                                setSelectedZoneId(zone.Id)
                                                setSelectedZoneVersion(zone.Version)
                                                setSelectedZoneIdNumber(zone.ZoneIdNumber)
                                                setSelectedNPCs(new Set())
                                                setSelectedNpc(null)
                                                setSelectedRowKey(null)
                                                setDiffRows([])
                                                setDiffLoading(true)
                                                CompareZones(zone.ShortName, zone.Version, zone.ZoneIdNumber)
                                                    .then(setDiffRows)
                                                    .catch(err => console.error("compare zones failed:", err))
                                                    .finally(() => setDiffLoading(false))
                                                setSelectedSpawnKeys(new Set())
                                                setSelectedSpawnRow(null)
                                                setSpawnSyncPreview(null)
                                                setSpawnSyncOutcome(null)
                                                setSpawnDiffRows([])
                                                setSpawnDiffLoading(true)
                                                CompareSpawns(zone.ShortName, zone.Version)
                                                    .then(setSpawnDiffRows)
                                                    .catch(err => console.error("compare spawns failed:", err))
                                                    .finally(() => setSpawnDiffLoading(false))
                                            }}
                                            key={zone.Id}
                                            className={`truncate ${
                                                showSyncPreview || showSpawnSyncPreview ? 'opacity-40 cursor-not-allowed' :
                                                    selectedZoneId === zone.Id ? 'text-yellow-400 cursor-pointer' : 'cursor-pointer'
                                            }`}
                                        >
                                            {zone.LongName} <span className="text-gray-500 text-xs">({zone.ShortName} v{zone.Version})</span>
                                        </li>
                                    ))}
                            </ul>
                        </div>
                    </div>
                </div>
                {/* Zone NPC List View*/}
                <div id="input" className="w-1/2 flex flex-1 flex-col overflow-hidden">

                    {/* Persistent zone header - never slides */}
                    <div
                        className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 flex items-center gap-3">
                        {selectedZoneLongName} - {selectedZoneShortName}
                        {selectedZoneShortName && (
                            <span className="text-gray-500">(zone {selectedZoneIdNumber}, v{selectedZoneVersion})</span>
                        )}
                        {activeView === 'npcs' && diffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{newCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{modifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{removedCount}</span>
                        </>}
                        {activeView === 'spawns' && spawnDiffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{spawnNewCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{spawnModifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{spawnRemovedCount}</span>
                        </>}
                        {activeView === 'npcs' && (
                            <>
                                <label className={`flex items-center gap-1 text-xs ${showSyncPreview ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 cursor-pointer'}`}>
                                    <input type="checkbox"
                                           className="accent-yellow-400 cursor-pointer w-3 h-3 disabled:cursor-not-allowed"
                                           checked={syncSpawns}
                                           disabled={showSyncPreview}
                                           onChange={e => setSyncSpawns(e.target.checked)}
                                           title={showSyncPreview ? 'Go back to the diff view to change this — toggling it here would leave the preview out of sync with what executes' : 'When syncing a new NPC that needs a spawn point, also create it (spawngroup/spawnentry/spawn2) instead of skipping the NPC'}/>
                                    Create spawn points
                                </label>
                                <button
                                    disabled={selectedNPCs.size === 0 || showSyncPreview}
                                    className={`px-3 py-1 rounded text-xs font-medium ${
                                        selectedNPCs.size > 0 && !showSyncPreview
                                            ? 'bg-yellow-400 text-gray-900 cursor-pointer hover:bg-yellow-300'
                                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                                    onClick={() => {
                                        setShowSyncPreview(true)
                                        setSyncPreview(null)
                                        setSyncOutcome(null)
                                        runSync(true).then(setSyncPreview).catch(err => setSyncPreview({Errors: [String(err)]}))
                                    }}
                                >
                                    {selectedNPCs.size > 0 ? `Sync ${selectedNPCs.size} NPCs` : 'Sync NPCs'}
                                </button>
                            </>
                        )}
                        {activeView === 'spawns' && (
                            <button
                                disabled={selectedSpawnKeys.size === 0 || showSpawnSyncPreview}
                                className={`px-3 py-1 rounded text-xs font-medium ${
                                    selectedSpawnKeys.size > 0 && !showSpawnSyncPreview
                                        ? 'bg-yellow-400 text-gray-900 cursor-pointer hover:bg-yellow-300'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                                onClick={() => {
                                    setShowSpawnSyncPreview(true)
                                    setSpawnSyncPreview(null)
                                    setSpawnSyncOutcome(null)
                                    runSpawnSync(true).then(setSpawnSyncPreview).catch(err => setSpawnSyncPreview({Errors: [String(err)]}))
                                }}
                            >
                                {selectedSpawnKeys.size > 0 ? `Sync ${selectedSpawnKeys.size} Spawn Points` : 'Sync Spawn Points'}
                            </button>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={() => setActiveView('npcs')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'npcs' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                NPCs{npcActionableCount > 0 && ` (${npcActionableCount})`}
                            </button>
                            <button
                                onClick={() => setActiveView('spawns')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'spawns' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                Spawn Points{selectableSpawnRows?.length > 0 && ` (${selectableSpawnRows?.length})`}
                            </button>
                            <button
                                onClick={() => setActiveView('todo')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'todo' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                TODO{openZoneTodoCount > 0 && ` (${openZoneTodoCount})`}
                            </button>
                        </div>
                    </div>

                    {/* Sliding content area (NPCs tab) */}
                    {activeView === 'npcs' && (
                    <div className="flex-1 relative overflow-hidden">

                        {/* Diff View */}
                        <div className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out z-0 ${
                            showSyncPreview ? '-translate-x-full' : 'translate-x-0'
                        }`}>

                            <div className="flex gap-2 px-3 py-2 border-b border-gray-700">
                                <button
                                    onClick={() => setDiffFilter('all')}
                                    className={`text-xs px-3 py-1 rounded border ${diffFilter === 'all' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                    Show All
                                </button>
                                <button
                                    onClick={() => setDiffFilter('diff')}
                                    className={`text-xs px-3 py-1 rounded border ${diffFilter === 'diff' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                    Differences Only
                                </button>
                            </div>
                            <div className="flex gap-2 px-3 py-1 border-b border-gray-700 bg-gray-850">
                                {[
                                    {label: 'Status', value: 'status'},
                                    {label: 'Name', value: 'name'},
                                    {label: 'ID', value: 'id'},
                                ].map(sort => (
                                    <button
                                        key={sort.value}
                                        onClick={() => {
                                            if (sortBy === sort.value) {
                                                setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                                            } else {
                                                setSortBy(sort.value)
                                                setSortDir('asc')
                                            }
                                        }}
                                        className={`text-xs px-3 py-1 rounded border ${sortBy === sort.value ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                        {sort.label} {sortBy === sort.value ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center border-b border-gray-700 bg-gray-800">
                                <input type="checkbox"
                                       className="accent-yellow-400 cursor-pointer w-3 h-3 mx-2"
                                       title="NPCs that need a spawn point in the sink can't be synced yet — spawn placement isn't implemented"
                                       checked={selectableRows.length > 0 && selectableRows.every(row => selectedNPCs.has(row.Source?.Id ?? row.Sink?.Id))}
                                       onChange={(e) => {
                                           if (e.target.checked) {
                                               setSelectedNPCs(new Set(selectableRows.map(row => row.Source?.Id ?? row.Sink?.Id)))
                                           } else {
                                               setSelectedNPCs(new Set())
                                           }
                                       }}
                                />
                                <div className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider">
                                    Source: {dbSourceName}
                                </div>
                                <div
                                    className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider border-l border-gray-700">
                                    Sink: {dbSinkName}
                                </div>
                            </div>
                            {/*Diff List of NPCs*/}
                            {diffLoading ? (
                                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                                    Loading NPCs…
                                </div>
                            ) : diffRows.length === 0 && selectedZoneShortName ? (
                                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                    No NPCs found in this zone
                                </div>
                            ) : (
                                <div className="flex flex-1 min-h-0 overflow-hidden flex-col overflow-y-auto">
                                    {diffRows
                                        .filter(row => diffFilter === 'all' || row.Status !== 'match')
                                        .sort((a, b) => {
                                            let result
                                            if (sortBy === 'status') {
                                                result = statusOrder[a.Status] - statusOrder[b.Status]
                                            } else if (sortBy === 'name') {
                                                const aName = a.Source?.Fields?.name ?? a.Sink?.Fields?.name ?? ''
                                                const bName = b.Source?.Fields?.name ?? b.Sink?.Fields?.name ?? ''
                                                result = aName.localeCompare(bName)
                                            } else if (sortBy === 'id') {
                                                result = (a.Source?.Id ?? a.Sink?.Id) - (b.Source?.Id ?? b.Sink?.Id)
                                            }
                                            return sortDir === 'asc' ? result : result * -1
                                        })
                                        .map((row) => {
                                            const rowKey = `${row.Source?.Id ?? ''}-${row.Sink?.Id ?? ''}`
                                            const npcId = row.Source?.Id ?? row.Sink?.Id
                                            const questSpawned = (row.Source ?? row.Sink)?.HasSpawnPoint === false
                                            return (
                                                <div key={rowKey}
                                                     className={`flex items-center border-b border-gray-800 cursor-pointer ${
                                                         selectedRowKey === rowKey ? 'bg-blue-900/40 border-l-2 border-l-yellow-400' :
                                                             row.Status === 'new' ? 'bg-green-950 border-l-2 border-l-transparent' :
                                                                 row.Status === 'removed' ? 'bg-red-950 border-l-2 border-l-transparent' :
                                                                     row.Status === 'modified' ? 'bg-yellow-950 border-l-2 border-l-transparent' :
                                                                         'bg-transparent border-l-2 border-l-transparent'
                                                     }`}
                                                     onClick={() => {
                                                         setSelectedNpc(row)
                                                         setSelectedRowKey(rowKey)
                                                     }}
                                                >
                                                    <input type="checkbox"
                                                           className="accent-yellow-400 cursor-pointer w-3 h-3 mx-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                                           checked={selectedNPCs.has(npcId)}
                                                           disabled={needsSpawnPoint(row)}
                                                           title={needsSpawnPoint(row) ? "This NPC needs a spawn point in the sink first — spawn placement isn't implemented yet" : undefined}
                                                           onChange={(e) => {
                                                               e.stopPropagation()
                                                               const newSet = new Set(selectedNPCs)
                                                               if (newSet.has(npcId)) {
                                                                   newSet.delete(npcId)
                                                               } else {
                                                                   newSet.add(npcId)
                                                               }
                                                               setSelectedNPCs(newSet)
                                                           }}
                                                           onClick={e => e.stopPropagation()}
                                                    />
                                                    {questSpawned && (
                                                        <span className="text-purple-400 text-xs px-1"
                                                              title="Quest-spawned — no static spawn point">⚡</span>
                                                    )}
                                                    <div
                                                        className="flex-1 text-xs px-2 py-1">{row.Source?.Fields?.name ? `${row.Source.Fields.name} (${row.Source?.Id})` : '-'}</div>
                                                    <div
                                                        className={`flex-1 text-xs px-2 py-1 border-l border-gray-700`}>
                                                        {row.Sink?.Fields?.name ? `${row.Sink.Fields.name} (${row.Sink?.Id})` : '-'}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                </div>
                            )}
                        </div>

                        {/* Sync preview */}
                        <div
                            className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out bg-gray-800 z-10 ${
                                showSyncPreview ? 'translate-x-0' : 'translate-x-full'
                            }`}>
                            <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
                                <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                                    <button
                                        onClick={() => setShowSyncPreview(false)}
                                        className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                                    >
                                        ← Back to Diff
                                    </button>
                                    <span className="text-xs text-gray-400">
                                        {selectedNPCs.size} NPCs → {dbSinkName}
                                    </span>
                                    {!syncOutcome && (
                                        <button
                                            disabled={syncing || !syncPreview || syncPreview.Errors?.length > 0}
                                            onClick={() => setShowSyncConfirm(true)}
                                            className={`text-xs px-3 py-1 rounded font-medium ${
                                                syncing || !syncPreview || syncPreview.Errors?.length > 0
                                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                                    : 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                                            }`}>
                                            {syncing ? 'Syncing…' : 'Execute Sync →'}
                                        </button>
                                    )}
                                </div>

                                {syncOutcome ? (
                                    <div className="flex flex-col gap-3">
                                        <div className="text-sm text-green-400">
                                            {syncOutcome.NPCsSynced?.length ?? 0} NPCs synced
                                            {syncOutcome.SpawnsSynced > 0 && `, ${syncOutcome.SpawnsSynced} spawn point${syncOutcome.SpawnsSynced === 1 ? '' : 's'} created`}
                                            , {syncOutcome.TODOItems?.length ?? 0} TODO items saved
                                        </div>
                                        {syncOutcome.Skipped?.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs text-gray-400 uppercase tracking-wider">Skipped</div>
                                                {syncOutcome.Skipped.map((s, i) => (
                                                    <div key={i} className="text-xs text-amber-400">{s.Name} ({s.NPCID}): {s.Reason}</div>
                                                ))}
                                            </div>
                                        )}
                                        {syncOutcome.Errors?.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs text-gray-400 uppercase tracking-wider">Errors</div>
                                                {syncOutcome.Errors.map((e, i) => (
                                                    <div key={i} className="text-xs text-red-400">{e}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : !syncPreview ? (
                                    <div className="text-xs text-gray-500">Comparing…</div>
                                ) : syncPreview.Errors?.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                        <div className="text-xs text-gray-400 uppercase tracking-wider">Preview failed</div>
                                        {syncPreview.Errors.map((e, i) => (
                                            <div key={i} className="text-xs text-red-400">{e}</div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs text-gray-400 uppercase tracking-wider">
                                                {selectedNPCs.size} NPCs selected
                                                {syncPreview.NPCsSynced?.length > 0 && ` · ${syncPreview.NPCsSynced.length} will sync`}
                                                {syncPreview.SpawnsSynced > 0 && ` (${syncPreview.SpawnsSynced} spawn point${syncPreview.SpawnsSynced === 1 ? '' : 's'})`}
                                                {syncPreview.Skipped?.length > 0 && ` · ${syncPreview.Skipped.length} skipped`}
                                            </div>
                                            {Array.from(selectedNPCs)
                                                .map(id => {
                                                    const row = diffRows.find(r => (r.Source?.Id ?? r.Sink?.Id) === id)
                                                    const name = row?.Source?.Fields?.name ?? row?.Sink?.Fields?.name ?? `NPC ${id}`
                                                    const skipped = syncPreview.Skipped?.find(s => s.NPCID === id)
                                                    const createsSpawnPoint = syncPreview.SpawnsCreatedForNPCs?.includes(id)
                                                    const todoCount = syncPreview.TODOItems?.filter(t => t.NPCID === id).length ?? 0
                                                    return {id, name, row, skipped, createsSpawnPoint, todoCount}
                                                })
                                                .sort((a, b) => a.name.localeCompare(b.name))
                                                .map(({id, name, row, skipped, createsSpawnPoint, todoCount}) => (
                                                    <div key={id} className="flex items-center gap-2 text-xs px-2 py-1">
                                                        {skipped ? (
                                                            <>
                                                                <span className="text-gray-600">⊘</span>
                                                                <span className="text-gray-500">{name} ({id})</span>
                                                                <span className="text-amber-400">{skipped.Reason}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className={row?.Status === 'new' ? 'text-green-400' : 'text-yellow-400'}>
                                                                    {row?.Status === 'new' ? '+' : '~'}
                                                                </span>
                                                                <span className="text-gray-300">{name} ({id})</span>
                                                                {createsSpawnPoint && (
                                                                    <span className="text-cyan-400" title="A new spawngroup/spawnentry/spawn2 will be created for this NPC">
                                                                        + spawn point
                                                                    </span>
                                                                )}
                                                                {todoCount > 0 && (
                                                                    <span className="text-gray-500">{todoCount} TODO item{todoCount === 1 ? '' : 's'}</span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>

                                        {syncPreview.TODOItems?.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs text-gray-400 uppercase tracking-wider">
                                                    TODO items — needs manual reconciliation
                                                </div>
                                                {syncPreview.TODOItems.map((item, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1">
                                                        <span className="text-gray-500 w-20 shrink-0">{item.Type}</span>
                                                        <span className="text-gray-300">{item.NPCName}</span>
                                                        <span className="text-gray-600">
                                                            source {item.SourceID} → sink {item.SinkID || '—'}
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    )}

                    {/* TODO view */}
                    {activeView === 'todo' && (
                        <div className="flex-1 flex flex-col overflow-hidden">
                            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                                <span className="text-xs text-gray-400 uppercase tracking-wider">
                                    {showDismissedTodos ? 'Dismissed' : 'Open'} TODO items
                                </span>
                                <label className="ml-auto flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                                    <input type="checkbox"
                                           className="accent-yellow-400 cursor-pointer w-3 h-3"
                                           checked={showDismissedTodos}
                                           onChange={e => setShowDismissedTodos(e.target.checked)}/>
                                    Show dismissed ({zoneTodoItems.filter(t => t.Dismissed).length})
                                </label>
                            </div>
                            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                                {!selectedZoneShortName ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                        Select a zone to see its TODO items
                                    </div>
                                ) : zoneTodoItems.filter(t => t.Dismissed === showDismissedTodos).length === 0 ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                        {showDismissedTodos ? 'No dismissed items' : 'No open TODO items for this zone'}
                                    </div>
                                ) : (
                                    Object.entries(
                                        zoneTodoItems
                                            .filter(t => t.Dismissed === showDismissedTodos)
                                            .reduce((groups, item) => {
                                                if (!groups[item.Type]) groups[item.Type] = []
                                                groups[item.Type].push(item)
                                                return groups
                                            }, {})
                                    ).map(([type, items]) => (
                                        <div key={type} className="flex flex-col gap-1">
                                            <div className="text-xs text-gray-400 uppercase tracking-wider">{type} ({items.length})</div>
                                            {items.map(item => (
                                                <div key={item.ID} className="flex items-center gap-2 text-xs px-2 py-1 bg-gray-800 rounded">
                                                    <button onClick={() => jumpToNpc(item.NPCID)}
                                                            className="text-gray-300 hover:text-yellow-400 cursor-pointer">
                                                        {item.NPCName} ({item.NPCID})
                                                    </button>
                                                    <span className="text-gray-600">
                                                        source {item.SourceID} → sink {item.SinkID || '—'}
                                                    </span>
                                                    <button
                                                        onClick={() => toggleTodoDismissed(item)}
                                                        className="ml-auto text-xs px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white">
                                                        {item.Dismissed ? 'Restore' : 'Dismiss'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Spawns view */}
                    {activeView === 'spawns' && (
                    <div className="flex-1 relative overflow-hidden">

                        {/* Diff View */}
                        <div className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out z-0 ${
                            showSpawnSyncPreview ? '-translate-x-full' : 'translate-x-0'
                        }`}>

                            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                                <button
                                    onClick={() => setSpawnDiffFilter('all')}
                                    className={`text-xs px-3 py-1 rounded border ${spawnDiffFilter === 'all' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                    Show All
                                </button>
                                <button
                                    onClick={() => setSpawnDiffFilter('diff')}
                                    className={`text-xs px-3 py-1 rounded border ${spawnDiffFilter === 'diff' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                    Differences Only
                                </button>
                                <input
                                    className="ml-auto w-48 text-xs border border-gray-600 bg-gray-700 rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                    placeholder="Filter by spawngroup or NPC..."
                                    value={spawnSearchFilter}
                                    onChange={e => setSpawnSearchFilter(e.target.value)}
                                    autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                            </div>
                            <div className="flex gap-2 px-3 py-1 border-b border-gray-700 bg-gray-850">
                                {[
                                    {label: 'Status', value: 'status'},
                                    {label: 'Spawngroup', value: 'spawngroup'},
                                    {label: 'Shared', value: 'shared'},
                                ].map(sort => (
                                    <button
                                        key={sort.value}
                                        onClick={() => {
                                            if (spawnSortBy === sort.value) {
                                                setSpawnSortDir(spawnSortDir === 'asc' ? 'desc' : 'asc')
                                            } else {
                                                setSpawnSortBy(sort.value)
                                                setSpawnSortDir('asc')
                                            }
                                        }}
                                        className={`text-xs px-3 py-1 rounded border ${spawnSortBy === sort.value ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                        {sort.label} {spawnSortBy === sort.value ? (spawnSortDir === 'asc' ? '↑' : '↓') : ''}
                                    </button>
                                ))}
                            </div>
                            <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-700 bg-gray-850">
                                Each row is one <span className="text-gray-400">spawn2</span> location, matched by coordinate across databases — not a spawngroup or spawn entry. The name(s) shown per row are a preview of that location's linked spawngroup; open a row for its full spawn entries.
                            </div>
                            <div className="flex items-center border-b border-gray-700 bg-gray-800">
                                <input type="checkbox"
                                       className="accent-yellow-400 cursor-pointer w-3 h-3 mx-2"
                                       title="Only new spawn points and locations whose own spawn2 fields differ can be synced from this tab — removed spawn points, and rows that only differ in their spawn entries, aren't"
                                       checked={selectableSpawnRows.length > 0 && selectableSpawnRows.every(row => selectedSpawnKeys.has(spawnKey(row)))}
                                       onChange={(e) => {
                                           if (e.target.checked) {
                                               setSelectedSpawnKeys(new Set(selectableSpawnRows.map(spawnKey)))
                                           } else {
                                               setSelectedSpawnKeys(new Set())
                                           }
                                       }}
                                />
                                <div className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider">
                                    Source: {dbSourceName}
                                </div>
                                <div
                                    className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider border-l border-gray-700">
                                    Sink: {dbSinkName}
                                </div>
                            </div>
                            {/*Diff List of Spawn Points*/}
                            {spawnDiffLoading ? (
                                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                                    Loading spawn points…
                                </div>
                            ) : spawnDiffRows.length === 0 && selectedZoneShortName ? (
                                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                    No spawn points found in this zone
                                </div>
                            ) : (
                                <div className="flex flex-1 min-h-0 overflow-hidden flex-col overflow-y-auto">
                                    {spawnDiffRows
                                        .filter(row => spawnDiffFilter === 'all' || row.Status !== 'match')
                                        .filter(row => spawnRowMatchesSearch(row, spawnSearchFilter))
                                        .sort((a, b) => {
                                            let result
                                            if (spawnSortBy === 'spawngroup') {
                                                const aName = (a.Source ?? a.Sink)?.SpawnGroupFields?.name ?? ''
                                                const bName = (b.Source ?? b.Sink)?.SpawnGroupFields?.name ?? ''
                                                result = aName.localeCompare(bName)
                                            } else if (spawnSortBy === 'shared') {
                                                const aShared = (a.Source ?? a.Sink)?.LocationSharedCount ?? 0
                                                const bShared = (b.Source ?? b.Sink)?.LocationSharedCount ?? 0
                                                result = aShared - bShared
                                            } else {
                                                result = statusOrder[a.Status] - statusOrder[b.Status]
                                            }
                                            return spawnSortDir === 'asc' ? result : result * -1
                                        })
                                        .map((row) => {
                                            const rowKey = spawnKey(row)
                                            const point = row.Source ?? row.Sink
                                            const sharedCount = point?.LocationSharedCount ?? 0
                                            const entriesOnly = spawnEntriesOnly(row)
                                            return (
                                                <div key={rowKey}
                                                     className={`flex items-center border-b border-gray-800 cursor-pointer ${
                                                         selectedSpawnRow && spawnKey(selectedSpawnRow) === rowKey ? 'bg-blue-900/40 border-l-2 border-l-yellow-400' :
                                                             row.Status === 'new' ? 'bg-green-950 border-l-2 border-l-transparent' :
                                                                 row.Status === 'removed' ? 'bg-red-950 border-l-2 border-l-transparent' :
                                                                     row.Status === 'modified' ? (entriesOnly ? 'bg-amber-950/40 border-l-2 border-l-transparent' : 'bg-yellow-950 border-l-2 border-l-transparent') :
                                                                         'bg-transparent border-l-2 border-l-transparent'
                                                     }`}
                                                     onClick={() => setSelectedSpawnRow(row)}
                                                >
                                                    <input type="checkbox"
                                                           className="accent-yellow-400 cursor-pointer w-3 h-3 mx-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                                           checked={selectedSpawnKeys.has(rowKey)}
                                                           disabled={!spawnRowSelectable(row)}
                                                           title={
                                                               row.Status === 'removed' ? "Removed spawn points can't be synced from this tab" :
                                                                   entriesOnly ? "Only this location's spawn entries differ — Sync never touches those (see Spawn Entries in the detail panel), so there's nothing here for it to change" :
                                                                       undefined
                                                           }
                                                           onChange={(e) => {
                                                               e.stopPropagation()
                                                               const newSet = new Set(selectedSpawnKeys)
                                                               if (newSet.has(rowKey)) {
                                                                   newSet.delete(rowKey)
                                                               } else {
                                                                   newSet.add(rowKey)
                                                               }
                                                               setSelectedSpawnKeys(newSet)
                                                           }}
                                                           onClick={e => e.stopPropagation()}
                                                    />
                                                    {sharedCount > 0 && (
                                                        <span className="text-cyan-400 text-xs px-1"
                                                              title={`This spawngroup is used at ${sharedCount} other location${sharedCount === 1 ? '' : 's'} too`}>
                                                            ×{sharedCount + 1} locations
                                                        </span>
                                                    )}
                                                    {row.PoolDiffers && (
                                                        <span className="text-amber-400 text-xs px-1"
                                                              title="Spawn entries differ from source — needs manual reconciliation">⚠</span>
                                                    )}
                                                    <div className="flex-1 text-xs px-2 py-1">
                                                        {spawnRowLabel(row.Source)}
                                                    </div>
                                                    <div className="flex-1 text-xs px-2 py-1 border-l border-gray-700">
                                                        {spawnRowLabel(row.Sink)}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                </div>
                            )}
                        </div>

                        {/* Spawn sync preview */}
                        <div
                            className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out bg-gray-800 z-10 ${
                                showSpawnSyncPreview ? 'translate-x-0' : 'translate-x-full'
                            }`}>
                            <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
                                <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                                    <button
                                        onClick={() => setShowSpawnSyncPreview(false)}
                                        className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                                    >
                                        ← Back to Diff
                                    </button>
                                    <span className="text-xs text-gray-400">
                                        {selectedSpawnKeys.size} of {spawnDiffRows.length} spawn points → {dbSinkName}
                                    </span>
                                    {!spawnSyncOutcome && (
                                        <button
                                            disabled={spawnSyncing || !spawnSyncPreview || spawnSyncPreview.Errors?.length > 0}
                                            onClick={() => setShowSpawnSyncConfirm(true)}
                                            className={`text-xs px-3 py-1 rounded font-medium ${
                                                spawnSyncing || !spawnSyncPreview || spawnSyncPreview.Errors?.length > 0
                                                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                                    : 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                                            }`}>
                                            {spawnSyncing ? 'Syncing…' : 'Execute Sync →'}
                                        </button>
                                    )}
                                </div>

                                {spawnSyncOutcome ? (
                                    <div className="flex flex-col gap-3">
                                        <div className="text-sm text-green-400">
                                            {spawnSyncOutcome.Created ?? 0} spawn point{spawnSyncOutcome.Created === 1 ? '' : 's'} created,
                                            {' '}{spawnSyncOutcome.Updated ?? 0} updated
                                        </div>
                                        {spawnSyncOutcome.Skipped?.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs text-gray-400 uppercase tracking-wider">Skipped</div>
                                                {spawnSyncOutcome.Skipped.map((s, i) => (
                                                    <div key={i} className="text-xs text-amber-400">
                                                        ({fmtCoord(s.X)}, {fmtCoord(s.Y)}, {fmtCoord(s.Z)}): {s.Reason}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {spawnSyncOutcome.Errors?.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs text-gray-400 uppercase tracking-wider">Errors</div>
                                                {spawnSyncOutcome.Errors.map((e, i) => (
                                                    <div key={i} className="text-xs text-red-400">{e}</div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ) : !spawnSyncPreview ? (
                                    <div className="text-xs text-gray-500">Comparing…</div>
                                ) : spawnSyncPreview.Errors?.length > 0 ? (
                                    <div className="flex flex-col gap-1">
                                        <div className="text-xs text-gray-400 uppercase tracking-wider">Preview failed</div>
                                        {spawnSyncPreview.Errors.map((e, i) => (
                                            <div key={i} className="text-xs text-red-400">{e}</div>
                                        ))}
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs text-gray-400 uppercase tracking-wider">
                                                {selectedSpawnKeys.size} of {spawnDiffRows.length} spawn points selected
                                                {spawnSyncPreview.Created > 0 && ` · ${spawnSyncPreview.Created} will be created`}
                                                {spawnSyncPreview.Updated > 0 && ` · ${spawnSyncPreview.Updated} will be updated`}
                                                {spawnSyncPreview.Skipped?.length > 0 && ` · ${spawnSyncPreview.Skipped.length} skipped`}
                                            </div>
                                            {spawnDiffRows
                                                .filter(row => selectedSpawnKeys.has(spawnKey(row)))
                                                .map(row => {
                                                    const point = row.Source ?? row.Sink
                                                    const skipped = spawnSyncPreview.Skipped?.find(s =>
                                                        s.X === point.Fields.x && s.Y === point.Fields.y && s.Z === point.Fields.z)
                                                    return {row, point, skipped}
                                                })
                                                .map(({row, point, skipped}, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs px-2 py-1">
                                                        {skipped ? (
                                                            <>
                                                                <span className="text-gray-600">⊘</span>
                                                                <span className="text-gray-500">
                                                                    {spawnRowLabel(point)}
                                                                </span>
                                                                <span className="text-amber-400">{skipped.Reason}</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <span className={row.Status === 'new' ? 'text-green-400' : 'text-yellow-400'}>
                                                                    {row.Status === 'new' ? '+' : '~'}
                                                                </span>
                                                                <span className="text-gray-300">
                                                                    {spawnRowLabel(point)}
                                                                </span>
                                                                {row.PoolDiffers && (
                                                                    <span className="text-amber-400" title="Spawn entries differ — not touched by this sync">
                                                                        entries differ
                                                                    </span>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    )}
                </div>
                {/* Drag handle */}
                <div
                    className="w-1 bg-gray-700 hover:bg-yellow-400 cursor-col-resize"
                    onMouseDown={(e) => {
                        e.preventDefault()
                        const startX = e.clientX
                        const startWidth = detailWidth
                        const onMouseMove = (e) => {
                            const delta = startX - e.clientX
                            setDetailWidth(Math.max(180, Math.min(600, startWidth + delta)))
                        }
                        const onMouseUp = () => {
                            window.removeEventListener('mousemove', onMouseMove)
                            window.removeEventListener('mouseup', onMouseUp)
                        }
                        window.addEventListener('mousemove', onMouseMove)
                        window.addEventListener('mouseup', onMouseUp)
                    }}
                />
                {/* Detail panel (NPC / Spawn Point, depending on active tab) */}
                <div style={{width: detailWidth, minWidth: detailWidth}} className="bg-gray-800 flex flex-col">
                    <div className="flex flex-col overflow-hidden h-full">
                        <div
                            className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 flex items-center justify-between">
                            <span>{activeView === 'spawns' ? 'Spawn Point Detail' : 'NPC Detail'}</span>
                            {activeView === 'spawns' && (
                                <button
                                    onClick={() => setShowSpawnHelp(true)}
                                    title="How spawn2, spawngroup, and spawn entries relate"
                                    className="w-4 h-4 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 text-[10px] normal-case tracking-normal hover:border-gray-400 hover:text-white">
                                    ?
                                </button>
                            )}
                        </div>
                        <div className="px-2 py-2 flex flex-col gap-1 text-xs overflow-y-auto flex-1">
                            {activeView === 'npcs' && (
                                <>
                                    {!selectedNpc && (
                                        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                            Select an NPC to view details
                                        </div>
                                    )}
                                    {selectedNpc && (selectedNpc.Source ?? selectedNpc.Sink)?.HasSpawnPoint === false && (
                                        <div className="text-purple-400 px-2 py-1 flex items-center gap-1">
                                            <span>⚡</span> Quest-spawned — no static spawn point
                                        </div>
                                    )}
                                    {selectedNpc && Object.entries(fieldGroups).map(([section, fields]) => (
                                        <div key={section}>
                                            <div
                                                className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                                onClick={() => setExpandedSections(prev => ({
                                                    ...prev,
                                                    [section]: !prev[section]
                                                }))}
                                            >
                                                <span
                                                    className="text-gray-400 uppercase tracking-wider text-xs">{section.replace('_', ' ')}</span>
                                                <span
                                                    className="text-gray-600">{expandedSections[section] ? '▾' : '▸'}</span>
                                            </div>
                                            {expandedSections[section] && fields.map(field => {
                                                const srcVal = selectedNpc.Source?.Fields?.[field]
                                                const sinkVal = selectedNpc.Sink?.Fields?.[field]
                                                const differs = srcVal !== sinkVal
                                                return (
                                                    <div key={field} className="flex justify-between px-2 py-0.5">
                                                        <span className="text-gray-500 w-24 shrink-0">{field}</span>
                                                        <span
                                                            className={differs ? 'text-yellow-400' : 'text-gray-400'}>{srcVal ?? '—'}</span>
                                                        <span className="text-gray-600 px-1">→</span>
                                                        <span
                                                            className={differs ? 'text-yellow-400' : 'text-gray-400'}>{sinkVal ?? '—'}</span>
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    ))}
                                </>
                            )}
                            {activeView === 'spawns' && (
                                <>
                                    {!selectedSpawnRow && (
                                        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                            Select a spawn point to view details
                                        </div>
                                    )}
                                    {selectedSpawnRow && (() => {
                                        const point = selectedSpawnRow.Source ?? selectedSpawnRow.Sink
                                        const sharedCount = point?.LocationSharedCount ?? 0
                                        const behaviorFields = spawnBehaviorFields(selectedSpawnRow)
                                        return (
                                            <>
                                                {selectedSpawnRow.PoolDiffers && (
                                                    <div className="text-amber-400 px-2 py-1 flex items-center gap-1">
                                                        <span>⚠</span> Spawn entries differ from source — needs manual reconciliation
                                                    </div>
                                                )}
                                                {/* Static identity — not a diffable field group. Coordinates are the matching key
                                                    itself (see spawnIdentityFieldNames), so source/sink are guaranteed identical here.
                                                    Axis-labeled (not a bare "(x, y, z)" tuple) since EQ's in-game /loc command reports
                                                    Y, X, Z while the database and most editors — this app included — store/display
                                                    X, Y, Z; a labeled row is unambiguous regardless of which order someone expects. */}
                                                <div className="px-2 pt-1 text-gray-400 uppercase tracking-wider text-xs">Location</div>
                                                <div className="flex justify-between px-2 py-0.5">
                                                    <span className="text-gray-500 w-24 shrink-0">x</span>
                                                    <span className="text-gray-300">{fmtCoord(Number(point?.Fields?.x))}</span>
                                                </div>
                                                <div className="flex justify-between px-2 py-0.5">
                                                    <span className="text-gray-500 w-24 shrink-0">y</span>
                                                    <span className="text-gray-300">{fmtCoord(Number(point?.Fields?.y))}</span>
                                                </div>
                                                <div className="flex justify-between px-2 py-0.5">
                                                    <span className="text-gray-500 w-24 shrink-0">z</span>
                                                    <span className="text-gray-300">{fmtCoord(Number(point?.Fields?.z))}</span>
                                                </div>
                                                <div>
                                                    <div
                                                        className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                                        onClick={() => setExpandedSections(prev => ({
                                                            ...prev,
                                                            spawn_behavior: !prev.spawn_behavior
                                                        }))}
                                                    >
                                                        <span className="text-gray-400 uppercase tracking-wider text-xs">Behavior</span>
                                                        <span className="text-gray-600">{expandedSections.spawn_behavior ? '▾' : '▸'}</span>
                                                    </div>
                                                    {expandedSections.spawn_behavior && behaviorFields.map(field => {
                                                        const srcVal = selectedSpawnRow.Source?.Fields?.[field]
                                                        const sinkVal = selectedSpawnRow.Sink?.Fields?.[field]
                                                        const differs = srcVal !== sinkVal
                                                        return (
                                                            <div key={field} className="flex justify-between px-2 py-0.5">
                                                                <span className="text-gray-500 w-24 shrink-0">{field}</span>
                                                                <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{srcVal ?? '—'}</span>
                                                                <span className="text-gray-600 px-1">→</span>
                                                                <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{sinkVal ?? '—'}</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                                <div>
                                                    {/* Spawngroup name lives in this section's own header, not as a separate row up
                                                        top — it's a fact about the entries below, so it reads better right next to
                                                        them. Full spawn2→spawngroup→spawn entries relationship is in the "?" help
                                                        drawer (see showSpawnHelp) rather than repeated inline every time. */}
                                                    <div
                                                        className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                                        onClick={() => setExpandedSections(prev => ({
                                                            ...prev,
                                                            spawn_pool: !prev.spawn_pool
                                                        }))}
                                                    >
                                                        <span className="text-gray-400 uppercase tracking-wider text-xs">
                                                            Spawn Entries{selectedSpawnRow.PoolDiffers ? ' ⚠' : ''}
                                                            <span className="text-gray-500 normal-case tracking-normal"> — "{point?.SpawnGroupFields?.name ?? '—'}"</span>
                                                        </span>
                                                        <span className="text-gray-600">{expandedSections.spawn_pool ? '▾' : '▸'}</span>
                                                    </div>
                                                    {expandedSections.spawn_pool && (
                                                        <div className="flex flex-col gap-0.5 px-2 py-1">
                                                            {sharedCount > 0 && (
                                                                <div className="flex items-center justify-between text-xs pb-1 gap-2">
                                                                    <span className="text-cyan-400">
                                                                        Also used at {sharedCount} other location{sharedCount === 1 ? '' : 's'} in this zone
                                                                    </span>
                                                                    <button
                                                                        onClick={() => selectAllSharingSpawngroup(selectedSpawnRow)}
                                                                        className="text-cyan-400 hover:text-cyan-300 underline shrink-0"
                                                                        title="Add every location sharing this spawngroup to the current selection">
                                                                        Select all {sharedCount + 1} →
                                                                    </button>
                                                                </div>
                                                            )}
                                                            {selectedSpawnRow.PoolDiffers && (
                                                                <button
                                                                    onClick={() => openSyncSpawnGroupEntriesPreview(selectedSpawnRow)}
                                                                    className="text-xs text-amber-400 hover:text-amber-300 underline text-left pb-1"
                                                                    title="Replace this spawngroup's entries on the sink to match source">
                                                                    Sync entries from source →
                                                                </button>
                                                            )}
                                                            <div className="flex text-gray-500 text-xs">
                                                                <span className="flex-1">NPC</span>
                                                                <span className="w-14 text-right">Src %</span>
                                                                <span className="w-14 text-right">Sink %</span>
                                                            </div>
                                                            {spawnEntryRows(selectedSpawnRow).map(({npcId, name, srcChance, sinkChance, differs}) => (
                                                                <div key={npcId}
                                                                     className={`flex text-xs ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                                    <span className="flex-1">{name} ({npcId})</span>
                                                                    <span className="w-14 text-right">{srcChance ?? '—'}</span>
                                                                    <span className="w-14 text-right">{sinkChance ?? '—'}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </>
                                        )
                                    })()}
                                </>
                            )}
                            {activeView === 'todo' && (
                                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                    NPC and spawn point details are hidden while viewing TODO items
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
