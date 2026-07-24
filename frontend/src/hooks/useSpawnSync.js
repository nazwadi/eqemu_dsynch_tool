import {useState} from 'react';
import {CompareSpawns, SyncSpawnPoints} from "../../wailsjs/go/main/App";
import {keysSharingSpawngroup, spawnCoords, spawnKey} from '../lib/spawnHelpers';

// Spawn Points tab diff/selection/sync state.
export function useSpawnSync({zoneShortName, zoneVersion, zoneIdNumber}) {
    const [spawnDiffRows, setSpawnDiffRows] = useState([])
    const [spawnDiffLoading, setSpawnDiffLoading] = useState(false)
    const [spawnDiffFilter, setSpawnDiffFilter] = useState('all')
    const [spawnSearchFilter, setSpawnSearchFilter] = useState('') // matches spawngroup name or any spawn entry's NPC name
    const [spawnSortBy, setSpawnSortBy] = useState('status') // 'status' | 'spawngroup' | 'shared'
    const [spawnSortDir, setSpawnSortDir] = useState('asc')
    const [selectedSpawnKeys, setSelectedSpawnKeys] = useState(new Set()) // coordinate-based keys — spawn2 has no cross-database ID
    const [selectedSpawnRow, setSelectedSpawnRow] = useState(null)
    const [showSpawnSyncPreview, setShowSpawnSyncPreview] = useState(false)
    const [spawnSyncPreview, setSpawnSyncPreview] = useState(null)
    const [spawnSyncing, setSpawnSyncing] = useState(false)
    const [spawnSyncOutcome, setSpawnSyncOutcome] = useState(null)
    const [showSpawnSyncConfirm, setShowSpawnSyncConfirm] = useState(false)

    function loadDiffs(targetShortName = zoneShortName, targetVersion = zoneVersion, targetIdNumber = zoneIdNumber) {
        if (!targetShortName) return
        setSpawnDiffLoading(true)
        setSpawnDiffRows([])
        CompareSpawns(targetShortName, targetVersion, targetIdNumber)
            .then(rows => setSpawnDiffRows(rows ?? []))
            .catch(err => console.error("compare spawns failed:", err))
            .finally(() => setSpawnDiffLoading(false))
    }

    function runSpawnSync(dryRun) {
        const selectedRows = spawnDiffRows.filter(row => selectedSpawnKeys.has(spawnKey(row)))
        return SyncSpawnPoints({
            ZoneShortName: zoneShortName,
            ZoneVersion: zoneVersion,
            ZoneIdNumber: zoneIdNumber,
            DryRun: dryRun,
            SpawnIds: selectedRows.filter(row => row.Status === 'modified').map(row => row.Sink.Id),
            NewSpawnCoords: selectedRows.filter(row => row.Status === 'new').map(spawnCoords)
        })
    }

    function executeSpawnSync() {
        setSpawnSyncing(true)
        runSpawnSync(false)
            .then(result => {
                setSpawnSyncOutcome(result)
                setSelectedSpawnKeys(new Set())
                setSelectedSpawnRow(null)
                loadDiffs()
            })
            .catch(err => setSpawnSyncOutcome({Errors: [String(err)]}))
            .finally(() => setSpawnSyncing(false))
    }

    // Thin wrapper around the pure keysSharingSpawngroup() — keeps the JSX call site
    // (onClick={() => selectAllSharingSpawngroup(selectedSpawnRow)}) unchanged while the actual
    // "what to select" computation lives in lib/spawnHelpers.js, independent of component state.
    function selectAllSharingSpawngroup(row) {
        const keys = keysSharingSpawngroup(row, spawnDiffRows)
        setSelectedSpawnKeys(prev => new Set([...prev, ...keys]))
    }

    function onZoneChange(zone) {
        setSelectedSpawnKeys(new Set())
        setSelectedSpawnRow(null)
        setSpawnSyncPreview(null)
        setSpawnSyncOutcome(null)
        loadDiffs(zone.ShortName, zone.Version, zone.ZoneIdNumber)
    }

    return {
        spawnDiffRows, spawnDiffLoading,
        spawnDiffFilter, setSpawnDiffFilter,
        spawnSearchFilter, setSpawnSearchFilter,
        spawnSortBy, setSpawnSortBy, spawnSortDir, setSpawnSortDir,
        selectedSpawnKeys, setSelectedSpawnKeys,
        selectedSpawnRow, setSelectedSpawnRow,
        showSpawnSyncPreview, setShowSpawnSyncPreview,
        spawnSyncPreview, setSpawnSyncPreview,
        spawnSyncing, spawnSyncOutcome, setSpawnSyncOutcome,
        showSpawnSyncConfirm, setShowSpawnSyncConfirm,
        runSpawnSync, executeSpawnSync, selectAllSharingSpawngroup, loadDiffs, onZoneChange
    }
}
