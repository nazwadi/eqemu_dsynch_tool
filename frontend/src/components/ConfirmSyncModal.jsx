import {useEffect, useRef} from 'react';

// Confirm-before-execute modal for the NPCs tab's batch npc_types sync.
function ConfirmSyncModal({showSyncConfirm, setShowSyncConfirm, dbSinkName, syncPreview, executeSync}) {
    const syncConfirmModalRef = useRef(null)
    useEffect(() => {
        if (showSyncConfirm) syncConfirmModalRef.current?.focus()
    }, [showSyncConfirm])

    if (!showSyncConfirm) return null
    return (
        <div
            ref={syncConfirmModalRef}
            tabIndex={-1}
            onKeyDown={e => {
                if (e.key === 'Escape') {
                    e.preventDefault()
                    setShowSyncConfirm(false)
                }
            }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Confirm Sync</h2>
                    <button onClick={() => setShowSyncConfirm(false)}>✕</button>
                </div>
                <div className="text-sm text-gray-300">
                    You are about to write to:
                    <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                </div>
                <div className="text-sm text-gray-300">
                    {syncPreview?.NPCsSynced?.length ?? 0} NPCs will be upserted
                    {syncPreview?.Skipped?.length > 0 && ` (${syncPreview.Skipped.length} skipped, see preview)`}
                </div>
                {syncPreview?.SpawnsSynced > 0 && (
                    <div className="text-sm text-cyan-400">
                        {syncPreview.SpawnsSynced} new spawn point{syncPreview.SpawnsSynced === 1 ? '' : 's'} will be created ({syncPreview.SpawnsCreatedForNPCs?.length ?? 0} NPCs)
                    </div>
                )}
                <div className="text-sm text-gray-300">
                    {syncPreview?.TODOItems?.length ?? 0} TODO items will be queued
                </div>
                <div className="text-sm text-red-400">This cannot be undone.</div>
                <div className="flex justify-end gap-2 mt-2">
                    <button
                        onClick={() => setShowSyncConfirm(false)}
                        className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            setShowSyncConfirm(false)
                            executeSync()
                        }}
                        className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300">
                        Sync Now →
                    </button>
                </div>
            </div>
        </div>
    )
}

export default ConfirmSyncModal
