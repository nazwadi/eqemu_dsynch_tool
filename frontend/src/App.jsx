import {useEffect, useState} from 'react';
import './App.css';
import {
    CompareGrids,
    CompareSpawns,
    CompareZones,
    Connect,
    GetZones,
    LoadConfig,
    LoadTODOItems,
    SaveConfig,
    SetTODOItemDismissed,
    Sync,
    SyncGrids,
    SyncSpawnGroupEntries,
    SyncSpawnPoints
} from "../wailsjs/go/main/App";
import ConnectModal from './components/ConnectModal';
import ConfirmSyncModal from './components/ConfirmSyncModal';
import ConfirmSpawnSyncModal from './components/ConfirmSpawnSyncModal';
import SpawnHelpDrawer from './components/SpawnHelpDrawer';
import ConfirmSpawnGroupEntriesModal from './components/ConfirmSpawnGroupEntriesModal';
import ConfirmGridSyncModal from './components/ConfirmGridSyncModal';
import Sidebar from './components/Sidebar';
import NpcsTab from './components/NpcsTab';
import SpawnsTab from './components/SpawnsTab';
import TodoTab from './components/TodoTab';
import GridsTab from './components/GridsTab';
import DetailPanel from './components/DetailPanel';
import {needsSpawnPoint} from './lib/npcHelpers';
import {keysSharingSpawngroup, spawnCoords, spawnKey, spawnRowSelectable} from './lib/spawnHelpers';
import {gridId, gridRowSelectable} from './lib/gridHelpers';

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
    const [detailWidth, setDetailWidth] = useState(240)
    const [selectedNPCs, setSelectedNPCs] = useState(new Set())
    const [showSyncPreview, setShowSyncPreview] = useState(false)
    const [syncPreview, setSyncPreview] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [syncOutcome, setSyncOutcome] = useState(null)
    const [showSyncConfirm, setShowSyncConfirm] = useState(false)
    const [syncSpawns, setSyncSpawns] = useState(false)
    const [activeView, setActiveView] = useState('npcs') // 'npcs' | 'todo' | 'spawns' | 'grids'
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
    const [showSpawnHelp, setShowSpawnHelp] = useState(false)  // right-edge drawer explaining spawn2→spawngroup→spawn entries; see the Spawn Point Detail panel's "?" button
    const [showSpawnGroupEntriesConfirm, setShowSpawnGroupEntriesConfirm] = useState(false)
    const [spawnGroupEntriesPreview, setSpawnGroupEntriesPreview] = useState(null)  // dry-run SpawnGroupEntriesSyncResult, null while loading
    const [spawnGroupEntriesError, setSpawnGroupEntriesError] = useState(null)  // unexpected Go-level error, separate from the "blocked"/"not found" outcomes the result itself carries
    const [syncingSpawnGroupEntries, setSyncingSpawnGroupEntries] = useState(false)

    // Grids tab
    const [gridDiffRows, setGridDiffRows] = useState([])
    const [gridDiffLoading, setGridDiffLoading] = useState(false)
    const [gridDiffFilter, setGridDiffFilter] = useState('all')
    const [selectedGridIds, setSelectedGridIds] = useState(new Set())
    const [selectedGridRow, setSelectedGridRow] = useState(null)
    const [showGridSyncPreview, setShowGridSyncPreview] = useState(false)
    const [gridSyncPreview, setGridSyncPreview] = useState(null)
    const [gridSyncing, setGridSyncing] = useState(false)
    const [gridSyncOutcome, setGridSyncOutcome] = useState(null)
    const [showGridSyncConfirm, setShowGridSyncConfirm] = useState(false)

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

    // Thin wrapper around the pure keysSharingSpawngroup() — keeps the JSX call site
    // (onClick={() => selectAllSharingSpawngroup(selectedSpawnRow)}) unchanged while the actual
    // "what to select" computation lives in lib/spawnHelpers.js, independent of component state.
    function selectAllSharingSpawngroup(row) {
        const keys = keysSharingSpawngroup(row, spawnDiffRows)
        setSelectedSpawnKeys(prev => new Set([...prev, ...keys]))
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

    function runGridSync(dryRun) {
        const selectedRows = gridDiffRows.filter(row => selectedGridIds.has(gridId(row)))
        return SyncGrids({
            ZoneIdNumber: selectedZoneIdNumber,
            DryRun: dryRun,
            GridIds: selectedRows.filter(row => row.Status === 'modified').map(row => row.Sink.Id),
            NewGridIds: selectedRows.filter(row => row.Status === 'new').map(row => row.Source.Id)
        })
    }

    function executeGridSync() {
        setGridSyncing(true)
        runGridSync(false)
            .then(result => {
                setGridSyncOutcome(result)
                setSelectedGridIds(new Set())
                setSelectedGridRow(null)
                loadGridDiffs()
            })
            .catch(err => setGridSyncOutcome({Errors: [String(err)]}))
            .finally(() => setGridSyncing(false))
    }

    function loadGridDiffs() {
        if (!selectedZoneIdNumber) return
        setGridDiffLoading(true)
        setGridDiffRows([])
        CompareGrids(selectedZoneIdNumber)
            .then(setGridDiffRows)
            .catch(err => console.error("compare grids failed:", err))
            .finally(() => setGridDiffLoading(false))
    }

    // Resets both the NPC and spawn selection/preview state and kicks off both diffs — kept as
    // one function here (not in Sidebar) since it's genuine cross-cutting business logic touching
    // state from both tabs, not something a presentational sidebar component should own.
    function selectZone(zone) {
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
        setSelectedGridIds(new Set())
        setSelectedGridRow(null)
        setGridSyncPreview(null)
        setGridSyncOutcome(null)
        setGridDiffRows([])
        setGridDiffLoading(true)
        CompareGrids(zone.ZoneIdNumber)
            .then(setGridDiffRows)
            .catch(err => console.error("compare grids failed:", err))
            .finally(() => setGridDiffLoading(false))
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
    const selectableRows = diffRows.filter(row => (diffFilter === 'all' || row.Status !== 'match') && !needsSpawnPoint(row, syncSpawns))
    const zoneTodoItems = todoItems.filter(t => t.ZoneName === selectedZoneShortName && t.ZoneVersion === selectedZoneVersion)
    const openZoneTodoCount = zoneTodoItems.filter(t => !t.Dismissed).length
    const spawnNewCount = spawnDiffRows?.filter(r => r.Status === 'new').length
    const spawnModifiedCount = spawnDiffRows?.filter(r => r.Status === 'modified').length
    const spawnRemovedCount = spawnDiffRows?.filter(r => r.Status === 'removed').length
    const selectableSpawnRows = spawnDiffRows?.filter(spawnRowSelectable)
    const gridNewCount = gridDiffRows.filter(r => r.Status === 'new').length
    const gridModifiedCount = gridDiffRows.filter(r => r.Status === 'modified').length
    const gridRemovedCount = gridDiffRows.filter(r => r.Status === 'removed').length
    const selectableGridRows = gridDiffRows.filter(gridRowSelectable)
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
    return (
        <div id="App" className="h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
            <ConnectModal
                activeModal={activeModal} setActiveModal={setActiveModal}
                connectError={connectError} setConnectError={setConnectError}
                connecting={connecting} connect={connect}
                sourceHost={sourceHost} setSourceHost={setSourceHost}
                sourcePort={sourcePort} setSourcePort={setSourcePort}
                sourceUsername={sourceUsername} setSourceUsername={setSourceUsername}
                sourcePassword={sourcePassword} setSourcePassword={setSourcePassword}
                dbSourceName={dbSourceName} setDbSourceName={setDbSourceName}
                sinkHost={sinkHost} setSinkHost={setSinkHost}
                sinkPort={sinkPort} setSinkPort={setSinkPort}
                sinkUsername={sinkUsername} setSinkUsername={setSinkUsername}
                sinkPassword={sinkPassword} setSinkPassword={setSinkPassword}
                dbSinkName={dbSinkName} setDbSinkName={setDbSinkName}
            />
            <ConfirmSyncModal
                showSyncConfirm={showSyncConfirm} setShowSyncConfirm={setShowSyncConfirm}
                dbSinkName={dbSinkName} syncPreview={syncPreview} executeSync={executeSync}
            />
            <ConfirmSpawnSyncModal
                showSpawnSyncConfirm={showSpawnSyncConfirm} setShowSpawnSyncConfirm={setShowSpawnSyncConfirm}
                dbSinkName={dbSinkName} spawnSyncPreview={spawnSyncPreview} executeSpawnSync={executeSpawnSync}
            />
            <SpawnHelpDrawer showSpawnHelp={showSpawnHelp} setShowSpawnHelp={setShowSpawnHelp}/>
            <ConfirmSpawnGroupEntriesModal
                showSpawnGroupEntriesConfirm={showSpawnGroupEntriesConfirm}
                setShowSpawnGroupEntriesConfirm={setShowSpawnGroupEntriesConfirm}
                spawnGroupEntriesError={spawnGroupEntriesError}
                spawnGroupEntriesPreview={spawnGroupEntriesPreview}
                selectedSpawnRow={selectedSpawnRow}
                syncingSpawnGroupEntries={syncingSpawnGroupEntries}
                executeSyncSpawnGroupEntries={executeSyncSpawnGroupEntries}
                dbSinkName={dbSinkName}
            />
            <ConfirmGridSyncModal
                showGridSyncConfirm={showGridSyncConfirm} setShowGridSyncConfirm={setShowGridSyncConfirm}
                dbSinkName={dbSinkName} gridSyncPreview={gridSyncPreview} executeGridSync={executeGridSync}
            />
            <div className="flex flex-1 min-h-0">
                <Sidebar
                    sourceConnected={sourceConnected} sourceHost={sourceHost}
                    sinkConnected={sinkConnected} sinkHost={sinkHost}
                    setActiveModal={setActiveModal} setConnectError={setConnectError}
                    searchFilter={searchFilter} setSearchFilter={setSearchFilter}
                    showSyncPreview={showSyncPreview} showSpawnSyncPreview={showSpawnSyncPreview}
                    zones={zones} selectedZoneId={selectedZoneId} onSelectZone={selectZone}
                />
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
                        {activeView === 'grids' && gridDiffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{gridNewCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{gridModifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{gridRemovedCount}</span>
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
                        {activeView === 'grids' && (
                            <button
                                disabled={selectedGridIds.size === 0 || showGridSyncPreview}
                                className={`px-3 py-1 rounded text-xs font-medium ${
                                    selectedGridIds.size > 0 && !showGridSyncPreview
                                        ? 'bg-yellow-400 text-gray-900 cursor-pointer hover:bg-yellow-300'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                                onClick={() => {
                                    setShowGridSyncPreview(true)
                                    setGridSyncPreview(null)
                                    setGridSyncOutcome(null)
                                    runGridSync(true).then(setGridSyncPreview).catch(err => setGridSyncPreview({Errors: [String(err)]}))
                                }}
                            >
                                {selectedGridIds.size > 0 ? `Sync ${selectedGridIds.size} Grids` : 'Sync Grids'}
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
                                onClick={() => setActiveView('grids')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'grids' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                Grids{selectableGridRows.length > 0 && ` (${selectableGridRows.length})`}
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
                        <NpcsTab
                            diffRows={diffRows} diffLoading={diffLoading}
                            diffFilter={diffFilter} setDiffFilter={setDiffFilter}
                            sortBy={sortBy} setSortBy={setSortBy} sortDir={sortDir} setSortDir={setSortDir}
                            selectableRows={selectableRows}
                            selectedNPCs={selectedNPCs} setSelectedNPCs={setSelectedNPCs}
                            selectedRowKey={selectedRowKey} setSelectedRowKey={setSelectedRowKey}
                            setSelectedNpc={setSelectedNpc}
                            syncSpawns={syncSpawns} dbSourceName={dbSourceName} dbSinkName={dbSinkName}
                            selectedZoneShortName={selectedZoneShortName}
                            showSyncPreview={showSyncPreview} setShowSyncPreview={setShowSyncPreview}
                            syncPreview={syncPreview} syncing={syncing} syncOutcome={syncOutcome}
                            setShowSyncConfirm={setShowSyncConfirm}
                        />
                    )}

                    {/* TODO view */}
                    {activeView === 'todo' && (
                        <TodoTab
                            selectedZoneShortName={selectedZoneShortName}
                            zoneTodoItems={zoneTodoItems}
                            showDismissedTodos={showDismissedTodos} setShowDismissedTodos={setShowDismissedTodos}
                            jumpToNpc={jumpToNpc} toggleTodoDismissed={toggleTodoDismissed}
                        />
                    )}

                    {/* Spawns view */}
                    {activeView === 'spawns' && (
                        <SpawnsTab
                            spawnDiffRows={spawnDiffRows} spawnDiffLoading={spawnDiffLoading}
                            spawnDiffFilter={spawnDiffFilter} setSpawnDiffFilter={setSpawnDiffFilter}
                            spawnSearchFilter={spawnSearchFilter} setSpawnSearchFilter={setSpawnSearchFilter}
                            spawnSortBy={spawnSortBy} setSpawnSortBy={setSpawnSortBy}
                            spawnSortDir={spawnSortDir} setSpawnSortDir={setSpawnSortDir}
                            selectableSpawnRows={selectableSpawnRows}
                            selectedSpawnKeys={selectedSpawnKeys} setSelectedSpawnKeys={setSelectedSpawnKeys}
                            selectedSpawnRow={selectedSpawnRow} setSelectedSpawnRow={setSelectedSpawnRow}
                            dbSourceName={dbSourceName} dbSinkName={dbSinkName}
                            selectedZoneShortName={selectedZoneShortName}
                            showSpawnSyncPreview={showSpawnSyncPreview} setShowSpawnSyncPreview={setShowSpawnSyncPreview}
                            spawnSyncPreview={spawnSyncPreview} spawnSyncing={spawnSyncing} spawnSyncOutcome={spawnSyncOutcome}
                            setShowSpawnSyncConfirm={setShowSpawnSyncConfirm}
                        />
                    )}

                    {/* Grids view */}
                    {activeView === 'grids' && (
                        <GridsTab
                            gridDiffRows={gridDiffRows} gridDiffLoading={gridDiffLoading}
                            gridDiffFilter={gridDiffFilter} setGridDiffFilter={setGridDiffFilter}
                            selectedGridIds={selectedGridIds} setSelectedGridIds={setSelectedGridIds}
                            selectedGridRow={selectedGridRow} setSelectedGridRow={setSelectedGridRow}
                            selectedZoneShortName={selectedZoneShortName}
                            showGridSyncPreview={showGridSyncPreview} setShowGridSyncPreview={setShowGridSyncPreview}
                            gridSyncPreview={gridSyncPreview} gridSyncing={gridSyncing} gridSyncOutcome={gridSyncOutcome}
                            setShowGridSyncConfirm={setShowGridSyncConfirm}
                        />
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
                <DetailPanel
                    activeView={activeView} setShowSpawnHelp={setShowSpawnHelp} detailWidth={detailWidth}
                    selectedNpc={selectedNpc}
                    selectedSpawnRow={selectedSpawnRow}
                    selectAllSharingSpawngroup={selectAllSharingSpawngroup}
                    openSyncSpawnGroupEntriesPreview={openSyncSpawnGroupEntriesPreview}
                    selectedGridRow={selectedGridRow}
                    expandedSections={expandedSections} setExpandedSections={setExpandedSections}
                />
            </div>
        </div>
    )
}

export default App
