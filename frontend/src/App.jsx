import {useEffect, useRef, useState} from 'react';
import './App.css';
import {CompareZones, Connect, GetZones, LoadConfig, SaveConfig, Sync} from "../wailsjs/go/main/App";

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

    useEffect(() => {
        if (activeModal) connectModalRef.current?.focus()
    }, [activeModal])

    useEffect(() => {
        if (showSyncConfirm) syncConfirmModalRef.current?.focus()
    }, [showSyncConfirm])

    function needsSpawnPoint(row) {
        return row.Status === 'new' && row.Source?.HasSpawnPoint
    }

    function runSync(dryRun) {
        return Sync({
            ZoneShortName: selectedZoneShortName,
            ZoneVersion: selectedZoneVersion,
            ZoneIdNumber: selectedZoneIdNumber,
            SyncNPCTypes: true,
            SyncSpawns: false,
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
                return CompareZones(selectedZoneShortName, selectedZoneVersion, selectedZoneIdNumber).then(setDiffRows)
            })
            .catch(err => setSyncOutcome({Errors: [String(err)]}))
            .finally(() => setSyncing(false))
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
    const selectableRows = diffRows.filter(row => (diffFilter === 'all' || row.Status !== 'match') && !needsSpawnPoint(row))
    // Variables for npc_types detail view
    const [expandedSections, setExpandedSections] = useState({
        identity: true,
        combat: true,
        resistances: false,
        ability_scores: false,
        behavior: false,
        references: true
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
                            {selectedNPCs.size} NPCs will be upserted
                        </div>
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
                               disabled={showSyncPreview}
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
                                                if (showSyncPreview) return
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
                                            }}
                                            key={zone.Id}
                                            className={`truncate ${
                                                showSyncPreview ? 'opacity-40 cursor-not-allowed' :
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
                        {diffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{newCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{modifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{removedCount}</span>
                        </>}
                        <button
                            disabled={selectedNPCs.size === 0}
                            className={`ml-auto px-3 py-1 rounded text-xs font-medium ${
                                selectedNPCs.size > 0
                                    ? 'bg-yellow-400 text-gray-900 cursor-pointer hover:bg-yellow-300'
                                    : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                            }`}
                            onClick={() => {
                                setShowSyncPreview(true)
                                setSyncPreview(null)
                                setSyncOutcome(null)
                                runSync(true).then(setSyncPreview)
                            }}
                        >
                            {selectedNPCs.size > 0 ? `Sync ${selectedNPCs.size} NPCs` : 'Sync NPCs'}
                        </button>
                    </div>

                    {/* Sliding content area */}
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
                                            disabled={syncing || !syncPreview}
                                            onClick={() => setShowSyncConfirm(true)}
                                            className={`text-xs px-3 py-1 rounded font-medium ${
                                                syncing || !syncPreview
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
                                            {syncOutcome.NPCsSynced?.length ?? 0} NPCs synced, {syncOutcome.TODOItems?.length ?? 0} TODO items saved
                                        </div>
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
                                ) : (
                                    <>
                                        <div className="flex flex-col gap-1">
                                            <div className="text-xs text-gray-400 uppercase tracking-wider">
                                                NPCs to sync ({syncPreview.NPCsSynced?.length ?? 0})
                                            </div>
                                            {(syncPreview.NPCsSynced ?? []).map(id => {
                                                const row = diffRows.find(r => (r.Source?.Id ?? r.Sink?.Id) === id)
                                                const name = row?.Source?.Fields?.name ?? row?.Sink?.Fields?.name ?? `NPC ${id}`
                                                return (
                                                    <div key={id} className="flex items-center gap-2 text-xs px-2 py-1">
                                                        <span className={row?.Status === 'new' ? 'text-green-400' : 'text-yellow-400'}>
                                                            {row?.Status === 'new' ? '+' : '~'}
                                                        </span>
                                                        <span className="text-gray-300">{name} ({id})</span>
                                                    </div>
                                                )
                                            })}
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

                                        {syncPreview.Errors?.length > 0 && (
                                            <div className="flex flex-col gap-1">
                                                <div className="text-xs text-gray-400 uppercase tracking-wider">Errors</div>
                                                {syncPreview.Errors.map((e, i) => (
                                                    <div key={i} className="text-xs text-red-400">{e}</div>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
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
                {/* NPC View*/}
                <div style={{width: detailWidth, minWidth: detailWidth}} className="bg-gray-800 flex flex-col">
                    <div className="flex flex-col overflow-hidden h-full">
                        <div
                            className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                            NPC Detail
                        </div>
                        <div className="px-2 py-2 flex flex-col gap-1 text-xs overflow-y-auto flex-1">
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
