import HelpDrawer from './HelpDrawer';

// Explains the NPC Detail panel's own badges/flags and the sync scope they exist to make honest —
// see HelpDrawer.jsx for the shared chrome.
function NpcHelpDrawer({showNpcHelp, setShowNpcHelp}) {
    return (
        <HelpDrawer open={showNpcHelp} onClose={() => setShowNpcHelp(false)} title="Reading the NPC detail panel">
            <p>
                Syncing an NPC only ever writes its own <span className="text-gray-300">npc_types</span> row.
                Nothing else about it — spawn points, loot, faction, spells — moves at the same time.
                Everything below is this panel telling you what's still your job.
            </p>
            <div className="rounded border border-gray-700 bg-gray-850 p-3 flex flex-col gap-2 text-xs">
                <div className="flex items-start gap-2">
                    <span className="text-purple-400 shrink-0">⚡</span>
                    <div>
                        <div className="text-gray-200 font-medium">Quest-spawned</div>
                        <div className="text-gray-500">This NPC has no static spawn2 row anywhere — it's summoned entirely by a quest script at runtime (the classic example is Vex Thal). Nothing wrong with it; it just means the Spawn Points tab will never show a location for it.</div>
                    </div>
                </div>
                <div className="flex items-start gap-2">
                    <span className="text-red-400 shrink-0">⚠</span>
                    <div>
                        <div className="text-gray-200 font-medium">Missing reference (red field)</div>
                        <div className="text-gray-500">A References field (faction, spells, merchant, loot table) whose id doesn't resolve to a real row in <span className="text-gray-300">that same database</span> — a dangling foreign key, most often because these local-surrogate ids get copied verbatim by an npc_types sync and just don't exist yet on the other side.</div>
                    </div>
                </div>
            </div>
            <p>
                In the References section, a field is clickable one of two ways: faction/spells/merchant open a
                side-by-side comparison drawer right here; loot table instead switches you to the Loot tab, since
                loot has its own two-level tree (loottable → lootdrop) that doesn't fit the drawer's shape.
            </p>
            <p className="text-gray-500">
                None of these four reference tables are ever synced by this tool — they're shared across many
                NPCs, so overwriting one on a single NPC's sync risks corrupting it for every other NPC that also
                points at it. They're comparison-only, queued on the TODO tab for manual review, or (when the
                only real difference is which local id the same content happens to live under) realignable
                directly from the comparison view.
            </p>
        </HelpDrawer>
    )
}

export default NpcHelpDrawer
