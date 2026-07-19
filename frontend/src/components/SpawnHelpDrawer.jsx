import {useEffect, useRef} from 'react';

// Right-edge slide-over explaining the spawn2 → spawngroup → spawn entries relationship.
// Deliberately not a modal (every modal in this app means "you're about to commit to something";
// this is passive reference content) and not a popover (no positioning library, and the detail
// panel is too narrow to anchor one usefully) — see CLAUDE.md for the full reasoning. All content
// is static, so besides the open/close state this is the simplest of the overlay components.
function SpawnHelpDrawer({showSpawnHelp, setShowSpawnHelp}) {
    const spawnHelpDrawerRef = useRef(null)
    useEffect(() => {
        if (showSpawnHelp) spawnHelpDrawerRef.current?.focus()
    }, [showSpawnHelp])

    if (!showSpawnHelp) return null
    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={() => setShowSpawnHelp(false)}/>
            <div
                ref={spawnHelpDrawerRef}
                tabIndex={-1}
                onKeyDown={e => {
                    if (e.key === 'Escape') {
                        e.preventDefault()
                        setShowSpawnHelp(false)
                    }
                }}
                className="fixed top-0 right-0 bottom-0 w-96 max-w-full bg-gray-800 border-l border-gray-700 z-50 outline-none flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <h2 className="text-sm font-medium text-gray-200">How spawn points fit together</h2>
                    <button onClick={() => setShowSpawnHelp(false)}
                            className="text-gray-400 hover:text-white">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm text-gray-300">
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
                </div>
            </div>
        </>
    )
}

export default SpawnHelpDrawer
