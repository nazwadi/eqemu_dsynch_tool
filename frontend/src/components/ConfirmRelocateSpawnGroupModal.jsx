import {useEffect, useRef} from 'react';

// Confirm-before-execute modal for RelocateSpawnGroup — resolves a SpawnGroupCollisionRisk by
// moving whatever's currently occupying the colliding id to a fresh one (repointing every OTHER
// zone's spawn2 rows there), then recreating the id with source's real content for this zone. The
// squatter's usage list is always shown before acting — mirrors ConfirmSpawnGroupSyncModal's
// OtherZoneUsage preview, except here it's informational, not a block: relocating exists
// specifically to safely touch that usage, not avoid it.
function ConfirmRelocateSpawnGroupModal({
    showRelocateConfirm, setShowRelocateConfirm,
    relocateError, relocatePreview,
    relocating, executeRelocate,
    dbSinkName
}) {
    const modalRef = useRef(null)
    useEffect(() => {
        if (showRelocateConfirm) modalRef.current?.focus()
    }, [showRelocateConfirm])

    if (!showRelocateConfirm) return null
    return (
        <div
            ref={modalRef}
            tabIndex={-1}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    setShowRelocateConfirm(false)
                }
            }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-[28rem] flex flex-col gap-3 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Relocate & Reclaim Spawngroup</h2>
                    <button onClick={() => setShowRelocateConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                {relocateError ? (
                    <div className="text-sm text-red-400">{relocateError}</div>
                ) : !relocatePreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            Spawngroup #{relocatePreview.SpawnGroupId} ("{relocatePreview.SquatterName}") is currently occupying this ID — your source database uses the same number for unrelated content.
                        </div>
                        {relocatePreview.SquatterUsage?.length > 0 ? (
                            <>
                                <div className="text-sm text-amber-400">
                                    Also referenced by these locations, which will be repointed to a new ID along with it:
                                </div>
                                <div className="flex flex-col gap-1 text-xs text-gray-300">
                                    {relocatePreview.SquatterUsage.map((u, i) => (
                                        <div key={i}>{u.Zone} (v{u.Version}) — {u.Count} location{u.Count === 1 ? '' : 's'}</div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <div className="text-sm text-gray-500">Not referenced anywhere else on the sink — safe to move.</div>
                        )}
                        {relocatePreview.ThisZoneCount > 0 && (
                            <div className="text-sm text-gray-400">
                                Also currently referenced by {relocatePreview.ThisZoneCount} location{relocatePreview.ThisZoneCount === 1 ? '' : 's'} in <span className="text-gray-200">this zone</span> — <span className="text-gray-500">left alone</span>, not repointed. Those will resolve correctly once this ID holds source's content. Double-check that count matches what you expect before continuing.
                            </div>
                        )}
                        <div className="text-sm text-cyan-400">
                            #{relocatePreview.SpawnGroupId} will then be recreated with your source's spawngroup, for this zone to use correctly.
                        </div>
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowRelocateConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={relocating}
                                onClick={executeRelocate}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {relocating ? 'Relocating…' : 'Relocate & Reclaim →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmRelocateSpawnGroupModal
