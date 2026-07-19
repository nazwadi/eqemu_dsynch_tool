import {useEffect, useState} from 'react';
import './App.css';
import {
    CompareGrids,
    CompareSpawnGroups,
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
    SyncSpawnGroup,
    SyncSpawnPoints
} from "../wailsjs/go/main/App";
import ConnectModal from './components/ConnectModal';
import ConfirmSyncModal from './components/ConfirmSyncModal';
import ConfirmSpawnSyncModal from './components/ConfirmSpawnSyncModal';
import SpawnHelpDrawer from './components/SpawnHelpDrawer';
import ConfirmSpawnGroupSyncModal from './components/ConfirmSpawnGroupSyncModal';
import ConfirmGridSyncModal from './components/ConfirmGridSyncModal';
import Sidebar from './components/Sidebar';
import NpcsTab from './components/NpcsTab';
import SpawnsTab from './components/SpawnsTab';
import TodoTab from './components/TodoTab';
import GridsTab from './components/GridsTab';
import SpawngroupsTab from './components/SpawngroupsTab';
import DetailPanel from './components/DetailPanel';
import {needsSpawnPoint} from './lib/npcHelpers';
import {keysSharingSpawngroup, spawnCoords, spawnKey, spawnRowSelectable} from './lib/spawnHelpers';
import {gridId, gridRowSelectable} from './lib/gridHelpers';

// A fresh, independent SSH sub-config object per call — used for both sourceSsh/sinkSsh's initial
// state and for hydrating from a loaded Config that predates this field (see the LoadConfig
// useEffect below), so an old config.json with no Source.SshConfig still gets sane defaults
// instead of undefined fields the ConnectModal inputs would choke on.
function defaultSshConfig() {
    return {
        enabled: false,
        host: '', port: '22', username: '',
        authMethod: 'privateKey',
        password: '', privateKeyPath: '', passphrase: ''
    }
}

// Converts a loaded Go ConnectionConfig's UseSSH/SshConfig fields into the flat `ssh` object
// shape ConnectModal reads — the inverse of connectionConfigFor() below. Spread onto
// defaultSshConfig() at the call site (not here) so a config.json predating this feature, or one
// with a partially-empty SshConfig, still ends up with every field defined.
function hydrateSshConfig(connectionConfig) {
    const ssh = connectionConfig?.SshConfig
    if (!ssh) return {}
    return {
        enabled: !!connectionConfig.UseSSH,
        host: ssh.Host ?? '', port: ssh.Port || '22', username: ssh.Username ?? '',
        authMethod: ssh.AuthMethod || 'privateKey',
        password: ssh.Password ?? '', privateKeyPath: ssh.PrivateKeyPath ?? '', passphrase: ssh.Passphrase ?? ''
    }
}

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
    // One object per side (not 7 more value+setter pairs) — see ConnectModal's header comment.
    // authMethod defaults to 'privateKey' since that's the more common bastion-host setup; port
    // defaults to '22' the way desktop DB clients pre-fill it rather than leaving it blank.
    const [sourceSsh, setSourceSsh] = useState(() => defaultSshConfig())
    const [sinkSsh, setSinkSsh] = useState(() => defaultSshConfig())
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
    const [npcSearchFilter, setNpcSearchFilter] = useState('')  // matches NPC name, see npcRowMatchesSearch()
    const [selectedRowKey, setSelectedRowKey] = useState(null)
    const [sortBy, setSortBy] = useState('status')
    const [sortDir, setSortDir] = useState('asc')
    const [detailWidth, setDetailWidth] = useState(240)
    const [sidebarWidth, setSidebarWidth] = useState(256)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [selectedNPCs, setSelectedNPCs] = useState(new Set())
    const [showSyncPreview, setShowSyncPreview] = useState(false)
    const [syncPreview, setSyncPreview] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [syncOutcome, setSyncOutcome] = useState(null)
    const [showSyncConfirm, setShowSyncConfirm] = useState(false)
    const [syncSpawns, setSyncSpawns] = useState(false)
    const [activeView, setActiveView] = useState('npcs') // 'npcs' | 'todo' | 'spawns' | 'grids' | 'spawngroups'
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

    // SyncSpawnGroup confirm modal — shared by two trigger points: the Spawn Points detail panel's
    // per-row action and the Spawngroups tab's own row action (see openSyncSpawnGroupPreview below).
    // Coords/pools/source are captured at open time so the modal itself never needs to know which
    // tab triggered it.
    const [showSpawnGroupSyncConfirm, setShowSpawnGroupSyncConfirm] = useState(false)
    const [spawnGroupSyncPreview, setSpawnGroupSyncPreview] = useState(null)  // dry-run SpawnGroupSyncResult, null while loading
    const [spawnGroupSyncError, setSpawnGroupSyncError] = useState(null)  // unexpected Go-level error, separate from the "blocked"/"not found" outcomes the result itself carries
    const [syncingSpawnGroup, setSyncingSpawnGroup] = useState(false)
    const [spawnGroupSyncCoords, setSpawnGroupSyncCoords] = useState(null)  // [x,y,z] identifying the target spawngroup, for SyncSpawnGroup
    const [spawnGroupSyncPools, setSpawnGroupSyncPools] = useState({source: [], sink: []})  // entry preview data for the confirm modal
    const [spawnGroupSyncSource, setSpawnGroupSyncSource] = useState(null)  // 'spawns' | 'spawngroups' — which tab's selection/diff-list to refresh after a successful sync

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

    // Spawngroups tab
    const [spawnGroupDiffRows, setSpawnGroupDiffRows] = useState([])
    const [spawnGroupDiffLoading, setSpawnGroupDiffLoading] = useState(false)
    const [spawnGroupDiffFilter, setSpawnGroupDiffFilter] = useState('all')
    const [selectedSpawnGroupRow, setSelectedSpawnGroupRow] = useState(null)

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

    function runSyncSpawnGroup(coords, dryRun) {
        const [x, y, z] = coords
        return SyncSpawnGroup({
            ZoneShortName: selectedZoneShortName,
            ZoneVersion: selectedZoneVersion,
            X: x, Y: y, Z: z,
            DryRun: dryRun
        })
    }

    // Shared entry point for both trigger sites — coords identify the target spawngroup (see
    // SyncSpawnGroup), pools feed the confirm modal's entry preview table, and source tags which
    // tab's selection/diff-list executeSyncSpawnGroup() should refresh afterward.
    function openSyncSpawnGroupPreview(coords, pools, source) {
        setSpawnGroupSyncCoords(coords)
        setSpawnGroupSyncPools(pools)
        setSpawnGroupSyncSource(source)
        setShowSpawnGroupSyncConfirm(true)
        setSpawnGroupSyncPreview(null)
        setSpawnGroupSyncError(null)
        runSyncSpawnGroup(coords, true)
            .then(setSpawnGroupSyncPreview)
            .catch(err => setSpawnGroupSyncError(String(err)))
    }

    // Triggered from the Spawn Points detail panel's per-row action — wraps the shared opener with
    // the coordinate/pool extraction specific to a SpawnDiffRow shape.
    function openSyncSpawnGroupPreviewFromSpawn(row) {
        openSyncSpawnGroupPreview(spawnCoords(row), {source: row.Source?.Pool, sink: row.Sink?.Pool}, 'spawns')
    }

    // Triggered from the Spawngroups tab's own row action — same shared opener, extraction
    // specific to a SpawnGroupDiffRow shape (SampleCoord/SourcePool/SinkPool live directly on it).
    function openSyncSpawnGroupPreviewFromSpawnGroup(row) {
        openSyncSpawnGroupPreview(row.SampleCoord, {source: row.SourcePool, sink: row.SinkPool}, 'spawngroups')
    }

    function executeSyncSpawnGroup() {
        setSyncingSpawnGroup(true)
        runSyncSpawnGroup(spawnGroupSyncCoords, false)
            .then(() => {
                setShowSpawnGroupSyncConfirm(false)
                setSpawnGroupSyncPreview(null)
                if (spawnGroupSyncSource === 'spawns') {
                    setSelectedSpawnRow(null)
                    loadSpawnDiffs()
                } else {
                    setSelectedSpawnGroupRow(null)
                    loadSpawnGroupDiffs()
                }
            })
            .catch(err => setSpawnGroupSyncError(String(err)))
            .finally(() => setSyncingSpawnGroup(false))
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

    function loadSpawnGroupDiffs() {
        if (!selectedZoneShortName) return
        setSpawnGroupDiffLoading(true)
        setSpawnGroupDiffRows([])
        CompareSpawnGroups(selectedZoneShortName, selectedZoneVersion)
            .then(setSpawnGroupDiffRows)
            .catch(err => console.error("compare spawngroups failed:", err))
            .finally(() => setSpawnGroupDiffLoading(false))
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
        setSelectedSpawnGroupRow(null)
        setSpawnGroupDiffRows([])
        setSpawnGroupDiffLoading(true)
        CompareSpawnGroups(zone.ShortName, zone.Version)
            .then(setSpawnGroupDiffRows)
            .catch(err => console.error("compare spawngroups failed:", err))
            .finally(() => setSpawnGroupDiffLoading(false))
    }

    // Builds one side's full ConnectionConfig (DB fields + SSH tunnel sub-config) from App.jsx
    // state — shared by connect() and persistUIPrefs() so there's exactly one place that knows
    // how a `ssh` object (see defaultSshConfig) maps onto the Go SshConfig shape.
    function connectionConfigFor(host, port, username, password, dbName, ssh) {
        return {
            Host: host, Port: port, Username: username, Password: password, DbName: dbName,
            UseSSH: ssh.enabled,
            SshConfig: {
                Host: ssh.host, Port: ssh.port, Username: ssh.username,
                AuthMethod: ssh.authMethod, Password: ssh.password,
                PrivateKeyPath: ssh.privateKeyPath, Passphrase: ssh.passphrase
            }
        }
    }

    function currentFullConfig(overrides = {}) {
        return {
            Source: connectionConfigFor(sourceHost, sourcePort, sourceUsername, sourcePassword, dbSourceName, sourceSsh),
            Sink: connectionConfigFor(sinkHost, sinkPort, sinkUsername, sinkPassword, dbSinkName, sinkSsh),
            UI: {
                SidebarWidth: sidebarWidth,
                SidebarCollapsed: sidebarCollapsed,
                DetailWidth: detailWidth,
                ...overrides
            }
        }
    }

    // Persists the current layout prefs (or an override taken mid-drag, before its setState has
    // committed) alongside the connection config that's already threaded through App.jsx state —
    // SaveConfig always writes the whole Config, so this reads the same state connect() saves
    // rather than introducing a second source of truth for it. Both this and connect() route
    // through currentFullConfig() so neither call can accidentally overwrite the other's half of
    // the file with zero values (a real, if minor, bug this replaced — connect()'s own SaveConfig
    // used to omit UI entirely, silently resetting sidebar/detail width on every reconnect).
    function persistUIPrefs(overrides = {}) {
        SaveConfig(currentFullConfig(overrides)).catch(err => console.error("save UI prefs failed:", err))
    }

    function connect() {
        setConnectError(null)
        setConnecting(true)
        const isSource = activeModal === 'source'
        const config = isSource
            ? connectionConfigFor(sourceHost, sourcePort, sourceUsername, sourcePassword, dbSourceName, sourceSsh)
            : connectionConfigFor(sinkHost, sinkPort, sinkUsername, sinkPassword, dbSinkName, sinkSsh)
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
                SaveConfig(currentFullConfig()).catch(err => console.error("save config failed:", err))
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
                setSourceSsh({...defaultSshConfig(), ...hydrateSshConfig(config.Source)})
                setSinkSsh({...defaultSshConfig(), ...hydrateSshConfig(config.Sink)})

                // A config.json written before this field existed has no UI key at all; a zero
                // value here (SidebarWidth: 0, etc.) means "never explicitly set" either way, so
                // falling back to the existing hardcoded defaults is correct in both cases.
                if (config.UI) {
                    if (config.UI.SidebarWidth) setSidebarWidth(config.UI.SidebarWidth)
                    if (config.UI.DetailWidth) setDetailWidth(config.UI.DetailWidth)
                    setSidebarCollapsed(!!config.UI.SidebarCollapsed)
                }

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
    // PoolDiffers can be true on a "match"-status row (its own spawn2 fields match, only its spawn
    // entries differ) — invisible in the +/~/- badges above, which only count new/modified/removed.
    // Counted separately so a zone with only entry-level drift doesn't look clean at a glance.
    const spawnEntriesDifferCount = spawnDiffRows?.filter(r => r.PoolDiffers).length
    // Mirrors npcActionableCount's semantics ("how much differs", not "how much is auto-syncable")
    // so the two tab badges answer the same kind of question — includes match-status rows whose
    // spawn entries differ, since those need a human's attention just as much as a "modified" row.
    const spawnNeedsAttentionCount = spawnDiffRows?.filter(r => (r.Status !== 'match' && r.Status !== 'removed') || r.PoolDiffers).length
    const gridNewCount = gridDiffRows.filter(r => r.Status === 'new').length
    const gridModifiedCount = gridDiffRows.filter(r => r.Status === 'modified').length
    const gridRemovedCount = gridDiffRows.filter(r => r.Status === 'removed').length
    const selectableGridRows = gridDiffRows.filter(gridRowSelectable)
    const spawnGroupNewCount = spawnGroupDiffRows.filter(r => r.Status === 'new').length
    const spawnGroupModifiedCount = spawnGroupDiffRows.filter(r => r.Status === 'modified').length
    const spawnGroupRemovedCount = spawnGroupDiffRows.filter(r => r.Status === 'removed').length
    const spawnGroupAmbiguousCount = spawnGroupDiffRows.filter(r => r.Status === 'ambiguous').length
    // "new"/"removed" spawngroup rows are display-only (see spawnGroupRowSelectable — a "new"
    // spawngroup has no sink spawn2 location to attach to yet, same reason "new" spawn2 rows in
    // the Spawn Points tab work the other way instead), so this badge counts anything worth a
    // look (new/modified/ambiguous), not just what's currently syncable — same "actionable, not
    // auto-syncable" semantics as npcActionableCount/spawnNeedsAttentionCount above.
    const spawnGroupNeedsAttentionCount = spawnGroupDiffRows.filter(r => r.Status !== 'match' && r.Status !== 'removed').length
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
                ssh={activeModal === 'source' ? sourceSsh : sinkSsh}
                setSsh={activeModal === 'source' ? setSourceSsh : setSinkSsh}
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
            <ConfirmSpawnGroupSyncModal
                showSpawnGroupSyncConfirm={showSpawnGroupSyncConfirm}
                setShowSpawnGroupSyncConfirm={setShowSpawnGroupSyncConfirm}
                spawnGroupSyncError={spawnGroupSyncError}
                spawnGroupSyncPreview={spawnGroupSyncPreview}
                sourcePool={spawnGroupSyncPools.source} sinkPool={spawnGroupSyncPools.sink}
                syncingSpawnGroup={syncingSpawnGroup}
                executeSyncSpawnGroup={executeSyncSpawnGroup}
                dbSinkName={dbSinkName}
            />
            <ConfirmGridSyncModal
                showGridSyncConfirm={showGridSyncConfirm} setShowGridSyncConfirm={setShowGridSyncConfirm}
                dbSinkName={dbSinkName} gridSyncPreview={gridSyncPreview} executeGridSync={executeGridSync}
            />
            <div className="flex flex-1 min-h-0">
                {sidebarCollapsed ? (
                    <button
                        onClick={() => {
                            setSidebarCollapsed(false)
                            persistUIPrefs({SidebarCollapsed: false})
                        }}
                        title="Show sidebar"
                        className="w-5 bg-gray-900 hover:bg-gray-800 border-r border-gray-700 flex items-center justify-center text-gray-500 hover:text-yellow-400 cursor-pointer flex-shrink-0 text-base leading-none">
                        ›
                    </button>
                ) : (
                    <>
                        <Sidebar
                            sourceConnected={sourceConnected} sourceHost={sourceHost}
                            sinkConnected={sinkConnected} sinkHost={sinkHost}
                            setActiveModal={setActiveModal} setConnectError={setConnectError}
                            searchFilter={searchFilter} setSearchFilter={setSearchFilter}
                            showSyncPreview={showSyncPreview} showSpawnSyncPreview={showSpawnSyncPreview}
                            zones={zones} selectedZoneId={selectedZoneId} onSelectZone={selectZone}
                            width={sidebarWidth}
                        />
                        {/* Sidebar resize/collapse handle — mirrors the detail panel's drag handle, but
                            dragging right (not left) grows this one since it's on the opposite edge.
                            The toggle button is a normal (non-absolute) flex child, deliberately not
                            absolutely-positioned-and-centered over the thin bar — that approach clipped
                            unpredictably depending on the surrounding stacking context. As a flex child
                            wider than its 8px parent, it just overflows visibly on both sides instead. */}
                        <div
                            className="w-2 bg-gray-700 hover:bg-yellow-400 cursor-col-resize flex-shrink-0 flex items-center justify-center"
                            onMouseDown={(e) => {
                                e.preventDefault()
                                const startX = e.clientX
                                const startWidth = sidebarWidth
                                // Tracked locally (not read back from state) because onMouseUp's
                                // closure captures whatever sidebarWidth was at drag-start — by the
                                // time the drag ends, several setSidebarWidth calls have happened
                                // but this closure was never re-created to see the latest one.
                                let finalWidth = startWidth
                                const onMouseMove = (e) => {
                                    const delta = e.clientX - startX
                                    finalWidth = Math.max(160, Math.min(500, startWidth + delta))
                                    setSidebarWidth(finalWidth)
                                }
                                const onMouseUp = () => {
                                    window.removeEventListener('mousemove', onMouseMove)
                                    window.removeEventListener('mouseup', onMouseUp)
                                    persistUIPrefs({SidebarWidth: finalWidth})
                                }
                                window.addEventListener('mousemove', onMouseMove)
                                window.addEventListener('mouseup', onMouseUp)
                            }}
                        >
                            <button
                                onClick={() => {
                                    setSidebarCollapsed(true)
                                    persistUIPrefs({SidebarCollapsed: true})
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                title="Hide sidebar"
                                className="w-5 h-8 flex items-center justify-center bg-gray-600 hover:bg-yellow-400 border border-gray-500 hover:border-yellow-400 rounded shadow-sm text-gray-200 hover:text-gray-900 text-sm leading-none cursor-pointer">
                                ‹
                            </button>
                        </div>
                    </>
                )}
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
                            {spawnEntriesDifferCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400"
                                      title="Spawn entries differ from source, including locations whose own spawn2 fields otherwise match">
                                    ⚠{spawnEntriesDifferCount}
                                </span>
                            )}
                        </>}
                        {activeView === 'grids' && gridDiffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{gridNewCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{gridModifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{gridRemovedCount}</span>
                        </>}
                        {activeView === 'spawngroups' && spawnGroupDiffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{spawnGroupNewCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{spawnGroupModifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{spawnGroupRemovedCount}</span>
                            {spawnGroupAmbiguousCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400"
                                      title="Source spawngroup's member locations resolved to more than one sink spawngroup — flagged for manual review, not guessed">
                                    ⚠{spawnGroupAmbiguousCount}
                                </span>
                            )}
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
                                Spawn Points{spawnNeedsAttentionCount > 0 && ` (${spawnNeedsAttentionCount})`}
                            </button>
                            <button
                                onClick={() => setActiveView('spawngroups')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'spawngroups' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                Spawngroups{spawnGroupNeedsAttentionCount > 0 && ` (${spawnGroupNeedsAttentionCount})`}
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
                            npcSearchFilter={npcSearchFilter} setNpcSearchFilter={setNpcSearchFilter}
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

                    {/* Spawngroups view */}
                    {activeView === 'spawngroups' && (
                        <SpawngroupsTab
                            spawnGroupDiffRows={spawnGroupDiffRows} spawnGroupDiffLoading={spawnGroupDiffLoading}
                            spawnGroupDiffFilter={spawnGroupDiffFilter} setSpawnGroupDiffFilter={setSpawnGroupDiffFilter}
                            selectedSpawnGroupRow={selectedSpawnGroupRow} setSelectedSpawnGroupRow={setSelectedSpawnGroupRow}
                            selectedZoneShortName={selectedZoneShortName}
                        />
                    )}
                </div>
                {/* Drag handle + detail panel are omitted entirely on the TODO tab — it has no
                    corresponding detail content (see DetailPanel), so hiding both lets the TODO
                    list's flex-1 center panel reclaim that width instead of it sitting idle. */}
                {activeView !== 'todo' && (
                    <>
                        <div
                            className="w-1 bg-gray-700 hover:bg-yellow-400 cursor-col-resize"
                            onMouseDown={(e) => {
                                e.preventDefault()
                                const startX = e.clientX
                                const startWidth = detailWidth
                                let finalWidth = startWidth
                                const onMouseMove = (e) => {
                                    const delta = startX - e.clientX
                                    finalWidth = Math.max(180, Math.min(600, startWidth + delta))
                                    setDetailWidth(finalWidth)
                                }
                                const onMouseUp = () => {
                                    window.removeEventListener('mousemove', onMouseMove)
                                    window.removeEventListener('mouseup', onMouseUp)
                                    persistUIPrefs({DetailWidth: finalWidth})
                                }
                                window.addEventListener('mousemove', onMouseMove)
                                window.addEventListener('mouseup', onMouseUp)
                            }}
                        />
                        {/* Detail panel (NPC / Spawn Point / Grid, depending on active tab) */}
                        <DetailPanel
                            activeView={activeView} setShowSpawnHelp={setShowSpawnHelp} detailWidth={detailWidth}
                            selectedNpc={selectedNpc}
                            selectedSpawnRow={selectedSpawnRow}
                            selectAllSharingSpawngroup={selectAllSharingSpawngroup}
                            openSyncSpawnGroupPreview={openSyncSpawnGroupPreviewFromSpawn}
                            selectedGridRow={selectedGridRow}
                            selectedSpawnGroupRow={selectedSpawnGroupRow}
                            openSyncSpawnGroupPreviewFromSpawnGroup={openSyncSpawnGroupPreviewFromSpawnGroup}
                            expandedSections={expandedSections} setExpandedSections={setExpandedSections}
                        />
                    </>
                )}
            </div>
        </div>
    )
}

export default App
