import HelpDrawer from './HelpDrawer';

// Explains the Spawn Points Map view's controls, its marker legend, and — the thing that isn't
// otherwise obvious from the map alone — why a matched location's source/sink markers always sit
// exactly on top of each other rather than showing a drift line the way the Grids map's waypoints
// can. See HelpDrawer.jsx for the shared chrome, and SpawnMapView.jsx's own header comment for the
// full reasoning this condenses.
function SpawnMapHelpDrawer({showSpawnMapHelp, setShowSpawnMapHelp}) {
    return (
        <HelpDrawer open={showSpawnMapHelp} onClose={() => setShowSpawnMapHelp(false)} title="Reading the Spawn Points map">
            <div>
                <div className="text-gray-200 font-medium text-xs uppercase tracking-wider mb-1">Controls</div>
                <ul className="text-gray-500 text-xs flex flex-col gap-1 list-disc pl-4">
                    <li>Selecting a spawn point (here or in the picker list on the left) auto-frames it.</li>
                    <li>Scroll to zoom toward the cursor; drag the background to pan.</li>
                    <li>The +/−/Fit buttons (bottom-right) do the same thing without a mouse wheel; Fit resets to the full zone.</li>
                    <li>Click a marker on the map to select it — the List view's diff list and the detail panel both follow.</li>
                </ul>
            </div>
            <div>
                <div className="text-gray-200 font-medium text-xs uppercase tracking-wider mb-1">Markers</div>
                <ul className="text-gray-500 text-xs flex flex-col gap-1 list-disc pl-4">
                    <li><span className="text-amber-400">●</span> Filled amber dot — a source spawn2 row exists at this location.</li>
                    <li><span style={{color: 'rgb(45,212,191)'}}>○</span> Hollow teal ring — a sink spawn2 row exists at this location.</li>
                    <li>Dot and ring together, at the same spot — a "matched"/"modified" location, present on both sides.</li>
                    <li>A lone dot with no ring — a "new" location, source only. A lone ring with no dot — a "removed" location, about to be deleted from sink if synced.</li>
                </ul>
            </div>
            <p className="text-amber-400">
                ⚠ Unlike the Grids map, there's no drift line here. A spawn2 location's identity <em>is</em> its
                exact (x, y, z) coordinate (see CLAUDE.md's "Spawn point identity" note) — so a matched location's
                source and sink markers are always at precisely the same spot, by construction, not "close." What
                actually differs between source and sink at a matched location (respawn time, spawngroup contents,
                etc.) is field-level detail this map doesn't visualize — see the List view and the detail panel
                for that.
            </p>
        </HelpDrawer>
    )
}

export default SpawnMapHelpDrawer
