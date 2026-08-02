// Same status vocabulary Sidebar.jsx's connection cards already use (Connected/Connecting…/
// Connection failed/Disconnected) — reused here so a tab describes "not ready" in the exact same
// words the sidebar already established, instead of each tab inventing its own phrasing.
const statusLabel = {
    connecting: 'still connecting',
    error: 'failed to connect',
    disconnected: 'disconnected'
}

// Renders nothing when every required side is actually connected; otherwise a centered message
// naming which side(s) aren't, in the same "flex-1 flex items-center justify-center text-gray-600
// text-sm" empty-state slot every tab's own "no data"/"select a zone" messages already use. Direct
// fix for a real, reported bug: every diff-driving tab's own loading flag gets reset to false in a
// .finally() regardless of whether the underlying Compare* call actually succeeded or failed (e.g.
// because source/sink isn't connected) — with no separate error state, the tab fell through to
// whatever its own "no data" fallback said, which ranged from a stuck "Loading…" (Factions, whose
// own `loaded` flag is only ever set true on success) to a flatly wrong "No NPCs found in this
// zone" (NPCs, Spawns, Grids, Spawngroups) that reads as "this zone is genuinely empty" rather than
// "the fetch never actually happened." Checking real connection state directly — already tracked
// in useConnections.js — instead of trying to infer it from a failed fetch's aftermath fixes this
// at the source and makes every tab describe the same situation identically.
//
// Every diff-driving tab requires BOTH sides (every Compare* Go call fails outright if either side
// is nil) — requireSource/requireSink default to true accordingly. Factions is the one exception:
// its two columns are informed independently (ListNPCFactions takes one side at a time), so
// FactionsTab checks each column's own status itself rather than using this all-or-nothing notice.
function ConnectionNotice({sourceStatus, sinkStatus, requireSource = true, requireSink = true}) {
    const problems = []
    if (requireSource && sourceStatus !== 'connected') problems.push(`Source is ${statusLabel[sourceStatus] ?? 'disconnected'}`)
    if (requireSink && sinkStatus !== 'connected') problems.push(`Sink is ${statusLabel[sinkStatus] ?? 'disconnected'}`)
    if (problems.length === 0) return null
    return (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm text-center px-4">
            {problems.join(' · ')} — connect from the sidebar to use this tab.
        </div>
    )
}

export default ConnectionNotice
