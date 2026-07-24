import {useState} from 'react';
import {CompareZones, Sync} from "../../wailsjs/go/main/App";

// NPCs tab diff/selection/sync state. executeSync takes an onSuccess callback at call time
// (rather than as a hook dependency) specifically so App.jsx can wire it to useTodo's
// refreshTodoItems without the two hooks needing to know about each other at creation time —
// useTodo already needs things FROM this hook (diffRows, setSelectedNpc), so a hook-time
// dependency the other direction would be circular.
export function useNpcSync({zoneShortName, zoneVersion, zoneIdNumber}) {
    const [diffRows, setDiffRows] = useState([])
    const [diffLoading, setDiffLoading] = useState(false)
    const [diffFilter, setDiffFilter] = useState('all')
    const [npcSearchFilter, setNpcSearchFilter] = useState('') // matches NPC name, see npcRowMatchesSearch()
    const [selectedRowKey, setSelectedRowKey] = useState(null)
    const [sortBy, setSortBy] = useState('status')
    const [sortDir, setSortDir] = useState('asc')
    const [selectedNpc, setSelectedNpc] = useState(null)
    const [selectedNPCs, setSelectedNPCs] = useState(new Set())
    const [showSyncPreview, setShowSyncPreview] = useState(false)
    const [syncPreview, setSyncPreview] = useState(null)
    const [syncing, setSyncing] = useState(false)
    const [syncOutcome, setSyncOutcome] = useState(null)
    const [showSyncConfirm, setShowSyncConfirm] = useState(false)

    function loadDiffs(targetShortName = zoneShortName, targetVersion = zoneVersion, targetIdNumber = zoneIdNumber) {
        if (!targetShortName) return
        setDiffRows([])
        setDiffLoading(true)
        CompareZones(targetShortName, targetVersion, targetIdNumber)
            .then(rows => setDiffRows(rows ?? []))
            .catch(err => console.error("compare zones failed:", err))
            .finally(() => setDiffLoading(false))
    }

    function runSync(dryRun) {
        return Sync({
            ZoneShortName: zoneShortName,
            ZoneVersion: zoneVersion,
            ZoneIdNumber: zoneIdNumber,
            SyncNPCTypes: true,
            DryRun: dryRun,
            NPCIds: Array.from(selectedNPCs)
        })
    }

    function executeSync(onSuccess) {
        setSyncing(true)
        runSync(false)
            .then(result => {
                setSyncOutcome(result)
                setSelectedNPCs(new Set())
                setSelectedNpc(null)
                setSelectedRowKey(null)
                onSuccess?.()
                // Deliberately not loadDiffs() — this reload shouldn't blank the table behind a
                // loading spinner the way a fresh zone switch does, since the existing rows are
                // about to be replaced with fresh ones almost immediately either way.
                return CompareZones(zoneShortName, zoneVersion, zoneIdNumber).then(rows => setDiffRows(rows ?? []))
            })
            .catch(err => setSyncOutcome({Errors: [String(err)]}))
            .finally(() => setSyncing(false))
    }

    function onZoneChange(zone) {
        setSelectedNPCs(new Set())
        setSelectedNpc(null)
        setSelectedRowKey(null)
        loadDiffs(zone.ShortName, zone.Version, zone.ZoneIdNumber)
    }

    return {
        diffRows, diffLoading,
        diffFilter, setDiffFilter,
        npcSearchFilter, setNpcSearchFilter,
        selectedRowKey, setSelectedRowKey,
        sortBy, setSortBy, sortDir, setSortDir,
        selectedNpc, setSelectedNpc,
        selectedNPCs, setSelectedNPCs,
        showSyncPreview, setShowSyncPreview,
        syncPreview, setSyncPreview,
        syncing, syncOutcome, setSyncOutcome,
        showSyncConfirm, setShowSyncConfirm,
        runSync, executeSync, loadDiffs, onZoneChange
    }
}
