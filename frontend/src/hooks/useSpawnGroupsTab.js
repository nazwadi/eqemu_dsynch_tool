import {useState} from 'react';
import {CompareSpawnGroups} from "../../wailsjs/go/main/App";

// Spawngroups tab's own diff loading/selection — no bulk-select Set or sync-preview slide-over
// like the other tabs, since syncing a spawngroup is a deliberate single-row action (see
// useSpawnGroupSync, shared with the Spawn Points detail panel's own trigger).
export function useSpawnGroupsTab({zoneShortName, zoneVersion}) {
    const [spawnGroupDiffRows, setSpawnGroupDiffRows] = useState([])
    const [spawnGroupDiffLoading, setSpawnGroupDiffLoading] = useState(false)
    const [spawnGroupDiffFilter, setSpawnGroupDiffFilter] = useState('all')
    const [selectedSpawnGroupRow, setSelectedSpawnGroupRow] = useState(null)

    function loadDiffs(targetShortName = zoneShortName, targetVersion = zoneVersion) {
        if (!targetShortName) return
        setSpawnGroupDiffLoading(true)
        setSpawnGroupDiffRows([])
        CompareSpawnGroups(targetShortName, targetVersion)
            .then(rows => setSpawnGroupDiffRows(rows ?? []))
            .catch(err => console.error("compare spawngroups failed:", err))
            .finally(() => setSpawnGroupDiffLoading(false))
    }

    function onZoneChange(zone) {
        setSelectedSpawnGroupRow(null)
        loadDiffs(zone.ShortName, zone.Version)
    }

    return {
        spawnGroupDiffRows, spawnGroupDiffLoading,
        spawnGroupDiffFilter, setSpawnGroupDiffFilter,
        selectedSpawnGroupRow, setSelectedSpawnGroupRow,
        loadDiffs, onZoneChange
    }
}
