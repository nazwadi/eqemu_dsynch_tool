import {spawnGroupRowId, spawnGroupRowLabel} from '../lib/spawnGroupHelpers';

// Spawngroups tab body: a diff list only, no sync preview/confirm slide-over like the other tabs —
// syncing a spawngroup is a deliberate, single-row action (mirroring how the Spawn Points tab's
// entries sync always worked), triggered from the detail panel once a row is selected, not a
// batch-checkbox action from this list. Also deliberately simpler than SpawnsTab: no sort/search
// controls, same reasoning GridsTab gives for skipping them — spawngroups per zone are a diff-
// grouping of the same spawn2 data already shown in the Spawn Points tab, so there are typically
// fewer of them than spawn2 locations, not more.
function SpawngroupsTab({
    spawnGroupDiffRows, spawnGroupDiffLoading, spawnGroupDiffFilter, setSpawnGroupDiffFilter,
    selectedSpawnGroupRow, setSelectedSpawnGroupRow,
    selectedZoneShortName
}) {
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex gap-2 px-3 py-2 border-b border-gray-700">
                <button
                    onClick={() => setSpawnGroupDiffFilter('all')}
                    className={`text-xs px-3 py-1 rounded border ${spawnGroupDiffFilter === 'all' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                    Show All
                </button>
                <button
                    onClick={() => setSpawnGroupDiffFilter('diff')}
                    className={`text-xs px-3 py-1 rounded border ${spawnGroupDiffFilter === 'diff' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                    Differences Only
                </button>
            </div>
            <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-700 bg-gray-850">
                Each row is one <span className="text-gray-400">spawngroup</span>, matched by looking up which sink spawngroup(s) its member spawn2 locations resolve to — not by ID, which isn't portable across databases. Select a row to view its fields and sync it from the detail panel.
            </div>
            <div className="flex items-center border-b border-gray-700 bg-gray-800">
                <div className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider">
                    Source
                </div>
                <div className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider border-l border-gray-700">
                    Sink
                </div>
            </div>
            {spawnGroupDiffLoading ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                    Loading spawngroups…
                </div>
            ) : spawnGroupDiffRows.length === 0 && selectedZoneShortName ? (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                    No spawngroups found in this zone
                </div>
            ) : (
                <div className="flex flex-1 min-h-0 overflow-hidden flex-col overflow-y-auto">
                    {spawnGroupDiffRows
                        .filter(row => spawnGroupDiffFilter === 'all' || row.Status !== 'match')
                        .map((row) => {
                            const id = spawnGroupRowId(row)
                            return (
                                <div key={id}
                                     className={`flex items-center border-b border-gray-800 cursor-pointer ${
                                         selectedSpawnGroupRow && spawnGroupRowId(selectedSpawnGroupRow) === id ? 'bg-blue-900/40 border-l-2 border-l-yellow-400' :
                                             row.Status === 'new' ? 'bg-green-950 border-l-2 border-l-transparent' :
                                                 row.Status === 'removed' ? 'bg-red-950 border-l-2 border-l-transparent' :
                                                     row.Status === 'ambiguous' ? 'bg-orange-950/60 border-l-2 border-l-transparent' :
                                                         row.Status === 'modified' ? 'bg-yellow-950 border-l-2 border-l-transparent' :
                                                             'bg-transparent border-l-2 border-l-transparent'
                                     }`}
                                     onClick={() => setSelectedSpawnGroupRow(row)}
                                >
                                    {row.Status === 'ambiguous' && (
                                        <span className="text-amber-400 text-xs px-1"
                                              title="Member locations resolved to more than one sink spawngroup — flagged for manual review">⚠</span>
                                    )}
                                    {row.Status !== 'ambiguous' && row.PoolDiffers && (
                                        <span className="text-amber-400 text-xs px-1" title="Spawn entries differ from source">⚠</span>
                                    )}
                                    <div className="flex-1 text-xs px-2 py-1">
                                        {row.SourceGroupId ? spawnGroupRowLabel(row.Name, row.SourcePool, row.SourceLocationCount) : '-'}
                                    </div>
                                    <div className="flex-1 text-xs px-2 py-1 border-l border-gray-700">
                                        {row.SinkGroupId ? spawnGroupRowLabel(row.Name, row.SinkPool, row.SinkLocationCount) : '-'}
                                    </div>
                                </div>
                            )
                        })}
                </div>
            )}
        </div>
    )
}

export default SpawngroupsTab
