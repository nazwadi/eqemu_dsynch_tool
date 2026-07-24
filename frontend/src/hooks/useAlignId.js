import {useState} from 'react';
import {AlignId} from "../../wailsjs/go/main/App";

// Confirm-modal flow for the generic "ID alignment" primitive (AlignId in idalign.go) — renumbers
// a sink row's local surrogate ID to match source's, for any of the backend's supported targets
// ('lootdrop' | 'loottable' | 'npc_faction' | 'npc_spells'). Same open-preview/execute shape as
// useRelocateSpawnGroup/useSpawnGroupSync, generalized across targets instead of one hook per
// table, since AlignId itself is already one generic Go method.
export function useAlignId() {
    const [showAlignConfirm, setShowAlignConfirm] = useState(false)
    const [alignPreview, setAlignPreview] = useState(null) // dry-run AlignIdResult, null while loading
    const [alignError, setAlignError] = useState(null)
    const [aligning, setAligning] = useState(false)
    const [alignTarget, setAlignTarget] = useState(null) // {target, sourceId, sinkId, label}

    function runAlign(target, dryRun) {
        return AlignId({Target: target.target, SourceId: target.sourceId, SinkId: target.sinkId, DryRun: dryRun})
    }

    // target: {target: 'lootdrop'|'loottable'|'npc_faction'|'npc_spells', sourceId, sinkId, label}
    // — label is a short human string ("loottable" / "lootdrop") for the confirm modal's copy.
    function openAlignPreview(target) {
        setAlignTarget(target)
        setShowAlignConfirm(true)
        setAlignPreview(null)
        setAlignError(null)
        runAlign(target, true)
            .then(setAlignPreview)
            .catch(err => setAlignError(String(err)))
    }

    function executeAlign(onSuccess) {
        setAligning(true)
        runAlign(alignTarget, false)
            .then(() => {
                setShowAlignConfirm(false)
                setAlignPreview(null)
                onSuccess?.()
            })
            .catch(err => setAlignError(String(err)))
            .finally(() => setAligning(false))
    }

    return {
        showAlignConfirm, setShowAlignConfirm,
        alignPreview, alignError, aligning, alignTarget,
        openAlignPreview, executeAlign
    }
}
