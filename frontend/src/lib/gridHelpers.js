// Pure helpers for the Grids tab. Simpler than spawnHelpers.js overall: grid.id is trustworthy
// identity within a zone (see CLAUDE.md/GridPoint for why, unlike spawn2's coordinate matching),
// and a grid isn't shared data the way a spawngroup is, so there's no FieldsDiffer/PoolDiffers
// split to track here — a "modified" grid is fully syncable, fields and waypoints together.

export function gridId(row) {
    return row.Source?.Id ?? row.Sink?.Id
}

export function gridRowSelectable(row) {
    return row.Status === 'new' || row.Status === 'modified'
}

export function gridWaypointSummary(point) {
    const count = point?.Entries?.length ?? 0
    if (count === 0) return '(no waypoints)'
    return `${count} waypoint${count === 1 ? '' : 's'}`
}

function waypointsEqual(a, b) {
    if (!a || !b) return false
    return a.X === b.X && a.Y === b.Y && a.Z === b.Z && a.Heading === b.Heading &&
        a.Pause === b.Pause && a.Centerpoint === b.Centerpoint
}

// Merges source/sink waypoints by Number so the detail panel can show one table with both
// sides' coordinates/pause side by side — the same shape spawnEntryRows already uses for
// spawn entries, keyed by Number (a waypoint's position in the patrol path) instead of NPCID.
export function gridEntryRows(row) {
    const byNumber = new Map()
    for (const e of row.Source?.Entries ?? []) {
        byNumber.set(e.Number, {number: e.Number, src: e, sink: null})
    }
    for (const e of row.Sink?.Entries ?? []) {
        const existing = byNumber.get(e.Number) ?? {number: e.Number, src: null, sink: null}
        existing.sink = e
        byNumber.set(e.Number, existing)
    }
    return Array.from(byNumber.values())
        .map(r => ({...r, differs: !waypointsEqual(r.src, r.sink)}))
        .sort((a, b) => a.number - b.number)
}
