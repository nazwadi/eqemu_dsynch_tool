import {useState} from 'react';
import {RelocateSpawnGroups} from "../../wailsjs/go/main/App";

// Batch counterpart to useRelocateSpawnGroup.js — relocates every distinct colliding spawngroup
// id in one confirm instead of one row at a time, for zones where SpawnGroupCollisionRisk is the
// norm (hundreds of "new" spawn2 rows sharing a much smaller set of distinct spawngroupIds — see
// lib/spawnHelpers.js's collidingSpawnGroupIds). Mirrors useRelocateSpawnGroup's shape (fixed
// zoneShortName/zoneVersion/onRelocated at hook-creation time — there's only one refresh target,
// the Spawn Points tab) — the real difference is batchTarget is just a list of ids, since the Go
// side (RelocateSpawnGroups) fetches each id's source content itself rather than needing it
// pre-loaded from a specific row the way the single-item flow does.
export function useBatchRelocateSpawnGroups({zoneShortName, zoneVersion, onRelocated}) {
    const [showBatchRelocateConfirm, setShowBatchRelocateConfirm] = useState(false)
    const [batchRelocatePreview, setBatchRelocatePreview] = useState(null) // dry-run BatchRelocateSpawnGroupsResult, null while loading
    const [batchRelocateError, setBatchRelocateError] = useState(null)
    const [batchRelocating, setBatchRelocating] = useState(false)
    const [batchRelocateOutcome, setBatchRelocateOutcome] = useState(null) // post-execute BatchRelocateSpawnGroupsResult
    const [batchRelocateIds, setBatchRelocateIds] = useState([])

    function runBatch(ids, dryRun) {
        return RelocateSpawnGroups({
            ZoneShortName: zoneShortName,
            ZoneVersion: zoneVersion,
            SpawnGroupIds: ids,
            DryRun: dryRun
        })
    }

    function openBatchRelocatePreview(ids) {
        setBatchRelocateIds(ids)
        setShowBatchRelocateConfirm(true)
        setBatchRelocatePreview(null)
        setBatchRelocateOutcome(null)
        setBatchRelocateError(null)
        runBatch(ids, true)
            .then(setBatchRelocatePreview)
            .catch(err => setBatchRelocateError(String(err)))
    }

    function executeBatchRelocate() {
        setBatchRelocating(true)
        runBatch(batchRelocateIds, false)
            .then(result => {
                setBatchRelocatePreview(null)
                setBatchRelocateOutcome(result)
                onRelocated()
            })
            .catch(err => setBatchRelocateError(String(err)))
            .finally(() => setBatchRelocating(false))
    }

    function closeBatchRelocate() {
        setShowBatchRelocateConfirm(false)
        setBatchRelocatePreview(null)
        setBatchRelocateOutcome(null)
        setBatchRelocateError(null)
    }

    return {
        showBatchRelocateConfirm, closeBatchRelocate,
        batchRelocatePreview, batchRelocateError, batchRelocating, batchRelocateOutcome,
        openBatchRelocatePreview, executeBatchRelocate
    }
}
