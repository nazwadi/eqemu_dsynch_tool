import {PickMapsDirectory} from '../../wailsjs/go/main/App';

// Status → dot color/animation/label, shared by both connection cards below. 'connecting' pulses
// (the same animate-pulse Tailwind already ships) rather than sitting static green/red — the
// startup auto-connect race was previously invisible in the UI, just silently red until it either
// flipped green or didn't; a distinct in-progress state is the same signal DBeaver/TablePlus/
// DataGrip all give while a connection is being established, not just a binary connected/not.
const statusMeta = {
    connected: {dot: 'bg-green-500', label: 'Connected', text: 'text-green-400'},
    connecting: {dot: 'bg-amber-400 animate-pulse', label: 'Connecting…', text: 'text-amber-400'},
    error: {dot: 'bg-red-500', label: 'Connection failed', text: 'text-red-400'},
    disconnected: {dot: 'bg-gray-600', label: 'Disconnected', text: 'text-gray-500'}
}

// One connection card (Source or Sink) — extracted as its own component since the two cards were
// previously hand-duplicated verbatim; this is the same content parameterized by side. Mirrors the
// status-dot + name + host/db + action-button shape professional DB clients (TablePlus, DBeaver,
// DataGrip) use for a connection list entry, scaled down to this app's fixed two-slot layout
// (always exactly Source + Sink, never an arbitrary list) rather than a full connection-manager UI
// that would be over-engineering for a tool that structurally never has more than these two.
function ConnectionCard({
    label, status, lastError, host, dbName, sshEnabled,
    autoConnect, onToggleAutoConnect,
    onEdit, onConnect, onDisconnect
}) {
    const meta = statusMeta[status] ?? statusMeta.disconnected
    const connected = status === 'connected'
    const busy = status === 'connecting'
    return (
        <div className="border border-gray-700 rounded-md px-2.5 py-2 flex flex-col gap-1.5 bg-gray-850">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dot}`}
                          title={status === 'error' && lastError ? lastError : meta.label}/>
                    <span className="text-xs font-medium text-gray-200">{label}</span>
                    {sshEnabled && (
                        <span className="text-[10px] leading-none px-1 py-0.5 rounded border border-gray-600 text-gray-400 shrink-0"
                              title="Connected through an SSH tunnel">SSH</span>
                    )}
                </div>
                <button onClick={onEdit}
                        title={`Edit ${label.toLowerCase()} connection settings`}
                        className="text-xs text-gray-500 hover:text-white shrink-0 cursor-pointer">
                    Edit
                </button>
            </div>
            <div className="text-xs text-gray-500 truncate" title={host || undefined}>
                {host ? `${host}${dbName ? ` · ${dbName}` : ''}` : 'No connection configured'}
            </div>
            <div className="flex items-center justify-between gap-2">
                <span className={`text-xs ${meta.text}`} title={status === 'error' && lastError ? lastError : undefined}>
                    {meta.label}
                </span>
                <button onClick={connected ? onDisconnect : onConnect}
                        disabled={busy || !host}
                        title={!host ? 'Set up this connection first' : undefined}
                        className={`text-xs px-2 py-1 rounded border shrink-0 disabled:opacity-40 disabled:cursor-not-allowed ${
                            connected
                                ? 'border-red-800 text-red-400 hover:border-red-500 hover:text-red-300'
                                : 'border-gray-600 text-gray-300 hover:border-gray-400 hover:text-white'
                        }`}>
                    {connected ? 'Disconnect' : busy ? 'Connecting…' : 'Connect'}
                </button>
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 cursor-pointer pt-0.5 border-t border-gray-800"
                    title="Automatically connect this side when the app starts. Turn off if you're rebuilding/restarting a lot and don't want an SSH tunnel repeatedly reconnecting.">
                <input type="checkbox"
                       className="accent-yellow-400 cursor-pointer w-3 h-3"
                       checked={autoConnect}
                       onChange={e => onToggleAutoConnect(e.target.checked)}/>
                Auto-connect on startup
            </label>
        </div>
    )
}

// Left rail: connection status/edit cards + the searchable zone list. Purely presentational —
// the actual "what happens when a zone is clicked" logic (resetting NPC/spawn selection state,
// firing both CompareZones and CompareSpawns) stays in App.jsx as selectZone(), passed down as
// onSelectZone, since that's genuine cross-cutting business logic, not something this component
// should own.
function Sidebar({
    sourceStatus, sourceHost, dbSourceName, sourceSshEnabled, sourceAutoConnect, setSourceAutoConnect, sourceLastError,
    sinkStatus, sinkHost, dbSinkName, sinkSshEnabled, sinkAutoConnect, setSinkAutoConnect, sinkLastError,
    setActiveModal, setConnectError, onDisconnect,
    searchFilter, setSearchFilter, showSyncPreview, showSpawnSyncPreview,
    zones, selectedZoneId, onSelectZone, width,
    mapsDirectory, setMapsDirectory
}) {
    const locked = showSyncPreview || showSpawnSyncPreview
    return (
        <div style={{width, minWidth: width}}
             className="bg-gray-900 border-b border-gray-700 flex flex-col h-full min-h-0">
            <div
                className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700">
                Connections
            </div>
            <div className="px-3 py-2 flex flex-col gap-2">
                <ConnectionCard
                    label="Source" status={sourceStatus} lastError={sourceLastError}
                    host={sourceHost} dbName={dbSourceName} sshEnabled={sourceSshEnabled}
                    autoConnect={sourceAutoConnect} onToggleAutoConnect={setSourceAutoConnect}
                    onEdit={() => {
                        setActiveModal('source')
                        setConnectError(null)
                    }}
                    onConnect={() => {
                        setActiveModal('source')
                        setConnectError(null)
                    }}
                    onDisconnect={() => onDisconnect(true)}
                />
                <ConnectionCard
                    label="Sink" status={sinkStatus} lastError={sinkLastError}
                    host={sinkHost} dbName={dbSinkName} sshEnabled={sinkSshEnabled}
                    autoConnect={sinkAutoConnect} onToggleAutoConnect={setSinkAutoConnect}
                    onEdit={() => {
                        setActiveModal('sink')
                        setConnectError(null)
                    }}
                    onConnect={() => {
                        setActiveModal('sink')
                        setConnectError(null)
                    }}
                    onDisconnect={() => onDisconnect(false)}
                />
            </div>
            {/* Brewall's Maps folder — a plain path setting, not a "connection," so it saves
                immediately on pick rather than going through the Connect modal's confirm flow.
                See the Grids tab's Map view for what this actually drives. */}
            <div className="px-3 pb-2 flex items-center justify-between gap-2 border-b border-gray-700">
                <div className="min-w-0">
                    <div className="text-xs text-gray-400">Maps folder</div>
                    <div className="text-xs text-white truncate" title={mapsDirectory || undefined}>
                        {mapsDirectory || 'Not set'}
                    </div>
                </div>
                <button
                    onClick={() => PickMapsDirectory().then(dir => { if (dir) setMapsDirectory(dir) })}
                    className="text-xs text-gray-400 border border-gray-600 rounded px-2 py-1 hover:text-white hover:border-gray-400 shrink-0">
                    Browse…
                </button>
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
                       disabled={locked}
                       autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
            </div>
            <div className="overflow-y-auto flex-1 pl-2 pt-2">
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
                                        if (locked) return
                                        onSelectZone(zone)
                                    }}
                                    key={zone.Id}
                                    className={`truncate px-2 py-1 border-l-2 ${
                                        locked ? 'opacity-40 cursor-not-allowed border-l-transparent' :
                                            selectedZoneId === zone.Id ? 'bg-blue-900/40 border-l-yellow-400 text-yellow-400 cursor-pointer' : 'border-l-transparent cursor-pointer hover:bg-gray-800'
                                    }`}
                                >
                                    {zone.LongName} <span className="text-gray-500 text-xs">({zone.ShortName} v{zone.Version})</span>
                                </li>
                            ))}
                    </ul>
                </div>
            </div>
        </div>
    )
}

export default Sidebar
