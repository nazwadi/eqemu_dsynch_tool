import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for the Grids tab's batch sync. Simpler than the spawn2/spawngroup
// confirm modals: a grid isn't shared data, so there's no "this won't touch X" caveat to state —
// syncing a grid really does bring both its fields and waypoints fully in line with source.
function ConfirmGridSyncModal({showGridSyncConfirm, setShowGridSyncConfirm, dbSinkName, gridSyncPreview, executeGridSync}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showGridSyncConfirm, () => setShowGridSyncConfirm(false))

    if (!showGridSyncConfirm) return null
    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Confirm Sync</h2>
                    <button onClick={() => setShowGridSyncConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                <div className="text-sm text-gray-300">
                    You are about to write to:
                    <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                </div>
                <div className="text-sm text-gray-300">
                    {gridSyncPreview?.Created ?? 0} grid{gridSyncPreview?.Created === 1 ? '' : 's'} will be created
                </div>
                <div className="text-sm text-gray-300">
                    {gridSyncPreview?.Updated ?? 0} grid{gridSyncPreview?.Updated === 1 ? '' : 's'} will be updated (fields and full waypoint list replaced)
                </div>
                <div className="text-sm text-red-400">This cannot be undone.</div>
                <div className="flex justify-end gap-2 mt-2">
                    <button
                        onClick={() => setShowGridSyncConfirm(false)}
                        className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            setShowGridSyncConfirm(false)
                            executeGridSync()
                        }}
                        className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300">
                        Sync Now →
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmGridSyncModal
