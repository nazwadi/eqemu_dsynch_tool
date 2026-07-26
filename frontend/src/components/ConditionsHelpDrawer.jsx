import HelpDrawer from './HelpDrawer';

// Explains why two of this tab's three sections aren't diffed the way Spawn Conditions is — see
// HelpDrawer.jsx for the shared chrome.
function ConditionsHelpDrawer({showConditionsHelp, setShowConditionsHelp}) {
    return (
        <HelpDrawer open={showConditionsHelp} onClose={() => setShowConditionsHelp(false)} title="Reading the Conditions tab">
            <p>
                <span className="text-gray-300">Spawn Conditions</span> gets a real source-vs-sink diff —
                new/modified/removed/match, the same as every other tab — because its <span className="text-gray-300">id</span> is
                zone-scoped and stable (not an auto-increment surrogate), the same trust category as a patrol
                grid's own id.
            </p>
            <div className="rounded border border-gray-700 bg-gray-850 p-3 flex flex-col gap-2 text-xs">
                <div>
                    <div className="text-gray-200 font-medium">Condition Values — never diffed</div>
                    <div className="text-gray-500">
                        This is the <span className="text-gray-300">current, live value</span> of each condition —
                        tracked per running zone instance (EQEmu's instanced-zone feature assigns instance numbers
                        dynamically), so a value here reflects this server's own in-progress game state, not
                        authored content. Source and sink are shown side by side purely for visibility; they're
                        never expected to match, and syncing them would mean resetting one server's actual
                        progress to the other's.
                    </div>
                </div>
                <div>
                    <div className="text-gray-200 font-medium">Spawn Events — never paired</div>
                    <div className="text-gray-500">
                        A spawn event's own <span className="text-gray-300">id</span> is an auto-increment
                        surrogate, the same untrustworthy-across-databases category as a spawngroup or lootdrop id
                        — there's no anchor to match a source event to a sink event by, so both sides render as
                        independent lists, not a paired diff. Its scheduling fields (next run time, etc.) are also
                        continuously rewritten by the server as each event fires and reschedules, so even a
                        same-id comparison would show "different" almost constantly regardless of whether the
                        actual setup is identical.
                    </div>
                </div>
            </div>
            <p className="text-gray-500">
                Nothing on this tab is synced — it's read-only visibility only, for all three tables.
            </p>
        </HelpDrawer>
    )
}

export default ConditionsHelpDrawer
