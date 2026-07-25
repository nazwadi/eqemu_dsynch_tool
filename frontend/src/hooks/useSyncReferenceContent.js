import {useState} from 'react';
import {SyncReferenceContent} from "../../wailsjs/go/main/App";

// Confirm-modal flow for the generic "reference content sync" primitive (SyncReferenceContent in
// referencecontent.go) — overwrites a shared reference row's CONTENT on the sink to match source,
// for any of the backend's supported targets ('npc_faction' | 'npc_spells' | 'merchantlist' |
// 'loottable'). Same open-preview/execute shape as useAlignId.js, generalized across targets
// instead of one hook per table — the complement to that hook: AlignId renames an id and leaves
// content untouched, this leaves the id untouched and overwrites content. executeSyncContent takes
// its refresh callback at call time (not hook-creation time), same reasoning useAlignId's
// executeAlign already documents — one modal serves multiple independent refresh targets
// (App.jsx's dispatch-by-target).
export function useSyncReferenceContent() {
    const [showSyncContentConfirm, setShowSyncContentConfirm] = useState(false)
    const [syncContentPreview, setSyncContentPreview] = useState(null) // dry-run SyncReferenceContentResult, null while loading
    const [syncContentError, setSyncContentError] = useState(null)
    const [syncingContent, setSyncingContent] = useState(false)
    const [syncContentTarget, setSyncContentTarget] = useState(null) // {target, sourceId, sinkId, label}

    function runSyncContent(target, dryRun) {
        return SyncReferenceContent({Target: target.target, SourceId: target.sourceId, SinkId: target.sinkId, DryRun: dryRun})
    }

    // target: {target: 'npc_faction'|'npc_spells'|'merchantlist'|'loottable', sourceId, sinkId, label}
    // — label is a short human string for the confirm modal's copy, same convention as useAlignId's.
    function openSyncContentPreview(target) {
        setSyncContentTarget(target)
        setShowSyncContentConfirm(true)
        setSyncContentPreview(null)
        setSyncContentError(null)
        runSyncContent(target, true)
            .then(setSyncContentPreview)
            .catch(err => setSyncContentError(String(err)))
    }

    function executeSyncContent(onSuccess) {
        setSyncingContent(true)
        runSyncContent(syncContentTarget, false)
            .then(() => {
                setShowSyncContentConfirm(false)
                setSyncContentPreview(null)
                onSuccess?.()
            })
            .catch(err => setSyncContentError(String(err)))
            .finally(() => setSyncingContent(false))
    }

    function closeSyncContentConfirm() {
        setShowSyncContentConfirm(false)
        setSyncContentPreview(null)
        setSyncContentError(null)
    }

    return {
        showSyncContentConfirm, closeSyncContentConfirm,
        syncContentPreview, syncContentError, syncingContent, syncContentTarget,
        openSyncContentPreview, executeSyncContent
    }
}
