import {useState} from 'react';
import {CompareGrids, SyncGrids} from "../../wailsjs/go/main/App";
import {gridId} from '../lib/gridHelpers';

// Grids tab diff/selection/sync state. zoneIdNumber is the current zone's zone.zoneidnumber (a
// plain int, not zone.short_name — grid/grid_entries don't use the short_name string spawn2 does),
// read fresh from App.jsx's zone-identity state each render.
export function useGridSync({zoneIdNumber}) {
    const [gridDiffRows, setGridDiffRows] = useState([])
    const [gridDiffLoading, setGridDiffLoading] = useState(false)
    const [gridDiffFilter, setGridDiffFilter] = useState('all')
    const [selectedGridIds, setSelectedGridIds] = useState(new Set())
    const [selectedGridRow, setSelectedGridRow] = useState(null)
    const [showGridSyncPreview, setShowGridSyncPreview] = useState(false)
    const [gridSyncPreview, setGridSyncPreview] = useState(null)
    const [gridSyncing, setGridSyncing] = useState(false)
    const [gridSyncOutcome, setGridSyncOutcome] = useState(null)
    const [showGridSyncConfirm, setShowGridSyncConfirm] = useState(false)

    function loadDiffs(targetZoneIdNumber = zoneIdNumber) {
        if (!targetZoneIdNumber) return
        setGridDiffLoading(true)
        setGridDiffRows([])
        CompareGrids(targetZoneIdNumber)
            .then(rows => setGridDiffRows(rows ?? []))
            .catch(err => console.error("compare grids failed:", err))
            .finally(() => setGridDiffLoading(false))
    }

    function runGridSync(dryRun) {
        const selectedRows = gridDiffRows.filter(row => selectedGridIds.has(gridId(row)))
        return SyncGrids({
            ZoneIdNumber: zoneIdNumber,
            DryRun: dryRun,
            GridIds: selectedRows.filter(row => row.Status === 'modified').map(row => row.Sink.Id),
            NewGridIds: selectedRows.filter(row => row.Status === 'new').map(row => row.Source.Id)
        })
    }

    function executeGridSync() {
        setGridSyncing(true)
        runGridSync(false)
            .then(result => {
                setGridSyncOutcome(result)
                setSelectedGridIds(new Set())
                setSelectedGridRow(null)
                loadDiffs()
            })
            .catch(err => setGridSyncOutcome({Errors: [String(err)]}))
            .finally(() => setGridSyncing(false))
    }

    function onZoneChange(zone) {
        setSelectedGridIds(new Set())
        setSelectedGridRow(null)
        setGridSyncPreview(null)
        setGridSyncOutcome(null)
        loadDiffs(zone.ZoneIdNumber)
    }

    return {
        gridDiffRows, gridDiffLoading,
        gridDiffFilter, setGridDiffFilter,
        selectedGridIds, setSelectedGridIds,
        selectedGridRow, setSelectedGridRow,
        showGridSyncPreview, setShowGridSyncPreview,
        gridSyncPreview, setGridSyncPreview,
        gridSyncing, gridSyncOutcome, setGridSyncOutcome,
        showGridSyncConfirm, setShowGridSyncConfirm,
        runGridSync, executeGridSync, loadDiffs, onZoneChange
    }
}
