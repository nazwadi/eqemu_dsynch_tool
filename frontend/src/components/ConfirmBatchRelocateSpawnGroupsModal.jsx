import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for the batch RelocateSpawnGroups flow — the "relocate every
// colliding spawngroup at once" counterpart to ConfirmRelocateSpawnGroupModal's one-at-a-time
// flow. Renders one of four states: error, checking (dry run in flight), preview (dry run loaded,
// not yet confirmed), or outcome (after a real execute) — the same shape ConfirmSyncModal/the
// NPCs tab's sync preview already use for "review a list, then commit" actions, just applied to
// relocate instead of sync. Rows use plain block layout (not flex column) inside the scrollable
// list — a real bug already found once in this app (see CLAUDE.md's Loot tab item-diff fix): flex
// children default to min-height:auto, so a tall list inside a max-h container gets squeezed into
// overlapping garbage instead of scrolling, when the row count is more than the box can fit.
function ConfirmBatchRelocateSpawnGroupsModal({
    showBatchRelocateConfirm, closeBatchRelocate,
    batchRelocateError, batchRelocatePreview, batchRelocateOutcome,
    batchRelocating, executeBatchRelocate,
    dbSinkName
}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showBatchRelocateConfirm, closeBatchRelocate)

    if (!showBatchRelocateConfirm) return null

    const data = batchRelocateOutcome ?? batchRelocatePreview
    const outcomes = data?.Outcomes ?? []
    const errorCount = outcomes.filter(o => o.Error).length
    const okCount = outcomes.length - errorCount

    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-[32rem] flex flex-col gap-3 max-h-[80vh] overflow-hidden">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">
                        {batchRelocateOutcome ? 'Relocate Results' : 'Relocate & Reclaim All Colliding Spawngroups'}
                    </h2>
                    <button onClick={closeBatchRelocate} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>

                {batchRelocateError ? (
                    <div className="text-sm text-red-400">{batchRelocateError}</div>
                ) : !data ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : (
                    <>
                        {!batchRelocateOutcome && (
                            <div className="text-sm text-gray-300">
                                {outcomes.length} distinct colliding spawngroup{outcomes.length === 1 ? '' : 's'} found among "new" spawn points in this zone. Each will be relocated-and-reclaimed against:
                                <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                            </div>
                        )}
                        {batchRelocateOutcome && (
                            <div className="text-sm text-gray-300">
                                {okCount} relocated{errorCount > 0 && <span className="text-red-400"> · {errorCount} failed</span>}.
                            </div>
                        )}
                        <div className="flex flex-col overflow-y-auto border border-gray-700 rounded bg-gray-900/40 p-2" style={{maxHeight: '18rem'}}>
                            {outcomes.map(o => (
                                <div key={o.SpawnGroupId} className="text-xs py-0.5">
                                    {o.Error ? (
                                        <span className="text-red-400">✗ #{o.SpawnGroupId} — {o.Error}</span>
                                    ) : (
                                        <span className="text-gray-300">
                                            {batchRelocateOutcome ? '✓' : '•'} #{o.SpawnGroupId} — squatter "{o.Result.SquatterName}"
                                            {o.Result.SquatterUsage?.length > 0 && (
                                                <span className="text-amber-400"> · {o.Result.SquatterUsage.length} other location{o.Result.SquatterUsage.length === 1 ? '' : 's'} moving with it</span>
                                            )}
                                            {o.Result.SharedSourceUsage?.length > 0 && (
                                                <span className="text-gray-500"> · shared with {o.Result.SharedSourceUsage.length} other zone{o.Result.SharedSourceUsage.length === 1 ? '' : 's'} in source, left alone</span>
                                            )}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                        {!batchRelocateOutcome && (
                            <div className="text-sm text-red-400">This cannot be undone.</div>
                        )}
                        <div className="flex justify-end gap-2 mt-2">
                            {batchRelocateOutcome ? (
                                <button
                                    onClick={closeBatchRelocate}
                                    className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300">
                                    Done
                                </button>
                            ) : (
                                <>
                                    <button
                                        onClick={closeBatchRelocate}
                                        className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                        Cancel
                                    </button>
                                    <button
                                        disabled={batchRelocating || okCount === 0}
                                        onClick={executeBatchRelocate}
                                        className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                        {batchRelocating ? 'Relocating…' : `Relocate All ${okCount} →`}
                                    </button>
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmBatchRelocateSpawnGroupsModal
