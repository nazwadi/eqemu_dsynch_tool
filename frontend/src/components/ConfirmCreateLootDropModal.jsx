import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for CreateLootDrop — see useCreateLootDrop.js. Mirrors
// ConfirmAlignIdModal's shape closely (same summary-level style, same squatter-eviction notice)
// but describes a copy, not a rename: source's own content is what lands on the sink, since
// there's nothing existing there to preserve.
function ConfirmCreateLootDropModal({
    showCreateConfirm, setShowCreateConfirm,
    createError, createPreview, createSourceId,
    creating, executeCreate,
    dbSinkName
}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showCreateConfirm, () => setShowCreateConfirm(false))

    if (!showCreateConfirm) return null
    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Create lootdrop in sink</h2>
                    <button onClick={() => setShowCreateConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                {createError ? (
                    <div className="text-sm text-red-400">{createError}</div>
                ) : !createPreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            Source's lootdrop #{createSourceId} and its {createPreview.EntriesCreated} item{createPreview.EntriesCreated === 1 ? '' : 's'} will be copied to the sink at the same id — this NPC's loottable will need its own entry pointed at it separately.
                        </div>
                        {createPreview.SquatterEvicted && (
                            <div className="text-sm text-cyan-400">
                                #{createSourceId} is currently occupied by "{createPreview.SquatterSummary}" on the sink — that content will be moved to a new id first, so nothing is lost.
                            </div>
                        )}
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowCreateConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={creating}
                                onClick={executeCreate}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {creating ? 'Creating…' : 'Create Now →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmCreateLootDropModal
