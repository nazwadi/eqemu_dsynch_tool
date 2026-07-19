import {useEffect, useRef} from 'react';
import {spawnEntryRows} from '../lib/spawnHelpers';

// Confirm-before-execute modal for the per-spawngroup "Sync entries from source" action. Three
// distinct outcomes are rendered as separate branches (not one generic "preview" shape) since a
// blocked or not-found result has nothing in common with a confirmable diff — see
// SyncSpawnGroupEntries in CLAUDE.md for why the cross-zone block exists.
function ConfirmSpawnGroupEntriesModal({
    showSpawnGroupEntriesConfirm, setShowSpawnGroupEntriesConfirm,
    spawnGroupEntriesError, spawnGroupEntriesPreview, selectedSpawnRow,
    syncingSpawnGroupEntries, executeSyncSpawnGroupEntries, dbSinkName
}) {
    const spawnGroupEntriesConfirmModalRef = useRef(null)
    useEffect(() => {
        if (showSpawnGroupEntriesConfirm) spawnGroupEntriesConfirmModalRef.current?.focus()
    }, [showSpawnGroupEntriesConfirm])

    if (!showSpawnGroupEntriesConfirm) return null
    return (
        <div
            ref={spawnGroupEntriesConfirmModalRef}
            tabIndex={-1}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    setShowSpawnGroupEntriesConfirm(false)
                }
            }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-[28rem] flex flex-col gap-3 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Sync Spawn Entries</h2>
                    <button onClick={() => setShowSpawnGroupEntriesConfirm(false)}>✕</button>
                </div>
                {spawnGroupEntriesError ? (
                    <div className="text-sm text-red-400">{spawnGroupEntriesError}</div>
                ) : !spawnGroupEntriesPreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : spawnGroupEntriesPreview.NotFound ? (
                    <div className="text-sm text-amber-400">
                        No matching sink spawn point exists at this location yet — sync this spawn point itself first.
                    </div>
                ) : spawnGroupEntriesPreview.OtherZoneUsage?.length > 0 ? (
                    <>
                        <div className="text-sm text-red-400">
                            Blocked: spawngroup "{spawnGroupEntriesPreview.SpawnGroupName}" is also referenced outside this zone/version in the sink:
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-gray-300">
                            {spawnGroupEntriesPreview.OtherZoneUsage.map((u, i) => (
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
                        <div className="text-sm text-gray-300">
                            Spawngroup "{spawnGroupEntriesPreview.SpawnGroupName}": {spawnGroupEntriesPreview.EntriesBefore} → {spawnGroupEntriesPreview.EntriesAfter} entries
                        </div>
                        <div className="flex flex-col gap-1 text-xs max-h-48 overflow-y-auto">
                            <div className="flex text-gray-500">
                                <span className="flex-1">NPC</span>
                                <span className="w-24 text-right">Current (sink)</span>
                                <span className="w-24 text-right">Will become</span>
                            </div>
                            {selectedSpawnRow && spawnEntryRows(selectedSpawnRow).map(({npcId, name, srcChance, sinkChance, differs}) => (
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
                                onClick={() => setShowSpawnGroupEntriesConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={syncingSpawnGroupEntries}
                                onClick={executeSyncSpawnGroupEntries}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {syncingSpawnGroupEntries ? 'Syncing…' : 'Sync Entries Now →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmSpawnGroupEntriesModal
