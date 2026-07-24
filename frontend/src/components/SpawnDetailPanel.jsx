import {fmtCoord, spawnBehaviorFields, spawnEntryRows} from '../lib/spawnHelpers';

// Spawn Points branch of the shared detail panel — see DetailPanel.jsx for the dispatcher/chrome
// this plugs into.
function SpawnDetailPanel({
    selectedSpawnRow, selectAllSharingSpawngroup, openSyncSpawnGroupPreview, openRelocatePreview,
    expandedSections, setExpandedSections
}) {
    return (
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
                        {/* The warning and the fix for it live together — previously the ⚠ banner
                            was the first thing shown here, but the actual action was buried
                            several sections down inside a collapsed "Spawn Entries" panel,
                            with no visible connection between "something's wrong" and "here's
                            what to do about it." This is also the only sync trigger in the
                            app that doesn't have a persistent header button, so keeping it
                            unmissable the moment a differing row is selected matters more
                            here than it would elsewhere. */}
                        {selectedSpawnRow.SpawnGroupCollisionRisk ? (
                            <div className="flex flex-col gap-1 px-2 py-1">
                                <div className="text-red-400 flex items-center gap-1">
                                    <span>⚠</span> This spawn point's spawngroupID ({selectedSpawnRow.Source?.SpawnGroupId}) already exists on the sink, but nothing referenced it here before syncing — almost certainly unrelated content that happens to share the same number, not a real match.
                                </div>
                                <button
                                    onClick={() => openRelocatePreview(selectedSpawnRow)}
                                    className="text-xs text-red-400 hover:text-red-300 underline text-left"
                                    title="Move whatever's currently at this ID to a new one (repointing anywhere else it's used), then recreate this ID with your source's spawngroup for this zone.">
                                    Relocate & reclaim spawngroup →
                                </button>
                            </div>
                        ) : selectedSpawnRow.Sink?.SpawnGroupMissing ? (
                            <div className="flex flex-col gap-1 px-2 py-1">
                                <div className="text-red-400 flex items-center gap-1">
                                    <span>⚠</span> This spawn point's spawngroupID doesn't exist in the sink yet — it has no spawn entries until its spawngroup is created.
                                </div>
                                <button
                                    onClick={() => openSyncSpawnGroupPreview(selectedSpawnRow)}
                                    className="text-xs text-red-400 hover:text-red-300 underline text-left"
                                    title="Create the missing spawngroup on the sink and populate it with source's spawn entries — repoints every sink spawn2 row sharing this same dangling reference, not just this one.">
                                    Sync spawngroup from source →
                                </button>
                            </div>
                        ) : selectedSpawnRow.SpawnEntriesDiffer && (
                            <div className="flex flex-col gap-1 px-2 py-1">
                                <div className="text-amber-400 flex items-center gap-1">
                                    <span>⚠</span> Spawn entries differ from source — needs manual reconciliation
                                </div>
                                <button
                                    onClick={() => openSyncSpawnGroupPreview(selectedSpawnRow)}
                                    className="text-xs text-amber-400 hover:text-amber-300 underline text-left"
                                    title="Replace this spawngroup's entries on the sink to match source — its own fields (spawn_limit, wander box, etc.) are brought in line too if they differ. For a fuller field-level view, see the Spawngroups tab.">
                                    Sync spawngroup from source →
                                </button>
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
                                // pathgrid is the one Behavior field that's also a foreign
                                // reference (to `grid`) — flagged the same way spawngroupID
                                // is, just inline on its own row instead of a top banner,
                                // since (unlike spawngroupID) a missing pathgrid target
                                // doesn't block anything this tab can sync.
                                const srcMissing = field === 'pathgrid' && selectedSpawnRow.Source?.PathgridMissing
                                const sinkMissing = field === 'pathgrid' && selectedSpawnRow.Sink?.PathgridMissing
                                return (
                                    <div key={field} className="flex justify-between px-2 py-0.5">
                                        <span className="text-gray-500 w-24 shrink-0">{field}</span>
                                        <span className={srcMissing ? 'text-red-400' : differs ? 'text-yellow-400' : 'text-gray-400'}
                                              title={srcMissing ? "References a grid that doesn't exist in source for this zone" : undefined}>{srcVal ?? '—'}</span>
                                        <span className="text-gray-600 px-1">→</span>
                                        <span className={sinkMissing ? 'text-red-400' : differs ? 'text-yellow-400' : 'text-gray-400'}
                                              title={sinkMissing ? "References a grid that doesn't exist in the sink for this zone yet" : undefined}>{sinkVal ?? '—'}</span>
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
                                    spawn_entries: !prev.spawn_entries
                                }))}
                            >
                                <span className="text-gray-400 uppercase tracking-wider text-xs">
                                    Spawn Entries{selectedSpawnRow.SpawnEntriesDiffer ? ' ⚠' : ''}
                                    <span className="text-gray-500 normal-case tracking-normal"> — "{point?.SpawnGroupFields?.name ?? '—'}"</span>
                                </span>
                                <span className="text-gray-600">{expandedSections.spawn_entries ? '▾' : '▸'}</span>
                            </div>
                            {expandedSections.spawn_entries && (
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
                                    {/* The sync trigger now lives in the top banner (see above),
                                        not here — one obvious place to click instead of two
                                        doing the same thing. */}
                                    <div className="flex text-gray-500 text-xs">
                                        <span className="flex-1">NPC</span>
                                        <span className="w-14 text-right">Src %</span>
                                        <span className="w-14 text-right">Sink %</span>
                                    </div>
                                    {spawnEntryRows(selectedSpawnRow.Source?.SpawnEntries, selectedSpawnRow.Sink?.SpawnEntries).map(({npcId, name, srcChance, sinkChance, differs}) => (
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

export default SpawnDetailPanel
