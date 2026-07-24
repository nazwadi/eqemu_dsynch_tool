import HelpDrawer from './HelpDrawer';

// Explains the spawn2 → spawngroup → spawn entries relationship. See HelpDrawer.jsx for the
// shared chrome this and every other tab's help drawer now uses.
function SpawnHelpDrawer({showSpawnHelp, setShowSpawnHelp}) {
    return (
        <HelpDrawer open={showSpawnHelp} onClose={() => setShowSpawnHelp(false)} title="How spawn points fit together">
            <p>
                These three EQEmu tables form a strict hierarchy, not a many-to-many relationship:
            </p>
            <div className="rounded border border-gray-700 bg-gray-850 p-3 flex flex-col gap-2 text-xs">
                <div>
                    <div className="text-gray-200 font-medium">spawn2</div>
                    <div className="text-gray-500">A physical location (x, y, z) in a zone. Each row in this tab's list is one spawn2.</div>
                </div>
                <div className="text-gray-600 pl-3">↓ every location points at exactly one spawngroup</div>
                <div className="pl-3">
                    <div className="text-gray-200 font-medium">spawngroup</div>
                    <div className="text-gray-500">A named, reusable config. The same spawngroup can be pointed at by many spawn2 locations — that's what the "shared ×N" badge means. A location can never point at more than one spawngroup at once.</div>
                </div>
                <div className="text-gray-600 pl-6">↓ one spawngroup can hold many spawn entries</div>
                <div className="pl-6">
                    <div className="text-gray-200 font-medium">spawn entries</div>
                    <div className="text-gray-500">Rows in the spawnentry table — each links the spawngroup to one NPC and a chance %. Every location sharing a spawngroup gets the exact same entries; there's no per-location override.</div>
                </div>
            </div>
            <p>
                In practice: "shared ×9, 2 NPCs" means one spawngroup reused at 9 physical spots, each always offering the same 2 possible NPCs.
            </p>
            <p className="text-gray-500">
                A spawn2 row's own fields (coordinates, respawn timing, etc.) can be synced directly. Spawn entries are shared data — this tool always flags differences there for manual review instead of guessing which side is right.
            </p>
            <p className="text-gray-500">
                Note on coordinates: the database (and this tool) store and display <span className="text-gray-300">X, Y, Z</span>. In-game, the <span className="text-gray-300">/loc</span> command reports <span className="text-gray-300">Y, X, Z</span> — a different order. The Location fields in the detail panel are labeled per-axis specifically so this never has to be guessed.
            </p>
        </HelpDrawer>
    )
}

export default SpawnHelpDrawer
