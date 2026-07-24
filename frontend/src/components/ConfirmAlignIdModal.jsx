import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for AlignId (the generic ID-alignment primitive — see
// idalign.go/useAlignId.js). Deliberately summary-level, not a per-entry table like
// ConfirmSpawnGroupSyncModal's NPC/chance rows: the targets this covers (lootdrop, loottable,
// npc_faction, npc_spells) have too heterogeneous a child-row shape (items vs. faction values vs.
// spell fields) to force into one generic table the way spawn entries could — a count is honest,
// a fabricated unified table wouldn't be. Mirrors ConfirmGridSyncModal's count-only style.
function ConfirmAlignIdModal({
    showAlignConfirm, setShowAlignConfirm,
    alignError, alignPreview, alignTarget,
    aligning, executeAlign,
    dbSinkName
}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showAlignConfirm, () => setShowAlignConfirm(false))

    if (!showAlignConfirm) return null
    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Align {alignTarget?.label} ID</h2>
                    <button onClick={() => setShowAlignConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                {alignError ? (
                    <div className="text-sm text-red-400">{alignError}</div>
                ) : !alignPreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            Sink's {alignTarget?.label} #{alignPreview.RenamedFrom} will be renamed to #{alignPreview.RenamedTo}, matching source — its own content is untouched, only its id changes.
                        </div>
                        {alignPreview.SquatterEvicted && (
                            <div className="text-sm text-cyan-400">
                                #{alignPreview.RenamedTo} is currently occupied by "{alignPreview.SquatterSummary}" — that content will be moved to a new id first, so nothing is lost.
                            </div>
                        )}
                        <div className="text-sm text-gray-300">
                            {alignPreview.ReferencesRepointed} reference{alignPreview.ReferencesRepointed === 1 ? '' : 's'} will be repointed to the new id.
                        </div>
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={() => setShowAlignConfirm(false)}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={aligning}
                                onClick={executeAlign}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {aligning ? 'Aligning…' : 'Align Now →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmAlignIdModal
