import {useState} from 'react';
import {CreateNPCFaction} from "../../wailsjs/go/main/App";

// Confirm-modal flow for CreateNPCFaction (idalign.go) — same open-preview/execute shape as
// useCreateLootDrop.js, plus one extra piece of state: the sink NPC id to link, since (unlike
// lootdrop) npc_faction is a direct 1:1 FK on npc_types, so "create this" also means "point this
// NPC at it."
export function useCreateNPCFaction() {
    const [showCreateFactionConfirm, setShowCreateFactionConfirm] = useState(false)
    const [createFactionPreview, setCreateFactionPreview] = useState(null) // dry-run CreateNPCFactionResult, null while loading
    const [createFactionError, setCreateFactionError] = useState(null)
    const [creatingFaction, setCreatingFaction] = useState(false)
    const [createFactionSourceId, setCreateFactionSourceId] = useState(null)
    const [createFactionNpcId, setCreateFactionNpcId] = useState(null)

    function runCreate(sourceId, npcId, dryRun) {
        return CreateNPCFaction({SourceId: sourceId, NPCID: npcId, DryRun: dryRun})
    }

    function openCreateFactionPreview(sourceId, npcId) {
        setCreateFactionSourceId(sourceId)
        setCreateFactionNpcId(npcId)
        setShowCreateFactionConfirm(true)
        setCreateFactionPreview(null)
        setCreateFactionError(null)
        runCreate(sourceId, npcId, true)
            .then(setCreateFactionPreview)
            .catch(err => setCreateFactionError(String(err)))
    }

    function executeCreateFaction(onSuccess) {
        setCreatingFaction(true)
        runCreate(createFactionSourceId, createFactionNpcId, false)
            .then(() => {
                setShowCreateFactionConfirm(false)
                setCreateFactionPreview(null)
                onSuccess?.()
            })
            .catch(err => setCreateFactionError(String(err)))
            .finally(() => setCreatingFaction(false))
    }

    return {
        showCreateFactionConfirm, setShowCreateFactionConfirm,
        createFactionPreview, createFactionError, creatingFaction, createFactionSourceId,
        openCreateFactionPreview, executeCreateFaction
    }
}
