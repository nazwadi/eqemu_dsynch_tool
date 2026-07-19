import {statusOrder} from '../lib/constants';
import {
    fmtCoord,
    spawnEntriesOnly,
    spawnKey,
    spawnRowLabel,
    spawnRowMatchesSearch,
    spawnRowSelectable
} from '../lib/spawnHelpers';

// Spawn Points tab body — mirrors NpcsTab's shape (diff list sliding to a sync preview) but with
// its own sort keys (Status/Spawngroup/Shared), a spawngroup/NPC search filter, and the
// FieldsDiffer-vs-PoolDiffers row treatment specific to spawn2 (see spawnEntriesOnly). Kept
// separate from NpcsTab rather than a shared generic component — see NpcsTab's header comment.
function SpawnsTab({
    spawnDiffRows, spawnDiffLoading, spawnDiffFilter, setSpawnDiffFilter,
    spawnSearchFilter, setSpawnSearchFilter, spawnSortBy, setSpawnSortBy, spawnSortDir, setSpawnSortDir,
    selectableSpawnRows, selectedSpawnKeys, setSelectedSpawnKeys, selectedSpawnRow, setSelectedSpawnRow,
    dbSourceName, dbSinkName, selectedZoneShortName,
    showSpawnSyncPreview, setShowSpawnSyncPreview, spawnSyncPreview, spawnSyncing, spawnSyncOutcome,
    setShowSpawnSyncConfirm
}) {
    return (
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
    )
}

export default SpawnsTab
