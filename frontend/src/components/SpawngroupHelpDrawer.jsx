import HelpDrawer from './HelpDrawer';

// Explains this tab's relationship to Spawn Points and what "ambiguous" means — see HelpDrawer.jsx
// for the shared chrome.
function SpawngroupHelpDrawer({showSpawngroupHelp, setShowSpawngroupHelp}) {
    return (
        <HelpDrawer open={showSpawngroupHelp} onClose={() => setShowSpawngroupHelp(false)} title="Reading the Spawngroups tab">
            <p>
                This tab is the same spawn2/spawngroup/spawn entries data the Spawn Points tab already shows,
                just grouped differently: one row per <span className="text-gray-300">spawngroup</span> instead
                of one row per physical location. Useful when you want to review a shared pool once instead of
                once per location it's used at.
            </p>
            <div className="rounded border border-gray-700 bg-gray-850 p-3 flex flex-col gap-2 text-xs">
                <div>
                    <div className="text-gray-200 font-medium">Matching source to sink</div>
                    <div className="text-gray-500">spawngroup.id isn't portable across databases — it's a local auto-increment number, same untrustworthy category as spawn2.id. A source spawngroup is matched to a sink one indirectly: by checking which sink spawngroup its member locations' spawn2 rows actually point at.</div>
                </div>
                <div>
                    <div className="text-gray-200 font-medium text-amber-400">Ambiguous</div>
                    <div className="text-gray-500">A source spawngroup's locations resolved to more than one distinct sink spawngroup — the two databases have diverged on which pool serves which spot. Flagged for you to look at, never auto-resolved by picking whichever one looks like a majority match.</div>
                </div>
                <div>
                    <div className="text-gray-200 font-medium text-green-400">New</div>
                    <div className="text-gray-500">Not on the sink yet, and this tab can't create it — sync one of its spawn2 locations first, on the Spawn Points tab, which creates the spawngroup as part of bringing that location over.</div>
                </div>
            </div>
            <p className="text-gray-500">
                Syncing a spawngroup here always means both halves together — its own fields (spawn_limit,
                wander box, timing) and its full spawn entries roster — never one without the other, since a
                spawngroup missing its entries isn't really usable.
            </p>
        </HelpDrawer>
    )
}

export default SpawngroupHelpDrawer
