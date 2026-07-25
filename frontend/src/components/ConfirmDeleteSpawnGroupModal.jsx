import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for DeleteSpawnGroup — mirrors ConfirmSpawnGroupSyncModal's
// blocked-vs-normal branching shape. Blocked here means ANY spawn2 usage at all (no zone
// exclusion, unlike that modal's OtherZoneUsage) — see DeleteSpawnGroup's own comment for why a
// "removed" status doesn't mean "safe to delete."
function ConfirmDeleteSpawnGroupModal({
    showDeleteConfirm, setShowDeleteConfirm,
    deleteError, deletePreview,
    deleting, executeDelete,
    dbSinkName
}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showDeleteConfirm, () => setShowDeleteConfirm(false))

    if (!showDeleteConfirm) return null
    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Delete Spawngroup</h2>
                    <button onClick={() => setShowDeleteConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                {deleteError ? (
                    <div className="text-sm text-red-400">{deleteError}</div>
                ) : !deletePreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : deletePreview.Usage?.length > 0 ? (
                    <>
                        <div className="text-sm text-red-400">
                            Blocked: spawngroup "{deletePreview.SpawnGroupName}" is still referenced by real spawn2 content in the sink:
                        </div>
                        <div className="flex flex-col gap-1 text-xs text-gray-300">
                            {deletePreview.Usage.map((u, i) => (
                                <div key={i}>{u.Zone} (v{u.Version}) — {u.Count} location{u.Count === 1 ? '' : 's'}</div>
                            ))}
                        </div>
                        <div className="text-sm text-gray-400">
                            Deleting it would leave those spawn2 rows pointing at nothing. Resolve or remove that usage first if this really is meant to go away.
                        </div>
                    </>
                ) : (
                    <>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            Spawngroup "{deletePreview.SpawnGroupName}" and its {deletePreview.EntriesDeleted} spawn entr{deletePreview.EntriesDeleted === 1 ? 'y' : 'ies'} will be permanently deleted from sink.
                        </div>
                        <div className="text-sm text-gray-500">
                            Not referenced by any spawn2 row in the sink — safe to remove.
                        </div>
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={deleting}
                                onClick={executeDelete}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {deleting ? 'Deleting…' : 'Delete Now →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmDeleteSpawnGroupModal
