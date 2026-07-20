import {fieldGroups, referenceComparisonTypes} from '../lib/npcHelpers';
import {fmtCoord, spawnBehaviorFields, spawnEntryRows} from '../lib/spawnHelpers';
import {gridEntryRows} from '../lib/gridHelpers';
import {spawnGroupRowSelectable} from '../lib/spawnGroupHelpers';

const detailPanelTitles = {
    spawns: 'Spawn Point Detail',
    grids: 'Grid Detail',
    spawngroups: 'Spawngroup Detail',
    npcs: 'NPC Detail'
}

// Right-hand detail panel, shared by all tabs — one component whose body branches on
// activeView, exactly mirroring the pre-extraction structure (see CLAUDE.md: expandedSections is
// one shared state object across NPC keys (identity, combat, ...) and spawn keys (spawn_behavior,
// spawn_pool) precisely because they never collide, so collapsed/expanded state persists per
// section across tab switches without extra plumbing — kept as-is rather than split into two
// separate state objects, which would lose that.
function DetailPanel({
    activeView, setShowSpawnHelp, detailWidth,
    selectedNpc, openReferenceComparison,
    selectedSpawnRow, selectAllSharingSpawngroup, openSyncSpawnGroupPreview,
    selectedGridRow,
    selectedSpawnGroupRow, openSyncSpawnGroupPreviewFromSpawnGroup,
    expandedSections, setExpandedSections
}) {
    return (
        <div style={{width: detailWidth, minWidth: detailWidth}} className="bg-gray-800 flex flex-col">
            <div className="flex flex-col overflow-hidden h-full">
                <div
                    className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 flex items-center justify-between">
                    <span>{detailPanelTitles[activeView] ?? 'Detail'}</span>
                    {activeView === 'spawns' && (
                        <button
                            onClick={() => setShowSpawnHelp(true)}
                            title="How spawn2, spawngroup, and spawn entries relate"
                            className="w-4 h-4 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 text-[10px] normal-case tracking-normal hover:border-gray-400 hover:text-white">
                            ?
                        </button>
                    )}
                </div>
                <div className="px-2 py-2 flex flex-col gap-1 text-xs overflow-y-auto flex-1">
                    {activeView === 'npcs' && (
                        <>
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
                                        // References fields with a working comparison (see
                                        // lib/npcHelpers.js's referenceComparisonTypes) become
                                        // clickable once at least one side actually points at
                                        // something — a reference that's 0 on both sides has
                                        // nothing to compare, so it stays a plain row like any
                                        // other field.
                                        const comparable = section === 'references' &&
                                            referenceComparisonTypes[field] && (srcVal || sinkVal)
                                        return (
                                            <div key={field}
                                                 className={`flex justify-between px-2 py-0.5 ${comparable ? 'cursor-pointer hover:bg-gray-700 rounded' : ''}`}
                                                 onClick={comparable ? () => openReferenceComparison(field, srcVal, sinkVal) : undefined}
                                                 title={comparable ? 'View source vs sink comparison' : undefined}>
                                                <span className={`w-24 shrink-0 ${comparable ? 'text-cyan-400 underline decoration-dotted' : 'text-gray-500'}`}>{field}</span>
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
                        </>
                    )}
                    {activeView === 'spawns' && (
                        <>
                            {!selectedSpawnRow && (
                                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                    Select a spawn point to view details
                                </div>
                            )}
                            {selectedSpawnRow && (() => {
                                const point = selectedSpawnRow.Source ?? selectedSpawnRow.Sink
                                const sharedCount = point?.LocationSharedCount ?? 0
                                const behaviorFields = spawnBehaviorFields(selectedSpawnRow)
                                return (
                                    <>
                                        {selectedSpawnRow.PoolDiffers && (
                                            <div className="text-amber-400 px-2 py-1 flex items-center gap-1">
                                                <span>⚠</span> Spawn entries differ from source — needs manual reconciliation
                                            </div>
                                        )}
                                        {/* Static identity — not a diffable field group. Coordinates are the matching key
                                            itself (see spawnIdentityFieldNames), so source/sink are guaranteed identical here.
                                            Axis-labeled (not a bare "(x, y, z)" tuple) since EQ's in-game /loc command reports
                                            Y, X, Z while the database and most editors — this app included — store/display
                                            X, Y, Z; a labeled row is unambiguous regardless of which order someone expects. */}
                                        <div className="px-2 pt-1 text-gray-400 uppercase tracking-wider text-xs">Location</div>
                                        <div className="flex justify-between px-2 py-0.5">
                                            <span className="text-gray-500 w-24 shrink-0">x</span>
                                            <span className="text-gray-300">{fmtCoord(Number(point?.Fields?.x))}</span>
                                        </div>
                                        <div className="flex justify-between px-2 py-0.5">
                                            <span className="text-gray-500 w-24 shrink-0">y</span>
                                            <span className="text-gray-300">{fmtCoord(Number(point?.Fields?.y))}</span>
                                        </div>
                                        <div className="flex justify-between px-2 py-0.5">
                                            <span className="text-gray-500 w-24 shrink-0">z</span>
                                            <span className="text-gray-300">{fmtCoord(Number(point?.Fields?.z))}</span>
                                        </div>
                                        <div>
                                            <div
                                                className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                                onClick={() => setExpandedSections(prev => ({
                                                    ...prev,
                                                    spawn_behavior: !prev.spawn_behavior
                                                }))}
                                            >
                                                <span className="text-gray-400 uppercase tracking-wider text-xs">Behavior</span>
                                                <span className="text-gray-600">{expandedSections.spawn_behavior ? '▾' : '▸'}</span>
                                            </div>
                                            {expandedSections.spawn_behavior && behaviorFields.map(field => {
                                                const srcVal = selectedSpawnRow.Source?.Fields?.[field]
                                                const sinkVal = selectedSpawnRow.Sink?.Fields?.[field]
                                                const differs = srcVal !== sinkVal
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
                                        <div>
                                            {/* Spawngroup name lives in this section's own header, not as a separate row up
                                                top — it's a fact about the entries below, so it reads better right next to
                                                them. Full spawn2→spawngroup→spawn entries relationship is in the "?" help
                                                drawer (see showSpawnHelp) rather than repeated inline every time. */}
                                            <div
                                                className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                                onClick={() => setExpandedSections(prev => ({
                                                    ...prev,
                                                    spawn_pool: !prev.spawn_pool
                                                }))}
                                            >
                                                <span className="text-gray-400 uppercase tracking-wider text-xs">
                                                    Spawn Entries{selectedSpawnRow.PoolDiffers ? ' ⚠' : ''}
                                                    <span className="text-gray-500 normal-case tracking-normal"> — "{point?.SpawnGroupFields?.name ?? '—'}"</span>
                                                </span>
                                                <span className="text-gray-600">{expandedSections.spawn_pool ? '▾' : '▸'}</span>
                                            </div>
                                            {expandedSections.spawn_pool && (
                                                <div className="flex flex-col gap-0.5 px-2 py-1">
                                                    {sharedCount > 0 && (
                                                        <div className="flex items-center justify-between text-xs pb-1 gap-2">
                                                            <span className="text-cyan-400">
                                                                Also used at {sharedCount} other location{sharedCount === 1 ? '' : 's'} in this zone
                                                            </span>
                                                            <button
                                                                onClick={() => selectAllSharingSpawngroup(selectedSpawnRow)}
                                                                className="text-cyan-400 hover:text-cyan-300 underline shrink-0"
                                                                title="Add every location sharing this spawngroup to the current selection">
                                                                Select all {sharedCount + 1} →
                                                            </button>
                                                        </div>
                                                    )}
                                                    {selectedSpawnRow.PoolDiffers && (
                                                        <button
                                                            onClick={() => openSyncSpawnGroupPreview(selectedSpawnRow)}
                                                            className="text-xs text-amber-400 hover:text-amber-300 underline text-left pb-1"
                                                            title="Replace this spawngroup's entries on the sink to match source — its own fields (spawn_limit, wander box, etc.) are brought in line too if they differ. For a fuller field-level view, see the Spawngroups tab.">
                                                            Sync spawngroup from source →
                                                        </button>
                                                    )}
                                                    <div className="flex text-gray-500 text-xs">
                                                        <span className="flex-1">NPC</span>
                                                        <span className="w-14 text-right">Src %</span>
                                                        <span className="w-14 text-right">Sink %</span>
                                                    </div>
                                                    {spawnEntryRows(selectedSpawnRow.Source?.Pool, selectedSpawnRow.Sink?.Pool).map(({npcId, name, srcChance, sinkChance, differs}) => (
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
                    )}
                    {activeView === 'grids' && (
                        <>
                            {!selectedGridRow && (
                                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                                    Select a grid to view details
                                </div>
                            )}
                            {selectedGridRow && (() => {
                                const point = selectedGridRow.Source ?? selectedGridRow.Sink
                                const allFields = Array.from(new Set([
                                    ...Object.keys(selectedGridRow.Source?.Fields ?? {}),
                                    ...Object.keys(selectedGridRow.Sink?.Fields ?? {})
                                ])).sort()
                                return (
                                    <>
                                        <div className="px-2 pt-1 text-gray-400 uppercase tracking-wider text-xs">Grid #{point?.Id}</div>
                                        {allFields.map(field => {
                                            const srcVal = selectedGridRow.Source?.Fields?.[field]
                                            const sinkVal = selectedGridRow.Sink?.Fields?.[field]
                                            const differs = srcVal !== sinkVal
                                            return (
                                                <div key={field} className="flex justify-between px-2 py-0.5">
                                                    <span className="text-gray-500 w-24 shrink-0">{field}</span>
                                                    <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{srcVal ?? '—'}</span>
                                                    <span className="text-gray-600 px-1">→</span>
                                                    <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{sinkVal ?? '—'}</span>
                                                </div>
                                            )
                                        })}
                                        <div>
                                            <div
                                                className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                                onClick={() => setExpandedSections(prev => ({
                                                    ...prev,
                                                    grid_waypoints: !prev.grid_waypoints
                                                }))}
                                            >
                                                <span className="text-gray-400 uppercase tracking-wider text-xs">Waypoints</span>
                                                <span className="text-gray-600">{(expandedSections.grid_waypoints ?? true) ? '▾' : '▸'}</span>
                                            </div>
                                            {(expandedSections.grid_waypoints ?? true) && (
                                                <div className="flex flex-col gap-0.5 px-2 py-1">
                                                    <div className="flex text-gray-500 text-xs">
                                                        <span className="w-8">#</span>
                                                        <span className="flex-1">x, y, z, heading, pause</span>
                                                    </div>
                                                    {gridEntryRows(selectedGridRow).map(({number, src, sink, differs}) => {
                                                        const fmt = e => e ? `${fmtCoord(e.X)}, ${fmtCoord(e.Y)}, ${fmtCoord(e.Z)}, ${fmtCoord(e.Heading)}, ${e.Pause}` : '—'
                                                        return (
                                                            <div key={number}
                                                                 className={`flex text-xs ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                                <span className="w-8 shrink-0">{number}</span>
                                                                <span className="flex-1">{fmt(src)}</span>
                                                                {sink && (
                                                                    <>
                                                                        <span className="text-gray-600 px-1 shrink-0">→</span>
                                                                        <span className="flex-1">{fmt(sink)}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </>
                                )
                            })()}
                        </>
                    )}
                    {activeView === 'spawngroups' && (
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
                                                    Spawn Entries{row.PoolDiffers ? ' ⚠' : ''}
                                                </span>
                                                <span className="text-gray-600">{(expandedSections.spawngroup_entries ?? true) ? '▾' : '▸'}</span>
                                            </div>
                                            {(expandedSections.spawngroup_entries ?? true) && (
                                                <div className="flex flex-col gap-0.5 px-2 py-1">
                                                    {spawnGroupRowSelectable(row) && (
                                                        <button
                                                            onClick={() => openSyncSpawnGroupPreviewFromSpawnGroup(row)}
                                                            className="text-xs text-amber-400 hover:text-amber-300 underline text-left pb-1"
                                                            title="Replace this spawngroup's fields and entries on the sink to match source">
                                                            Sync spawngroup from source →
                                                        </button>
                                                    )}
                                                    <div className="flex text-gray-500 text-xs">
                                                        <span className="flex-1">NPC</span>
                                                        <span className="w-14 text-right">Src %</span>
                                                        <span className="w-14 text-right">Sink %</span>
                                                    </div>
                                                    {spawnEntryRows(row.SourcePool, row.SinkPool).map(({npcId, name, srcChance, sinkChance, differs}) => (
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
                    )}
                </div>
            </div>
        </div>
    )
}

export default DetailPanel
