import {gridId, gridRowSelectable, gridWaypointSummary} from '../lib/gridHelpers';

// Grids tab body: diff list (Show All/Differences Only, checkbox selection) sliding to a sync
// preview panel — same shape as NpcsTab/SpawnsTab. No sort/search controls here: grids per zone
// are typically a handful to a few dozen, nowhere near spawn2's scale, so the extra UI SpawnsTab
// needed isn't earning its keep yet. Can add later if a zone turns out to need it.
function GridsTab({
    gridDiffRows, gridDiffLoading, gridDiffFilter, setGridDiffFilter,
    selectedGridIds, setSelectedGridIds, selectedGridRow, setSelectedGridRow,
    selectedZoneShortName,
    showGridSyncPreview, setShowGridSyncPreview, gridSyncPreview, gridSyncing, gridSyncOutcome,
    setShowGridSyncConfirm
}) {
    const selectableGridRows = gridDiffRows.filter(gridRowSelectable)
    return (
        <div className="flex-1 relative overflow-hidden">

            {/* Diff View */}
            <div className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out z-0 ${
                showGridSyncPreview ? '-translate-x-full' : 'translate-x-0'
            }`}>

                <div className="flex gap-2 px-3 py-2 border-b border-gray-700">
                    <button
                        onClick={() => setGridDiffFilter('all')}
                        className={`text-xs px-3 py-1 rounded border ${gridDiffFilter === 'all' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                        Show All
                    </button>
                    <button
                        onClick={() => setGridDiffFilter('diff')}
                        className={`text-xs px-3 py-1 rounded border ${gridDiffFilter === 'diff' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                        Differences Only
                    </button>
                </div>
                <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-700 bg-gray-850">
                    Each row is one <span className="text-gray-400">grid</span> (patrol path), matched by its own ID within this zone — grid IDs aren't auto-generated, so they're trusted as identity here, unlike spawn2/spawngroup.
                </div>
                <div className="flex items-center border-b border-gray-700 bg-gray-800">
                    <input type="checkbox"
                           className="accent-yellow-400 cursor-pointer w-3 h-3 mx-2"
                           title="Only new and modified grids can be synced from this tab"
                           checked={selectableGridRows.length > 0 && selectableGridRows.every(row => selectedGridIds.has(gridId(row)))}
                           onChange={(e) => {
                               if (e.target.checked) {
                                   setSelectedGridIds(new Set(selectableGridRows.map(gridId)))
                               } else {
                                   setSelectedGridIds(new Set())
                               }
                           }}
                    />
                    <div className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider">
                        Source
                    </div>
                    <div
                        className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider border-l border-gray-700">
                        Sink
                    </div>
                </div>
                {/*Diff List of Grids*/}
                {gridDiffLoading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                        Loading grids…
                    </div>
                ) : gridDiffRows.length === 0 && selectedZoneShortName ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                        No grids found in this zone
                    </div>
                ) : (
                    <div className="flex flex-1 min-h-0 overflow-hidden flex-col overflow-y-auto">
                        {gridDiffRows
                            .filter(row => gridDiffFilter === 'all' || row.Status !== 'match')
                            .sort((a, b) => gridId(a) - gridId(b))
                            .map((row) => {
                                const id = gridId(row)
                                return (
                                    <div key={id}
                                         className={`flex items-center border-b border-gray-800 cursor-pointer ${
                                             selectedGridRow && gridId(selectedGridRow) === id ? 'bg-blue-900/40 border-l-2 border-l-yellow-400' :
                                                 row.Status === 'new' ? 'bg-green-950 border-l-2 border-l-transparent' :
                                                     row.Status === 'removed' ? 'bg-red-950 border-l-2 border-l-transparent' :
                                                         row.Status === 'modified' ? 'bg-yellow-950 border-l-2 border-l-transparent' :
                                                             'bg-transparent border-l-2 border-l-transparent'
                                         }`}
                                         onClick={() => setSelectedGridRow(row)}
                                    >
                                        <input type="checkbox"
                                               className="accent-yellow-400 cursor-pointer w-3 h-3 mx-2 disabled:opacity-40 disabled:cursor-not-allowed"
                                               checked={selectedGridIds.has(id)}
                                               disabled={!gridRowSelectable(row)}
                                               title={!gridRowSelectable(row) ? "Removed grids can't be synced from this tab" : undefined}
                                               onChange={(e) => {
                                                   e.stopPropagation()
                                                   const newSet = new Set(selectedGridIds)
                                                   if (newSet.has(id)) {
                                                       newSet.delete(id)
                                                   } else {
                                                       newSet.add(id)
                                                   }
                                                   setSelectedGridIds(newSet)
                                               }}
                                               onClick={e => e.stopPropagation()}
                                        />
                                        <div className="flex-1 text-xs px-2 py-1">
                                            {row.Source ? `#${row.Source.Id} — ${gridWaypointSummary(row.Source)}` : '-'}
                                        </div>
                                        <div className="flex-1 text-xs px-2 py-1 border-l border-gray-700">
                                            {row.Sink ? `#${row.Sink.Id} — ${gridWaypointSummary(row.Sink)}` : '-'}
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
                    showGridSyncPreview ? 'translate-x-0' : 'translate-x-full'
                }`}>
                <div className="p-4 flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
                    <div className="flex items-center justify-between border-b border-gray-700 pb-3">
                        <button
                            onClick={() => setShowGridSyncPreview(false)}
                            className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                        >
                            ← Back to Diff
                        </button>
                        <span className="text-xs text-gray-400">
                            {selectedGridIds.size} of {gridDiffRows.length} grids
                        </span>
                        {!gridSyncOutcome && (
                            <button
                                disabled={gridSyncing || !gridSyncPreview || gridSyncPreview.Errors?.length > 0}
                                onClick={() => setShowGridSyncConfirm(true)}
                                className={`text-xs px-3 py-1 rounded font-medium ${
                                    gridSyncing || !gridSyncPreview || gridSyncPreview.Errors?.length > 0
                                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                        : 'bg-yellow-400 text-gray-900 hover:bg-yellow-300'
                                }`}>
                                {gridSyncing ? 'Syncing…' : 'Execute Sync →'}
                            </button>
                        )}
                    </div>

                    {gridSyncOutcome ? (
                        <div className="flex flex-col gap-3">
                            <div className="text-sm text-green-400">
                                {gridSyncOutcome.Created ?? 0} grid{gridSyncOutcome.Created === 1 ? '' : 's'} created,
                                {' '}{gridSyncOutcome.Updated ?? 0} updated
                            </div>
                            {gridSyncOutcome.Errors?.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <div className="text-xs text-gray-400 uppercase tracking-wider">Errors</div>
                                    {gridSyncOutcome.Errors.map((e, i) => (
                                        <div key={i} className="text-xs text-red-400">{e}</div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ) : !gridSyncPreview ? (
                        <div className="text-xs text-gray-500">Comparing…</div>
                    ) : gridSyncPreview.Errors?.length > 0 ? (
                        <div className="flex flex-col gap-1">
                            <div className="text-xs text-gray-400 uppercase tracking-wider">Preview failed</div>
                            {gridSyncPreview.Errors.map((e, i) => (
                                <div key={i} className="text-xs text-red-400">{e}</div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1">
                            <div className="text-xs text-gray-400 uppercase tracking-wider">
                                {selectedGridIds.size} grids selected
                                {gridSyncPreview.Created > 0 && ` · ${gridSyncPreview.Created} will be created`}
                                {gridSyncPreview.Updated > 0 && ` · ${gridSyncPreview.Updated} will be updated`}
                            </div>
                            {gridDiffRows
                                .filter(row => selectedGridIds.has(gridId(row)))
                                .map((row) => {
                                    const point = row.Source ?? row.Sink
                                    return (
                                        <div key={gridId(row)} className="flex items-center gap-2 text-xs px-2 py-1">
                                            <span className={row.Status === 'new' ? 'text-green-400' : 'text-yellow-400'}>
                                                {row.Status === 'new' ? '+' : '~'}
                                            </span>
                                            <span className="text-gray-300">
                                                #{gridId(row)} — {gridWaypointSummary(point)}
                                            </span>
                                        </div>
                                    )
                                })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default GridsTab
