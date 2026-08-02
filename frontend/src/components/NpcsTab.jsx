import {useState} from 'react';
import {npcNameGroupDiff, npcFieldsOnlyExcluded, npcRowHasMissingReferences, npcRowMatchesSearch, npcRowSelectable} from '../lib/npcHelpers';
import {statusOrder} from '../lib/constants';
import {useListArrowKeyNav} from '../hooks/useListArrowKeyNav';
import IconLegend from './IconLegend';
import ExactMatchToggle from './ExactMatchToggle';

const npcRowIcons = [
    {icon: '⚡', label: 'quest-spawned — no static spawn point'},
    {icon: '⚠', label: 'missing reference — points at a row that doesn\'t exist in its own database'},
    {icon: '⊘', label: 'excluded from sync — differs only in fields Sync won\'t overwrite'}
]

function npcRowKey(row) {
    return `${row.Source?.Id ?? ''}-${row.Sink?.Id ?? ''}`
}

// Shared disclosure-triangle button — same shape as LootTab's Disclosure, left-aligned in reading
// order rather than trailing after other text.
function Disclosure({expanded}) {
    return (
        <span className={`w-4 shrink-0 text-center text-sm ${expanded ? 'text-yellow-400' : 'text-gray-400'}`}>
            {expanded ? '▾' : '▸'}
        </span>
    )
}

