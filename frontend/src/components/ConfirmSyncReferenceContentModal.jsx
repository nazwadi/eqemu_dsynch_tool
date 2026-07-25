import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Confirm-before-execute modal for SyncReferenceContent (the generic reference-content-sync
// primitive — see referencecontent.go/useSyncReferenceContent.js). The complement to
// ConfirmAlignIdModal: that one renames an id and never touches content; this one leaves the id
// alone and overwrites content, so its copy is about what changes, not what gets renumbered.
// UsageCount is shown as a warning, never a block — same "flag, don't block" philosophy as
// SpawnGroupCollisionRisk/OtherZoneUsage elsewhere in this app, applied here because a shared
// reference row can be referenced by many NPCs at once.
function ConfirmSyncReferenceContentModal({
    showSyncContentConfirm, closeSyncContentConfirm,
    syncContentError, syncContentPreview, syncContentTarget,
    syncingContent, executeSyncContent,
    dbSinkName
}) {
    const {ref, handleKeyDown} = useModalFocusTrap(showSyncContentConfirm, closeSyncContentConfirm)

    if (!showSyncContentConfirm) return null
    return (
        <div
            ref={ref}
            tabIndex={-1}
            onKeyDown={handleKeyDown}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 outline-none">
            <div className="bg-gray-800 p-6 rounded-lg w-96 flex flex-col gap-3">
                <div className="flex justify-between items-center mb-2">
                    <h2 className="text-lg font-medium">Sync {syncContentTarget?.label} Content</h2>
                    <button onClick={closeSyncContentConfirm} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                {syncContentError ? (
                    <div className="text-sm text-red-400">{syncContentError}</div>
                ) : !syncContentPreview ? (
                    <div className="text-xs text-gray-500">Checking…</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-300">
                            You are about to write to:
                            <div className="text-yellow-400 font-medium">{dbSinkName} (sink)</div>
                        </div>
                        <div className="text-sm text-gray-300">
                            Sink's {syncContentTarget?.label} #{syncContentPreview.SinkId} will be overwritten with source's content — its own id is untouched, only what's stored under it changes.
                            {syncContentPreview.HeaderChanged && ' Its own fields differ and will be updated.'}
                        </div>
                        <div className="text-sm text-gray-300">
                            Entries: {syncContentPreview.EntriesBefore} → {syncContentPreview.EntriesAfter}.
                        </div>
                        {syncContentPreview.UsageCount > 0 && (
                            <div className="text-sm text-amber-400">
                                ⚠ Referenced by {syncContentPreview.UsageCount} other NPC{syncContentPreview.UsageCount === 1 ? '' : 's'} on the sink — they'll see this same change.
                            </div>
                        )}
                        {syncContentTarget?.target === 'loottable' && (
                            <div className="text-sm text-gray-400">
                                Entries reference lootdrop ids as-is from source — if the sink's lootdrop ids haven't been aligned or created to match, entries may point at different content than intended.
                            </div>
                        )}
                        <div className="text-sm text-red-400">This cannot be undone.</div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button
                                onClick={closeSyncContentConfirm}
                                className="text-xs px-3 py-1 rounded border border-gray-600 text-gray-300 hover:border-gray-400">
                                Cancel
                            </button>
                            <button
                                disabled={syncingContent}
                                onClick={executeSyncContent}
                                className="text-xs px-3 py-1 rounded bg-yellow-400 text-gray-900 font-medium hover:bg-yellow-300 disabled:opacity-50 disabled:cursor-not-allowed">
                                {syncingContent ? 'Syncing…' : 'Sync Content Now →'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

export default ConfirmSyncReferenceContentModal
