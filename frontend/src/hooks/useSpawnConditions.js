import {useState} from 'react';
import {CompareZoneConditions} from "../../wailsjs/go/main/App";

// Conditions tab state (added 2026-07-25) — read-only visibility for spawn_conditions/
// spawn_condition_values/spawn_events, see conditions.go's own comment for why this is
// comparison-only with no sync/selection state at all, unlike every other domain hook. Simpler
// than useGridSync.js for the same reason: nothing here is ever selected or synced, just loaded
// and shown, so there's no selectedXRow/showXSyncPreview/etc. to carry.
export function useSpawnConditions() {
    const [conditionsComparison, setConditionsComparison] = useState(null)
    const [conditionsLoading, setConditionsLoading] = useState(false)

    function loadDiffs(zoneShortName) {
        if (!zoneShortName) {
            setConditionsComparison(null)
            return
        }
        setConditionsLoading(true)
        setConditionsComparison(null)
        CompareZoneConditions(zoneShortName)
            .then(setConditionsComparison)
            .catch(err => console.error("compare zone conditions failed:", err))
            .finally(() => setConditionsLoading(false))
    }

    function onZoneChange(zone) {
        loadDiffs(zone.ShortName)
    }

    return {conditionsComparison, conditionsLoading, loadDiffs, onZoneChange}
}
