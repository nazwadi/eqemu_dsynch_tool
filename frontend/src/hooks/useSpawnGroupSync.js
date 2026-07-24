import {useState} from 'react';
import {SyncSpawnGroup} from "../../wailsjs/go/main/App";

// SyncSpawnGroup confirm-modal flow — shared by two trigger points: the Spawn Points detail
// panel's per-row action and the Spawngroups tab's own row action. openPreview takes an onSuccess
// callback at call time (captured alongside the coords/entries when the modal opens) rather than
// this hook needing to know which tab triggered it — App.jsx's two wrapper functions
// (openSyncSpawnGroupPreviewFromSpawn/FromSpawnGroup) each pass the right "which tab's
// selection/diff-list to refresh" callback, replacing the earlier string-tagged
// spawnGroupSyncSource dispatch with the callback itself.
export function useSpawnGroupSync({zoneShortName, zoneVersion}) {
    const [showSpawnGroupSyncConfirm, setShowSpawnGroupSyncConfirm] = useState(false)
    const [spawnGroupSyncPreview, setSpawnGroupSyncPreview] = useState(null) // dry-run SpawnGroupSyncResult, null while loading
    const [spawnGroupSyncError, setSpawnGroupSyncError] = useState(null) // unexpected Go-level error, separate from the "blocked"/"not found" outcomes the result itself carries
    const [syncingSpawnGroup, setSyncingSpawnGroup] = useState(false)
    const [spawnGroupSyncCoords, setSpawnGroupSyncCoords] = useState(null) // [x,y,z] identifying the target spawngroup
    const [spawnGroupSyncEntries, setSpawnGroupSyncEntries] = useState({source: [], sink: []}) // entry preview data for the confirm modal
    const [onSyncSuccess, setOnSyncSuccess] = useState(null) // callback captured at open time, invoked after a successful execute

    function runSyncSpawnGroup(coords, dryRun) {
        const [x, y, z] = coords
        return SyncSpawnGroup({
            ZoneShortName: zoneShortName,
            ZoneVersion: zoneVersion,
            X: x, Y: y, Z: z,
            DryRun: dryRun
        })
    }

    // coords identify the target spawngroup (see SyncSpawnGroup), entries feed the confirm
    // modal's entry preview table, and onSuccess is called (with no args) after a successful
    // execute so the caller can refresh its own selection/diff-list.
    function openPreview(coords, entries, onSuccess) {
        setSpawnGroupSyncCoords(coords)
        setSpawnGroupSyncEntries(entries)
        setOnSyncSuccess(() => onSuccess)
        setShowSpawnGroupSyncConfirm(true)
        setSpawnGroupSyncPreview(null)
        setSpawnGroupSyncError(null)
        runSyncSpawnGroup(coords, true)
            .then(setSpawnGroupSyncPreview)
            .catch(err => setSpawnGroupSyncError(String(err)))
    }

    function executeSyncSpawnGroup() {
        setSyncingSpawnGroup(true)
        runSyncSpawnGroup(spawnGroupSyncCoords, false)
            .then(() => {
                setShowSpawnGroupSyncConfirm(false)
                setSpawnGroupSyncPreview(null)
                onSyncSuccess?.()
            })
            .catch(err => setSpawnGroupSyncError(String(err)))
            .finally(() => setSyncingSpawnGroup(false))
    }

    return {
        showSpawnGroupSyncConfirm, setShowSpawnGroupSyncConfirm,
        spawnGroupSyncPreview, spawnGroupSyncError,
        syncingSpawnGroup, spawnGroupSyncEntries,
        openPreview, executeSyncSpawnGroup
    }
}
