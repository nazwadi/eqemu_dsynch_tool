import {needsSpawnPoint, npcRowMatchesSearch} from '../lib/npcHelpers';
import {statusOrder} from '../lib/constants';

// NPCs tab body: the diff list (Show All/Differences/sort, checkbox selection) sliding to a sync
// preview panel, mirrored by SpawnsTab for the Spawn Points tab. Kept as two sibling components
// rather than one generic "DiffTab" since the two preview shapes (NPCsSynced/SpawnsSynced vs
// Created/Updated/PoolDiffers) differ enough that a shared version would just be branching
// internally — the same reasoning already used for the confirm modals.
function NpcsTab({
    diffRows, diffLoading, diffFilter, setDiffFilter, npcSearchFilter, setNpcSearchFilter,
    sortBy, setSortBy, sortDir, setSortDir,
    selectableRows, selectedNPCs, setSelectedNPCs, selectedRowKey, setSelectedRowKey, setSelectedNpc,
    syncSpawns, dbSourceName, dbSinkName, selectedZoneShortName,
    showSyncPreview, setShowSyncPreview, syncPreview, syncing, syncOutcome, setShowSyncConfirm
}) {
    return (
        <div className="flex-1 relative overflow-hidden">

            {/* Diff View */}
            <div className={`absolute inset-0 flex flex-col transition-transform duration-200 ease-out z-0 ${
                showSyncPreview ? '-translate-x-full' : 'translate-x-0'
            }`}>

                <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
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
                    <input
                        className="ml-auto w-48 text-xs border border-gray-600 bg-gray-700 rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        placeholder="Filter by NPC name..."
                        value={npcSearchFilter}
                        onChange={e => setNpcSearchFilter(e.target.value)}
                        autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
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
                           title="NPCs that need a spawn point in the sink can't be synced unless 'Create spawn points' (above) is checked"
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
                            .filter(row => npcRowMatchesSearch(row, npcSearchFilter))
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
                                               disabled={needsSpawnPoint(row, syncSpawns)}
                                               title={needsSpawnPoint(row, syncSpawns) ? "This NPC needs a spawn point in the sink — enable 'Create spawn points' above to sync it" : undefined}
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
    )
}

export default NpcsTab
