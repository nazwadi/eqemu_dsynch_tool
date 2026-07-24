import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for the Spawn Points tab's batch spawn2 sync. Mirrors
// ConfirmSyncModal's shape but for SpawnSyncResult fields — kept as a separate component
// rather than a generic shared one since the two preview shapes differ enough (NPCsSynced vs
// Created/Updated) that a "generic" version would just be an if/else in disguise.
function ConfirmSpawnSyncModal({showSpawnSyncConfirm, setShowSpawnSyncConfirm, dbSinkName, spawnSyncPreview, executeSpawnSync}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showSpawnSyncConfirm, () => setShowSpawnSyncConfirm(false))

    if (!showSpawnSyncConfirm) return null
    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Confirm Sync</h2>
                    <button onClick={() => setShowSpawnSyncConfirm(false)} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                <div className="text-sm text-gray-300">
                    You are about to write to:
                    <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                </div>
                <div className="text-sm text-gray-300">
                    {spawnSyncPreview?.Created ?? 0} spawn point{spawnSyncPreview?.Created === 1 ? '' : 's'} will be created
                </div>
                <div className="text-sm text-gray-300">
                    {spawnSyncPreview?.Updated ?? 0} spawn point{spawnSyncPreview?.Updated === 1 ? '' : 's'} will be updated
                    {spawnSyncPreview?.Skipped?.length > 0 && ` (${spawnSyncPreview.Skipped.length} skipped, see preview)`}
                </div>
                <div className="text-sm text-cyan-400">
                    A spawn point's spawngroup (its spawn entries) is never changed by this action — differences are flagged, not synced.
                </div>
                <div className="text-sm text-red-400">This cannot be undone.</div>
                <div className="flex justify-end gap-2 mt-2">
                    <button
                        onClick={() => setShowSpawnSyncConfirm(false)}
                        className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            setShowSpawnSyncConfirm(false)
                            executeSpawnSync()
                        }}
                        className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300">
                        Sync Now →
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmSpawnSyncModal
