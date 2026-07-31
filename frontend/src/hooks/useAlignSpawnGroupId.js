import {useState} from 'react';
import {AlignSpawnGroupId} from "../../wailsjs/go/main/App";

// AlignSpawnGroupId confirm-modal flow — renumbers an already-matched sink spawngroup's id onto
// source's id (see AlignSpawnGroupId's own Go comment for why spawngroup needed its own dedicated
// version of this rather than reusing the generic AlignId primitive). Mirrors
// useDeleteSpawnGroup.js/useRelocateSpawnGroup.js's shape: triggered only from the Spawngroups
// tab's own detail panel, so — like those two — there's only ever one refresh target, making
// onAligned a fixed hook-creation-time dependency rather than a per-call callback the way
// useAlignId.js's onSuccess needs to be (that one serves the Loot tab AND the reference drawers).
export function useAlignSpawnGroupId({onAligned}) {
    const [showAlignConfirm, setShowAlignConfirm] = useState(false)
    const [alignPreview, setAlignPreview] = useState(null) // dry-run AlignSpawnGroupIdResult, null while loading
    const [alignError, setAlignError] = useState(null)
    const [aligning, setAligning] = useState(false)
    const [alignTarget, setAlignTarget] = useState(null) // {sourceGroupId, sinkGroupId}

    function runAlign(target, dryRun) {
        return AlignSpawnGroupId({SourceGroupId: target.sourceGroupId, SinkGroupId: target.sinkGroupId, DryRun: dryRun})
    }

    // Triggered from the Spawngroups tab's detail panel — only offered for a "modified"/"match" row
    // where both ids are present and differ (see spawnGroupIdsDiffer), so row.SourceGroupId/
    // SinkGroupId are always both real here.
    function openAlignPreview(row) {
        const target = {sourceGroupId: row.SourceGroupId, sinkGroupId: row.SinkGroupId}
        setAlignTarget(target)
        setShowAlignConfirm(true)
        setAlignPreview(null)
        setAlignError(null)
        runAlign(target, true)
            .then(setAlignPreview)
            .catch(err => setAlignError(String(err)))
    }

    function executeAlign() {
        setAligning(true)
        runAlign(alignTarget, false)
            .then(() => {
                setShowAlignConfirm(false)
                setAlignPreview(null)
                onAligned()
            })
            .catch(err => setAlignError(String(err)))
            .finally(() => setAligning(false))
    }

    return {
        showAlignConfirm, setShowAlignConfirm,
        alignPreview, alignError, aligning,
        openAlignPreview, executeAlign
    }
}
