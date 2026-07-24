import HelpDrawer from './HelpDrawer';

// Explains why the two columns aren't paired against each other and how the two alignment
// interactions differ — see HelpDrawer.jsx for the shared chrome.
function LootHelpDrawer({showLootHelp, setShowLootHelp}) {
    return (
        <HelpDrawer open={showLootHelp} onClose={() => setShowLootHelp(false)} title="Reading the Loot tab">
            <p>
                Source and sink render as two <span className="text-gray-300">independent</span> trees, not a
                paired diff. A lootdrop lining up at roughly the same row in both columns is coincidence, not a
                claimed match — unlike a spawn point (which has real physical coordinates to match by),
                <span className="text-gray-300"> lootdrop.id</span> and <span className="text-gray-300">loottable.id</span> are
                local surrogate numbers with nothing to anchor them across two databases.
            </p>
            <div className="rounded border border-gray-700 bg-gray-850 p-3 flex flex-col gap-2 text-xs">
                <div>
                    <div className="text-gray-200 font-medium">"shared ×N"</div>
                    <div className="text-gray-500">This lootdrop is also referenced by N other loottables in the same database — a reused drop, not unique to the table you're looking at. Worth knowing before you align or edit it, since it affects more than just this one NPC's loot.</div>
                </div>
            </div>
            <p>
                <span className="text-cyan-400">Align</span> renumbers a sink row's id to match source's — a
                <span className="text-gray-300"> rename</span>, never a content overwrite; whatever's currently
                using the target id gets moved out of the way first, not replaced. Two different interactions,
                because the two ids have different anchors:
            </p>
            <ul className="text-gray-500 text-xs flex flex-col gap-1 list-disc pl-4">
                <li><span className="text-gray-300">Loottable</span> — one button. Both ids are already known (anchored via the NPC you picked), so there's nothing to pair.</li>
                <li><span className="text-gray-300">Lootdrop</span> — click "align" on a source drop, then on the sink drop you mean it to become. There's no anchor telling this tool which pair you mean, so you tell it directly.</li>
            </ul>
            <p className="text-gray-500">
                Loot table/faction/spells/merchant content itself is never synced by this tool — only compared,
                queued for manual review on the TODO tab, or realigned by id as described above. They're shared
                across many NPCs, so overwriting one on a single NPC's sync risks corrupting it for everyone else
                pointing at the same row.
            </p>
        </HelpDrawer>
    )
}

export default LootHelpDrawer
