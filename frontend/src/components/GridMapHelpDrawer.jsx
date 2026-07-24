import HelpDrawer from './HelpDrawer';

// Explains the Map view's controls, its marker legend, and — the part that isn't otherwise
// flagged anywhere in the UI — why a "modified" grid can sometimes mean something other than a
// real edit. See HelpDrawer.jsx for the shared chrome.
function GridMapHelpDrawer({showGridMapHelp, setShowGridMapHelp}) {
    return (
        <HelpDrawer open={showGridMapHelp} onClose={() => setShowGridMapHelp(false)} title="Reading the Grids map">
            <div>
                <div className="text-gray-200 font-medium text-xs uppercase tracking-wider mb-1">Controls</div>
                <ul className="text-gray-500 text-xs flex flex-col gap-1 list-disc pl-4">
                    <li>Selecting a grid auto-frames it — that's the main way this view is meant to be used, not manual pan/zoom.</li>
                    <li>Scroll to zoom toward the cursor; drag the background to pan.</li>
                    <li>The +/−/Fit buttons (bottom-right) do the same thing without a mouse wheel; Fit resets to the full zone.</li>
                    <li>Click a waypoint to select it — the matching row highlights in the detail panel's table, and vice versa.</li>
                </ul>
            </div>
            <div>
                <div className="text-gray-200 font-medium text-xs uppercase tracking-wider mb-1">Markers</div>
                <ul className="text-gray-500 text-xs flex flex-col gap-1 list-disc pl-4">
                    <li><span className="text-amber-400">●</span> Filled amber dot — a source waypoint.</li>
                    <li><span style={{color: 'rgb(45,212,191)'}}>○</span> Hollow teal ring — a sink waypoint.</li>
                    <li><span className="text-red-400">- - -</span> Dashed red line — this waypoint's X/Y position actually differs between source and sink. No line means the positions match (even if heading, pause, or Z differ slightly).</li>
                </ul>
            </div>
            <p className="text-amber-400">
                ⚠ A "modified" grid isn't always the same physical path with a few edits. grid.id is a hand-assigned
                number, not shared content lineage the way npc_types.id is — two independently-maintained databases
                can easily end up with an unrelated grid #N each. If source's and sink's waypoints for a "modified"
                grid don't overlap at all (each side tight and coherent, but far from the other), that's the
                signature of a coincidental id collision, not real drift — treat it as two different grids that
                happen to share a number, not one grid that moved.
            </p>
        </HelpDrawer>
    )
}

export default GridMapHelpDrawer
