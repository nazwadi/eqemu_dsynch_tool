import {useState} from 'react';
import {GetZoneMap} from "../../wailsjs/go/main/App";

// Zone map (Brewall's Maps background) state — much simpler than the other domain hooks since a
// zone's map is static per zone, nothing to diff or sync. mapsDirectory is read fresh each render
// (passed in from useConnections, same "explicit dependency" pattern useConnections itself uses
// for uiPrefs) rather than closed over implicitly.
export function useZoneMap(mapsDirectory) {
    const [zoneMap, setZoneMap] = useState(null)
    const [zoneMapLoading, setZoneMapLoading] = useState(false)

    // Called from selectZone's fan-out on every zone switch (not only when Map view is opened),
    // so toggling List/Map in the Grids tab never has to wait on a fetch.
    function loadZoneMap(zoneShortName) {
        if (!mapsDirectory || !zoneShortName) {
            setZoneMap(null)
            return
        }
        setZoneMapLoading(true)
        GetZoneMap(mapsDirectory, zoneShortName)
            .then(setZoneMap)
            .catch(err => console.error("load zone map failed:", err))
            .finally(() => setZoneMapLoading(false))
    }

    return {zoneMap, zoneMapLoading, loadZoneMap}
}
