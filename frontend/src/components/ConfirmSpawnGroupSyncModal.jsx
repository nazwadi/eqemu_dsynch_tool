import {useEffect, useRef} from 'react';
import {spawnEntryRows} from '../lib/spawnHelpers';

// Confirm-before-execute modal for SyncSpawnGroup — brings both a spawngroup's own fields
// (spawn_limit, wander box, etc.) and its full spawnentry roster in line with source, together.
// Shared by two trigger points: the Spawn Points detail panel's per-row "Sync spawngroup from
// source" action, and the Spawngroups tab's own row action — both just need a source/sink spawn
// entries pair and a SpawnGroupName/FieldsChanged/EntriesBefore/EntriesAfter result to render identically,
// so this component doesn't need to know which tab triggered it. Three distinct outcomes are
// rendered as separate branches (not one generic "preview" shape) since a blocked or not-found
// result has nothing in common with a confirmable diff — see SyncSpawnGroup in CLAUDE.md for why
// the cross-zone block exists.
function ConfirmSpawnGroupSyncModal({
    showSpawnGroupSyncConfirm, setShowSpawnGroupSyncConfirm,
    spawnGroupSyncError, spawnGroupSyncPreview, sourceEntries, sinkEntries,
    syncingSpawnGroup, executeSyncSpawnGroup, dbSinkName
}) {
    const spawnGroupSyncConfirmModalRef = useRef(null)
    useEffect(() => {
        if (showSpawnGroupSyncConfirm) spawnGroupSyncConfirmModalRef.current?.focus()
    }, [showSpawnGroupSyncConfirm])

    if (!showSpawnGroupSyncConfirm) return null
    return (
        <div
            ref={spawnGroupSyncConfirmModalRef}
            tabIndex={-1}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    setShowSpawnGroupSyncConfirm(false)
                }
            }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-[28rem] flex flex-col gap-3 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Sync Spawngroup</h2>
                    <button onClick={() => setShowSpawnGroupSyncConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                {spawnGroupSyncError ? (
                    <div className="text-sm text-red-400">{spawnGroupSyncError}</div>
                ) : !spawnGroupSyncPreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : spawnGroupSyncPreview.NotFound ? (
                    <div className="text-sm text-amber-400">
                        No matching sink spawn point exists at this location yet — sync that spawn point itself first.
                    </div>
                ) : spawnGroupSyncPreview.OtherZoneUsage?.length > 0 ? (
                    <>
                        <div className="text-sm text-red-400">
                            Blocked: spawngroup "{spawnGroupSyncPreview.SpawnGroupName}" is also referenced outside this zone/version in the sink:
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-gray-300">
                            {spawnGroupSyncPreview.OtherZoneUsage.map((u, i) => (
                                <div key={i}>{u.Zone} (v{u.Version}) — {u.Count} location{u.Count === 1 ? '' : 's'}</div>
                            ))}
                        </div>
                        <div className="text-sm text-gray-400">
                            Syncing here would silently change spawns in a zone that hasn't been reviewed, so this is blocked. Reconcile it manually if that's really intended.
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        {spawnGroupSyncPreview.Created && (
                            <div className="text-sm text-cyan-400">
                                This spawngroup doesn't exist in the sink yet — a new one will be created, and every sink spawn2 row currently pointing at the same dangling spawngroupID will be repointed at it.
                            </div>
                        )}
                        <div className="text-sm text-gray-300">
                            Spawngroup "{spawnGroupSyncPreview.SpawnGroupName}": {spawnGroupSyncPreview.EntriesBefore} → {spawnGroupSyncPreview.EntriesAfter} entries
                        </div>
                        {!spawnGroupSyncPreview.Created && (
                            <div className={`text-sm ${spawnGroupSyncPreview.FieldsChanged ? 'text-cyan-400' : 'text-gray-500'}`}>
                                {spawnGroupSyncPreview.FieldsChanged
                                    ? 'Its own fields (spawn_limit, wander box, timing, etc.) also differ and will be updated to match source.'
                                    : 'Its own fields already match source — only entries will change.'}
                            </div>
                        )}
                        <div className="flex flex-col gap-1 text-xs max-h-48 overflow-y-auto">
                            <div className="flex text-gray-500">
                                <span className="flex-1">NPC</span>
                                <span className="w-24 text-right">Current (sink)</span>
                                <span className="w-24 text-right">Will become</span>
                            </div>
                            {spawnEntryRows(sourceEntries, sinkEntries).map(({npcId, name, srcChance, sinkChance, differs}) => (
                                <div key={npcId} className={`flex ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>
                                    <span className="flex-1">{name} ({npcId})</span>
                                    <span className="w-24 text-right">{sinkChance ?? '—'}</span>
                                    <span className="w-24 text-right">{srcChance ?? '—'}</span>
                                </div>
                            ))}
                        </div>
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowSpawnGroupSyncConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={syncingSpawnGroup}
                                onClick={executeSyncSpawnGroup}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {syncingSpawnGroup ? 'Syncing…' : 'Sync Spawngroup Now →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmSpawnGroupSyncModal
