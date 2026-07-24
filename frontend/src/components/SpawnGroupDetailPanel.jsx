import {spawnEntryRows} from '../lib/spawnHelpers';
import {spawnGroupRowSelectable} from '../lib/spawnGroupHelpers';

// Spawngroups branch of the shared detail panel — see DetailPanel.jsx for the dispatcher/chrome
// this plugs into.
function SpawnGroupDetailPanel({selectedSpawnGroupRow, openSyncSpawnGroupPreviewFromSpawnGroup, expandedSections, setExpandedSections}) {
    return (
        <>
            {!selectedSpawnGroupRow && (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                    Select a spawngroup to view details
                </div>
            )}
            {selectedSpawnGroupRow && (() => {
                const row = selectedSpawnGroupRow
                // "name" is cosmetic/local (see CLAUDE.md's EQEmu Schema Notes on
                // spawngroup.name) — shown once as the row's label, never diffed
                // alongside spawn_limit/dist/etc. the way spawn2's x/y/z are shown
                // once instead of diffed for the same "this isn't meaningfully
                // comparable" reason.
                const allFields = Array.from(new Set([
                    ...Object.keys(row.SourceFields ?? {}),
                    ...Object.keys(row.SinkFields ?? {})
                ])).filter(f => f !== 'name').sort()
                return (
                    <>
                        <div className="px-2 pt-1 text-gray-200 text-sm">"{row.Name}"</div>
                        {row.Status === 'ambiguous' && (
                            <div className="text-amber-400 px-2 py-1 flex flex-col gap-1">
                                <span>⚠ This source spawngroup's member locations resolved to more than one sink spawngroup — flagged for manual review, not guessed.</span>
                                <span className="text-gray-400">Candidate sink spawngroup IDs: {row.AmbiguousSinkGroupIds?.join(', ')}</span>
                            </div>
                        )}
                        {row.Status === 'new' && (
                            <div className="text-green-400 px-2 py-1">
                                Not yet present on the sink — sync one of its spawn2 locations first (Spawn Points tab) to create it there.
                            </div>
                        )}
                        {row.Status === 'removed' && (
                            <div className="text-red-400 px-2 py-1">
                                Exists on the sink only — no matching source spawngroup found at any of its locations.
                            </div>
                        )}
                        {/* Warning and fix live together, same as the Spawn Points detail panel's
                            top banner — this is the only sync trigger in the app without a
                            persistent header button, so it needs to be the first thing visible
                            for a differing row, not buried inside a collapsed section below. */}
                        {spawnGroupRowSelectable(row) && (
                            <div className="flex flex-col gap-1 px-2 py-1">
                                <div className="text-amber-400 flex items-center gap-1">
                                    <span>⚠</span> {row.FieldsDiffer && row.SpawnEntriesDiffer
                                        ? 'Fields and spawn entries differ from source'
                                        : row.FieldsDiffer
                                            ? 'Fields differ from source'
                                            : 'Spawn entries differ from source'} — needs manual reconciliation
                                </div>
                                <button
                                    onClick={() => openSyncSpawnGroupPreviewFromSpawnGroup(row)}
                                    className="text-xs text-amber-400 hover:text-amber-300 underline text-left"
                                    title="Replace this spawngroup's fields and entries on the sink to match source">
                                    Sync spawngroup from source →
                                </button>
                            </div>
                        )}
                        <div className="flex justify-between px-2 py-0.5">
                            <span className="text-gray-500 w-24 shrink-0">locations</span>
                            <span className="text-gray-300">{row.SourceGroupId ? row.SourceLocationCount : '—'}</span>
                            <span className="text-gray-600 px-1">→</span>
                            <span className="text-gray-300">{row.SinkGroupId ? row.SinkLocationCount : '—'}</span>
                        </div>
                        {allFields.length > 0 && (
                            <div>
                                <div
                                    className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                    onClick={() => setExpandedSections(prev => ({
                                        ...prev,
                                        spawngroup_fields: !prev.spawngroup_fields
                                    }))}
                                >
                                    <span className="text-gray-400 uppercase tracking-wider text-xs">
                                        Fields{row.FieldsDiffer ? ' ⚠' : ''}
                                    </span>
                                    <span className="text-gray-600">{(expandedSections.spawngroup_fields ?? true) ? '▾' : '▸'}</span>
                                </div>
                                {(expandedSections.spawngroup_fields ?? true) && allFields.map(field => {
                                    const srcVal = row.SourceFields?.[field]
                                    const sinkVal = row.SinkFields?.[field]
                                    const differs = srcVal !== undefined && sinkVal !== undefined && srcVal !== sinkVal
                                    return (
                                        <div key={field} className="flex justify-between px-2 py-0.5">
                                            <span className="text-gray-500 w-24 shrink-0">{field}</span>
                                            <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{srcVal ?? '—'}</span>
                                            <span className="text-gray-600 px-1">→</span>
                                            <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{sinkVal ?? '—'}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                        <div>
                            <div
                                className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                onClick={() => setExpandedSections(prev => ({
                                    ...prev,
                                    spawngroup_entries: !prev.spawngroup_entries
                                }))}
                            >
                                <span className="text-gray-400 uppercase tracking-wider text-xs">
                                    Spawn Entries{row.SpawnEntriesDiffer ? ' ⚠' : ''}
                                </span>
                                <span className="text-gray-600">{(expandedSections.spawngroup_entries ?? true) ? '▾' : '▸'}</span>
                            </div>
                            {(expandedSections.spawngroup_entries ?? true) && (
                                <div className="flex flex-col gap-0.5 px-2 py-1">
                                    {/* Sync trigger lives in the top banner now (see above) — one
                                        obvious place to click instead of two doing the same thing. */}
                                    <div className="flex text-gray-500 text-xs">
                                        <span className="flex-1">NPC</span>
                                        <span className="w-14 text-right">Src %</span>
                                        <span className="w-14 text-right">Sink %</span>
                                    </div>
                                    {spawnEntryRows(row.SourceSpawnEntries, row.SinkSpawnEntries).map(({npcId, name, srcChance, sinkChance, differs}) => (
                                        <div key={npcId}
                                             className={`flex text-xs ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>
                                            <span className="flex-1">{name} ({npcId})</span>
                                            <span className="w-14 text-right">{srcChance ?? '—'}</span>
                                            <span className="w-14 text-right">{sinkChance ?? '—'}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )
            })()}
        </>
    )
}

export default SpawnGroupDetailPanel
