// Left rail: connection status/edit buttons + the searchable zone list. Purely presentational —
// the actual "what happens when a zone is clicked" logic (resetting NPC/spawn selection state,
// firing both CompareZones and CompareSpawns) stays in App.jsx as selectZone(), passed down as
// onSelectZone, since that's genuine cross-cutting business logic, not something this component
// should own.
function Sidebar({
    sourceConnected, sourceHost, sinkConnected, sinkHost, setActiveModal, setConnectError,
    searchFilter, setSearchFilter, showSyncPreview, showSpawnSyncPreview,
    zones, selectedZoneId, onSelectZone
}) {
    const locked = showSyncPreview || showSpawnSyncPreview
    return (
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
                       disabled={locked}
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
                                        if (locked) return
                                        onSelectZone(zone)
                                    }}
                                    key={zone.Id}
                                    className={`truncate ${
                                        locked ? 'opacity-40 cursor-not-allowed' :
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
    )
}

export default Sidebar
