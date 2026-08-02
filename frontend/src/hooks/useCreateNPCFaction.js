import {useState} from 'react';
import {CreateNPCFaction} from "../../wailsjs/go/main/App";

// Confirm-modal flow for CreateNPCFaction (idalign.go) — same open-preview/execute shape as
// useCreateLootDrop.js, plus one extra piece of state: the sink NPC id to link, since (unlike
// lootdrop) npc_faction is a direct 1:1 FK on npc_types, so "create this" also means "point this
// NPC at it" — WHEN there's an anchoring NPC at all. npcId is optional (added 2026-08-02): the
// Factions tab's own "create in sink" trigger has no anchoring NPC, just source content that
// doesn't exist on sink yet, so it calls openCreateFactionPreview(sourceId) with no second
// argument, same as CreateLootDrop's own single-id shape. createFactionNpcId is exposed so the
// confirm modal (and App.jsx's refresh dispatch) can tell which of the two trigger points this is.
export function useCreateNPCFaction() {
    const [showCreateFactionConfirm, setShowCreateFactionConfirm] = useState(false)
    const [createFactionPreview, setCreateFactionPreview] = useState(null) // dry-run CreateNPCFactionResult, null while loading
    const [createFactionError, setCreateFactionError] = useState(null)
    const [creatingFaction, setCreatingFaction] = useState(false)
    const [createFactionSourceId, setCreateFactionSourceId] = useState(null)
    const [createFactionNpcId, setCreateFactionNpcId] = useState(null)

    function runCreate(sourceId, npcId, dryRun) {
        return CreateNPCFaction({SourceId: sourceId, NPCID: npcId ?? 0, DryRun: dryRun})
    }

    function openCreateFactionPreview(sourceId, npcId = null) {
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
        createFactionPreview, createFactionError, creatingFaction, createFactionSourceId, createFactionNpcId,
        openCreateFactionPreview, executeCreateFaction
    }
}