// NPC-level source-vs-sink summary, above the full diff list — quick-glance answer to "which NPCs
// are added or missing overall," mirroring LootTab's ItemDiffSummary. Built entirely on NAME
// counts across the whole population (npcNameGroupDiff), deliberately ignoring npc_types.id and
// CompareZones' own Status — see that function's own comment for the real, verified case (Skyfire,
// both databases, 2026-07-30) that ruled out building this from the id-matched new/removed rows:
// some custom content reuses ids independently on each side (a `zoneidnumber*1000 + offset`
// convention), which makes CompareZones pair up two UNRELATED NPCs as one false "modified" row —
// and once that happens, neither NPC ever reaches the new/removed buckets this panel used to
// reconcile from. Pure name-count comparison sidesteps that: it never looks at which id paired
// with which, only how many of each name exist on each side, so a real gap shows up correctly no
// matter how tangled the underlying ids are. Collapsed by default when there's something to show
// (the header's own counts already say whether it's worth opening). Reuses ItemDiffSummary's
// exact list-box shape (bordered, plain block rows, not flex) — the same bug that shape was built
// to avoid (flex children silently squashing/overlapping past ~30 rows, see CLAUDE.md's Loot tab
// notes) applies just as much to a zone with hundreds of NPCs.
function NpcDiffSummary({diffRows, sourceNpcCount, sinkNpcCount}) {
    const [expanded, setExpanded] = useState(false)
    const {onlyInSource, onlyInSink} = npcNameGroupDiff(diffRows)
    const sourceExtra = onlyInSource.reduce((sum, g) => sum + g.delta, 0)
    const sinkExtra = onlyInSink.reduce((sum, g) => sum + g.delta, 0)

    if (onlyInSource.length === 0 && onlyInSink.length === 0) return null

    return (
        <div className="border-b border-gray-700 bg-gray-850">
            <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-800"
                 onClick={() => setExpanded(e => !e)}>
                <Disclosure expanded={expanded}/>
                <span className="text-xs text-gray-400 uppercase tracking-wider">NPC Diff (by name)</span>
                <span className="text-xs text-gray-500">
                    {sourceExtra > 0 && <span className="text-green-400">+{sourceExtra} in source</span>}
                    {sourceExtra > 0 && sinkExtra > 0 && ' · '}
                    {sinkExtra > 0 && <span className="text-red-400">+{sinkExtra} in sink</span>}
                </span>
                <span className="text-xs text-gray-600 ml-auto shrink-0">
                    source {sourceNpcCount} · sink {sinkNpcCount}
                </span>
            </div>
            {expanded && (
                <div className="flex gap-4 px-3 pb-3 text-xs">
                    <div className="flex-1 min-w-0">
                        <div className="text-green-400 mb-1">More in source ({onlyInSource.length} name{onlyInSource.length === 1 ? '' : 's'})</div>
                        <div className="max-h-72 overflow-y-auto rounded border border-gray-700 bg-gray-900/40 p-2 space-y-0.5">
                            {onlyInSource.length === 0 ? <div className="text-gray-600">—</div> : onlyInSource.map(({name, sourceCount, sinkCount, delta}) => (
                                <div key={name} className="text-gray-300 truncate">
                                    {name} <span className="text-gray-600">(source {sourceCount}, sink {sinkCount}, +{delta})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-red-400 mb-1">More in sink ({onlyInSink.length} name{onlyInSink.length === 1 ? '' : 's'})</div>
                        <div className="max-h-72 overflow-y-auto rounded border border-gray-700 bg-gray-900/40 p-2 space-y-0.5">
                            {onlyInSink.length === 0 ? <div className="text-gray-600">—</div> : onlyInSink.map(({name, sourceCount, sinkCount, delta}) => (
                                <div key={name} className="text-gray-300 truncate">
                                    {name} <span className="text-gray-600">(source {sourceCount}, sink {sinkCount}, +{delta})</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// NPCs tab body: the diff list (Show All/Differences/sort, checkbox selection) sliding to a sync
// preview panel, mirrored by SpawnsTab for the Spawn Points tab. Kept as two sibling components
// rather than one generic "DiffTab" since the two preview shapes (NPCsSynced vs
// Created/Updated/SpawnEntriesDiffer) differ enough that a shared version would just be branching
// internally — the same reasoning already used for the confirm modals.
function NpcsTab({
    diffRows, diffLoading, diffFilter, setDiffFilter, npcSearchFilter, setNpcSearchFilter,
    npcSearchExact, setNpcSearchExact, onRefresh,
    sortBy, setSortBy, sortDir, setSortDir,
    selectableRows, selectedNPCs, setSelectedNPCs, selectedRowKey, setSelectedRowKey, setSelectedNpc,
    dbSourceName, dbSinkName, selectedZoneShortName,
    showSyncPreview, setShowSyncPreview, syncPreview, syncing, syncOutcome, setShowSyncConfirm,
    excludedNpcFields, setShowExcludedFieldsDrawer
}) {
    // Total NPC counts per side, regardless of the current filter/search — answers "how many NPCs
    // are actually in each database for this zone" so a diff count like "54 missing from source"
    // has scale to be read against (54 out of 60 sink NPCs reads very differently from 54 out of
    // 600). Counted straight off diffRows rather than visibleRows since a total shouldn't shrink
    // just because the user is currently filtered to "Differences Only" or a name search.
    const sourceNpcCount = diffRows.filter(row => row.Source).length
    const sinkNpcCount = diffRows.filter(row => row.Sink).length

    // Same filter/sort chain the list below renders — extracted here (rather than left inline in
    // the .map() call) so arrow-key nav moves through the exact same visible order, not some other
    // one. Pure refactor, no behavior change to the rendered list itself.
    const visibleRows = diffRows
        .filter(row => diffFilter === 'all' || row.Status !== 'match')
        .filter(row => npcRowMatchesSearch(row, npcSearchFilter, npcSearchExact))
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
    const rowNav = useListArrowKeyNav({
        rows: visibleRows,
        getKey: npcRowKey,
        selectedKey: selectedRowKey,
        onSelect: row => {
            setSelectedNpc(row)
            setSelectedRowKey(npcRowKey(row))
        }
    })
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
                    <button
                        onClick={onRefresh}
                        disabled={diffLoading}
                        title="Re-fetch this zone's NPC comparison — useful after fixing something elsewhere (e.g. creating a missing npc_faction in the Factions tab) without needing to re-select the zone"
                        className="ml-auto text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
                        ⟳ Refresh
                    </button>
                    <input
                        className="w-48 text-xs border border-gray-600 bg-gray-700 rounded px-2 py-1 disabled:opacity-40 disabled:cursor-not-allowed"
                        placeholder="Filter by NPC name..."
                        value={npcSearchFilter}
                        onChange={e => setNpcSearchFilter(e.target.value)}
                        autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                    <ExactMatchToggle checked={npcSearchExact} onChange={setNpcSearchExact}/>
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
                    <button
                        onClick={() => setShowExcludedFieldsDrawer(true)}
                        title="Choose npc_types columns Sync should never overwrite on an existing sink row"
                        className="ml-auto px-2 py-1 rounded text-xs border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white">
                        Excluded fields{excludedNpcFields.length > 0 ? ` (${excludedNpcFields.length})` : ''}
                    </button>
                </div>
                {!diffLoading && <NpcDiffSummary diffRows={diffRows} sourceNpcCount={sourceNpcCount} sinkNpcCount={sinkNpcCount}/>}
                <IconLegend items={npcRowIcons}/>
                <div className="flex items-center border-b border-gray-700 bg-gray-800">
                    <input type="checkbox"
                           className="accent-yellow-400 cursor-pointer w-3 h-3 mx-2"
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
                        Source: {dbSourceName} <span className="text-gray-600 normal-case tracking-normal">({sourceNpcCount} NPCs)</span>
                    </div>
                    <div
                        className="flex-1 text-xs px-2 py-1 text-gray-400 uppercase tracking-wider border-l border-gray-700">
                        Sink: {dbSinkName} <span className="text-gray-600 normal-case tracking-normal">({sinkNpcCount} NPCs)</span>
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
                    <div ref={rowNav.containerRef} tabIndex={-1} onKeyDown={rowNav.onKeyDown}
                         onClick={e => e.currentTarget.focus()}
                         className="flex flex-1 min-h-0 overflow-hidden flex-col overflow-y-auto outline-none">
                        {visibleRows
                            .map((row) => {
                                const rowKey = npcRowKey(row)
                                const npcId = row.Source?.Id ?? row.Sink?.Id
                                const questSpawned = (row.Source ?? row.Sink)?.HasSpawnPoint === false
                                const missingReferences = npcRowHasMissingReferences(row)
                                const fieldsOnlyExcluded = npcFieldsOnlyExcluded(row)
                                return (
                                    <div key={rowKey} data-row-key={rowKey}
                                         className={`flex items-center border-b border-gray-800 cursor-pointer ${
                                             selectedRowKey === rowKey ? 'bg-blue-900/40 border-l-2 border-l-yellow-400' :
                                                 row.Status === 'new' ? 'bg-green-950 border-l-2 border-l-transparent' :
                                                     row.Status === 'removed' ? 'bg-red-950 border-l-2 border-l-transparent' :
                                                         fieldsOnlyExcluded ? 'bg-orange-950/60 border-l-2 border-l-transparent' :
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
                                               disabled={!npcRowSelectable(row)}
                                               title={fieldsOnlyExcluded ? "Only differs in fields excluded from sync — nothing for Sync to change" :
                                                   row.Status === 'removed' ? "Not in source — selecting and syncing this will delete it from sink" : undefined}
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
                                        {missingReferences && (
                                            <span className="text-red-400 text-xs px-1"
                                                  title="A faction/spells/merchant reference on this NPC doesn't exist in its own database — open the References section to see which">⚠</span>
                                        )}
                                        {fieldsOnlyExcluded && (
                                            <span className="text-orange-400 text-xs px-1"
                                                  title="Only differs in fields excluded from sync — nothing for Sync to change">⊘</span>
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
                                {syncOutcome.NPCsSynced?.length ?? 0} NPCs synced, {syncOutcome.TODOItems?.length ?? 0} TODO items saved
                            </div>
                            {syncOutcome.Deleted?.length > 0 && (
                                <div className="flex flex-col gap-1">
                                    <div className="text-xs text-gray-400 uppercase tracking-wider">Deleted (not in source)</div>
                                    {syncOutcome.Deleted.map((d, i) => (
                                        <div key={i} className="text-xs text-red-400">{d.Name} ({d.NPCID})</div>
                                    ))}
                                </div>
                            )}
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
                                    {syncPreview.Deleted?.length > 0 && ` · ${syncPreview.Deleted.length} will be deleted`}
                                    {syncPreview.Skipped?.length > 0 && ` · ${syncPreview.Skipped.length} skipped`}
                                </div>
                                {Array.from(selectedNPCs)
                                    .map(id => {
                                        const row = diffRows.find(r => (r.Source?.Id ?? r.Sink?.Id) === id)
                                        const name = row?.Source?.Fields?.name ?? row?.Sink?.Fields?.name ?? `NPC ${id}`
                                        const skipped = syncPreview.Skipped?.find(s => s.NPCID === id)
                                        const deleted = syncPreview.Deleted?.find(d => d.NPCID === id)
                                        const todoCount = syncPreview.TODOItems?.filter(t => t.NPCID === id).length ?? 0
                                        return {id, name, row, skipped, deleted, todoCount}
                                    })
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map(({id, name, row, skipped, deleted, todoCount}) => (
                                        <div key={id} className="flex items-center gap-2 text-xs px-2 py-1">
                                            {skipped ? (
                                                <>
                                                    <span className="text-gray-600">⊘</span>
                                                    <span className="text-gray-500">{name} ({id})</span>
                                                    <span className="text-amber-400">{skipped.Reason}</span>
                                                </>
                                            ) : deleted ? (
                                                <>
                                                    <span className="text-red-400">🗑</span>
                                                    <span className="text-gray-300">{name} ({id})</span>
                                                    <span className="text-red-400">not in source — will be deleted from sink</span>
                                                </>
                                            ) : (
                                                <>
                                                    <span className={row?.Status === 'new' ? 'text-green-400' : 'text-yellow-400'}>
                                                        {row?.Status === 'new' ? '+' : '~'}
                                                    </span>
                                                    <span className="text-gray-300">{name} ({id})</span>
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
