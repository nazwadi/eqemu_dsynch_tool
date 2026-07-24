import {useState} from 'react';
import {RelocateSpawnGroup} from "../../wailsjs/go/main/App";

// RelocateSpawnGroup confirm-modal flow — resolves a SpawnGroupCollisionRisk, triggered only from
// the Spawn Points detail panel's collision-risk banner (no Spawngroups-tab equivalent trigger,
// since collision risk is only ever computed for "new" spawn2 rows). Unlike useSpawnGroupSync,
// there's only ever one refresh target (the Spawn Points tab), so onRelocated is a fixed
// hook-creation-time dependency rather than something captured per-call.
export function useRelocateSpawnGroup({zoneShortName, zoneVersion, onRelocated}) {
    const [showRelocateConfirm, setShowRelocateConfirm] = useState(false)
    const [relocatePreview, setRelocatePreview] = useState(null) // dry-run RelocateSpawnGroupResult, null while loading
    const [relocateError, setRelocateError] = useState(null)
    const [relocating, setRelocating] = useState(false)
    const [relocateTarget, setRelocateTarget] = useState(null) // {spawnGroupId, sourceFields, sourceEntries}

    function runRelocateSpawnGroup(target, dryRun) {
        return RelocateSpawnGroup({
            SpawnGroupId: target.spawnGroupId,
            ZoneShortName: zoneShortName,
            ZoneVersion: zoneVersion,
            SourceFields: target.sourceFields,
            SourceSpawnEntries: target.sourceEntries,
            DryRun: dryRun
        })
    }

    // Triggered from the Spawn Points detail panel's collision-risk banner — row.Source carries
    // both the colliding id and the source content that should replace it once freed, so this
    // needs no extra Go call beyond the dry-run preview itself.
    function openRelocatePreview(row) {
        const target = {
            spawnGroupId: row.Source.SpawnGroupId,
            sourceFields: row.Source.SpawnGroupFields,
            sourceEntries: row.Source.SpawnEntries
        }
        setRelocateTarget(target)
        setShowRelocateConfirm(true)
        setRelocatePreview(null)
        setRelocateError(null)
        runRelocateSpawnGroup(target, true)
            .then(setRelocatePreview)
            .catch(err => setRelocateError(String(err)))
    }

    function executeRelocate() {
        setRelocating(true)
        runRelocateSpawnGroup(relocateTarget, false)
            .then(() => {
                setShowRelocateConfirm(false)
                setRelocatePreview(null)
                onRelocated()
            })
            .catch(err => setRelocateError(String(err)))
            .finally(() => setRelocating(false))
    }

    return {
        showRelocateConfirm, setShowRelocateConfirm,
        relocatePreview, relocateError, relocating,
        openRelocatePreview, executeRelocate
    }
}
