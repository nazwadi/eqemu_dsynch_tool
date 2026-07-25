import {useState} from 'react';
import {DeleteSpawnGroup} from "../../wailsjs/go/main/App";

// DeleteSpawnGroup confirm-modal flow — deletes a "removed" spawngroup (no source counterpart)
// from the sink, blocked outright if any spawn2 row anywhere still references it. Mirrors
// useRelocateSpawnGroup.js's shape exactly: triggered only from the Spawngroups tab's own detail
// panel, so like that hook there's only ever one refresh target — onDeleted is a fixed
// hook-creation-time dependency rather than something captured per-call.
export function useDeleteSpawnGroup({onDeleted}) {
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
    const [deletePreview, setDeletePreview] = useState(null) // dry-run DeleteSpawnGroupResult, null while loading
    const [deleteError, setDeleteError] = useState(null)
    const [deleting, setDeleting] = useState(false)
    const [deleteSpawnGroupId, setDeleteSpawnGroupId] = useState(null)

    function runDelete(spawnGroupId, dryRun) {
        return DeleteSpawnGroup({SpawnGroupId: spawnGroupId, DryRun: dryRun})
    }

    // Triggered from the Spawngroups tab's detail panel — row.SinkGroupId is the only id a
    // "removed" row carries (no SourceGroupId, by definition of that status).
    function openDeletePreview(row) {
        const spawnGroupId = row.SinkGroupId
        setDeleteSpawnGroupId(spawnGroupId)
        setShowDeleteConfirm(true)
        setDeletePreview(null)
        setDeleteError(null)
        runDelete(spawnGroupId, true)
            .then(setDeletePreview)
            .catch(err => setDeleteError(String(err)))
    }

    function executeDelete() {
        setDeleting(true)
        runDelete(deleteSpawnGroupId, false)
            .then(() => {
                setShowDeleteConfirm(false)
                setDeletePreview(null)
                onDeleted()
            })
            .catch(err => setDeleteError(String(err)))
            .finally(() => setDeleting(false))
    }

    return {
        showDeleteConfirm, setShowDeleteConfirm,
        deletePreview, deleteError, deleting,
        openDeletePreview, executeDelete
    }
}
