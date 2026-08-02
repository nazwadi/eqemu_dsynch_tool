import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for CreateNPCFaction — see useCreateNPCFaction.js. Mirrors
// ConfirmCreateLootDropModal's shape (same summary-level style, same squatter-eviction notice).
// When triggered via an NPC (createFactionNpcId set), this also links that NPC to the newly-
// created content, since npc_faction is a direct FK on npc_types with nothing ambiguous to defer
// the way lootdrop→loottable wiring is — but createFactionNpcId is optional (added 2026-08-02 for
// the Factions tab's own "create in sink" trigger, which has no anchoring NPC at all), so the
// linking sentence only appears when there's actually an NPC to link.
function ConfirmCreateNPCFactionModal({
    showCreateFactionConfirm, setShowCreateFactionConfirm,
    createFactionError, createFactionPreview, createFactionSourceId, createFactionNpcId,
    creatingFaction, executeCreateFaction,
    dbSinkName
}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showCreateFactionConfirm, () => setShowCreateFactionConfirm(false))

    if (!showCreateFactionConfirm) return null
    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Create npc_faction in sink</h2>
                    <button onClick={() => setShowCreateFactionConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                {createFactionError ? (
                    <div className="text-sm text-red-400">{createFactionError}</div>
                ) : !createFactionPreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            Source's npc_faction #{createFactionSourceId} and its {createFactionPreview.EntriesCreated} entr{createFactionPreview.EntriesCreated === 1 ? 'y' : 'ies'} will be copied to the sink at the same id.
                            {createFactionNpcId != null && <> This NPC's npc_faction_id will be set to #{createFactionSourceId}.</>}
                        </div>
                        {createFactionPreview.SquatterEvicted && (
                            <div className="text-sm text-cyan-400">
                                #{createFactionSourceId} is currently occupied by "{createFactionPreview.SquatterSummary}" on the sink — that content will be moved to a new id first (and every other sink NPC referencing it will follow it there), so nothing is lost.
                            </div>
                        )}
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowCreateFactionConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={creatingFaction}
                                onClick={executeCreateFaction}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {creatingFaction ? 'Creating…' : 'Create Now →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmCreateNPCFactionModal
