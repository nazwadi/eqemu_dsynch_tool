import {useState} from 'react';
import {CreateLootDrop} from "../../wailsjs/go/main/App";

// Confirm-modal flow for CreateLootDrop (loot.go) — the create counterpart to useAlignId.js's
// AlignId flow, same open-preview/execute shape, for the case AlignId explicitly refuses: a
// source lootdrop with nothing on the sink to rename yet.
export function useCreateLootDrop() {
    const [showCreateConfirm, setShowCreateConfirm] = useState(false)
    const [createPreview, setCreatePreview] = useState(null) // dry-run CreateLootDropResult, null while loading
    const [createError, setCreateError] = useState(null)
    const [creating, setCreating] = useState(false)
    const [createSourceId, setCreateSourceId] = useState(null)

    function runCreate(sourceId, dryRun) {
        return CreateLootDrop({SourceId: sourceId, DryRun: dryRun})
    }

    function openCreatePreview(sourceId) {
        setCreateSourceId(sourceId)
        setShowCreateConfirm(true)
        setCreatePreview(null)
        setCreateError(null)
        runCreate(sourceId, true)
            .then(setCreatePreview)
            .catch(err => setCreateError(String(err)))
    }

    function executeCreate(onSuccess) {
        setCreating(true)
        runCreate(createSourceId, false)
            .then(() => {
                setShowCreateConfirm(false)
                setCreatePreview(null)
                onSuccess?.()
            })
            .catch(err => setCreateError(String(err)))
            .finally(() => setCreating(false))
    }

    return {
        showCreateConfirm, setShowCreateConfirm,
        createPreview, createError, creating, createSourceId,
        openCreatePreview, executeCreate
    }
}
