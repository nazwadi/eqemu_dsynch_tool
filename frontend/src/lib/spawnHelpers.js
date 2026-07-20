// Pure helpers shared by the Spawn Points tab and the Spawn Point Detail panel. Nothing here
// closes over component state — every dependency is passed in as an argument — so these can be
// tested, moved, or reused independent of App.jsx's render cycle.

export function fmtCoord(n) {
    return Number.isFinite(n) ? n.toFixed(1) : '—'
}

// spawn2 has no cross-database ID (see CLAUDE.md's Spawn point identity note) — coordinates
// are the only stable identity, so every spawn row helper keys off them instead of an id.
export function spawnCoords(row) {
    const point = row.Source ?? row.Sink
    return [point?.Fields?.x, point?.Fields?.y, point?.Fields?.z].map(Number)
}

export function spawnKey(row) {
    return spawnCoords(row).join(',')
}

// A "modified" row can differ in its own spawn2 fields, its spawn entries, or both — but Sync
// only ever fixes the former (spawn entries are never auto-synced, see spawnEntriesOnly below).
// A row that's "modified" purely because its spawn entries differ has nothing for Sync to do;
// letting it stay checkbox-selectable would produce a no-op UPDATE that looks like progress
// while the actual (unsyncable) difference is still sitting there unresolved.
export function spawnRowSelectable(row) {
    if (row.Status === 'new') return true
    if (row.Status === 'modified') return row.FieldsDiffer
    return false
}

// True when a "modified" row's only difference is its spawn entries — nothing here for Sync to
// change. Used to visually separate "this needs syncing" from "this needs manual review" instead
// of lumping both under one yellow "modified" treatment.
export function spawnEntriesOnly(row) {
    return row.Status === 'modified' && !row.FieldsDiffer
}

export function spawnRowMatchesSearch(row, query) {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return [row.Source, row.Sink].filter(Boolean).some(point =>
        (point.SpawnGroupFields?.name ?? '').toLowerCase().includes(q) ||
        (point.Pool ?? []).some(pe => (pe.NPCName ?? '').toLowerCase().includes(q))
    )
}

// A spawngroup with one spawn entry is a normal single-NPC spawn; more than one means it's a
// weighted spawngroup shared across whichever NPCs are listed — surfaced here instead of just
// showing a count so "what's here" is visible without opening the detail panel. Terminology
// matches the EQEmu tables/editor (spawngroup, spawn entry), not a generic "pool", per direct
// feedback that "Pool" wasn't recognizable vocabulary for someone editing this schema day to day.
// Deliberately doesn't say "spawngroup" itself — spawnRowLabel() below prefixes that label
// so it's clear this text is a preview of the linked spawngroup's contents, not the row's
// own identity (the row is a spawn2 location; see the diff list's explanatory caption).
export function spawnPoolSummary(point) {
    if (!point || !point.Pool || point.Pool.length === 0) return '(no spawn entries)'
    // NPCID always shown alongside the name, never hidden behind it — this tool is for devs
    // cross-referencing raw SQL, where the id is what you actually search/join on.
    if (point.Pool.length === 1) return `${point.Pool[0].NPCName || 'Unknown NPC'} (${point.Pool[0].NPCID})`
    return `${point.Pool.length} NPCs`
}

// The one-line "coordinates · spawngroup: preview" text used everywhere a spawn2 row is
// rendered as a single line (diff list, sync preview) — keeps the spawn2-vs-spawngroup
// distinction consistent instead of re-templating it at each call site.
export function spawnRowLabel(point) {
    if (!point) return '-'
    return `(${fmtCoord(Number(point.Fields.x))}, ${fmtCoord(Number(point.Fields.y))}, ${fmtCoord(Number(point.Fields.z))}) · spawngroup: ${spawnPoolSummary(point)}`
}

// Merges source/sink spawn entries by NPCID so a detail panel can show a single table with both
// sides' chance side by side, the same shape as the field-level source→sink comparisons elsewhere.
// Takes the two Pool arrays directly (not a row object) so it works the same whether the caller is
// a SpawnDiffRow (Source.Pool/Sink.Pool) or a SpawnGroupDiffRow (SourcePool/SinkPool directly).
export function spawnEntryRows(sourcePool, sinkPool) {
    const byId = new Map()
    for (const pe of sourcePool ?? []) {
        byId.set(pe.NPCID, {npcId: pe.NPCID, name: pe.NPCName || `NPC ${pe.NPCID}`, srcChance: pe.Chance})
    }
    for (const pe of sinkPool ?? []) {
        const existing = byId.get(pe.NPCID) ?? {npcId: pe.NPCID, name: pe.NPCName || `NPC ${pe.NPCID}`}
        existing.sinkChance = pe.Chance
        byId.set(pe.NPCID, existing)
    }
    return Array.from(byId.values())
        .map(r => ({...r, differs: r.srcChance !== r.sinkChance}))
        .sort((a, b) => a.name.localeCompare(b.name))
}

// x/y/z are the coordinate-matching key itself (see CLAUDE.md's "Spawn point identity" note) —
// a matched row's source and sink are guaranteed identical on these three by construction, so
// showing them as a source→sink diff pair would always be blank noise. They're rendered once,
// as static identity, not as a diffable field group. `heading` is a genuine spawn2 column that
// can vary independently, so it's treated as an ordinary Behavior field instead.
export const spawnIdentityFieldNames = ['x', 'y', 'z']

// Fields most worth a glance first — a soft ordering hint, not an exhaustive/authoritative list
// (unlike fieldGroups on the NPC panel). Anything not named here still shows, just after these,
// alphabetically — same drift-tolerant philosophy as the rest of the spawn2 column handling.
export const spawnPriorityFieldNames = ['respawntime', 'variance', 'pathgrid', 'enabled']

// spawn2 has far fewer columns than npc_types and no established grouping convention like
// the NPC detail panel's fieldGroups, so instead of hardcoding a column list that could drift
// from either database's schema, Behavior is just "whatever spawn2 columns aren't the identity
// coordinates" — the same drift-tolerant approach getSpawnPointsForZone already takes on the Go side.
export function spawnBehaviorFields(row) {
    const allFields = new Set([
        ...Object.keys(row.Source?.Fields ?? {}),
        ...Object.keys(row.Sink?.Fields ?? {})
    ])
    const remaining = Array.from(allFields).filter(f => !spawnIdentityFieldNames.includes(f))
    const priority = spawnPriorityFieldNames.filter(f => remaining.includes(f))
    const rest = remaining.filter(f => !spawnPriorityFieldNames.includes(f)).sort()
    return [...priority, ...rest]
}

// Every OTHER selectable location sharing anchor row's spawngroup, as an array of spawnKey()
// strings — the caller adds these to whatever selection Set it's managing. Compares SpawnGroupId
// only within the same side (source-to-source, sink-to-sink) since those IDs are independent
// auto-increment sequences from separate databases; a coincidental numeric match across sides
// would be meaningless.
export function keysSharingSpawngroup(row, spawnDiffRows) {
    const useSource = !!row.Source
    const anchor = useSource ? row.Source : row.Sink
    if (!anchor) return []
    return spawnDiffRows
        .filter(r => (useSource ? r.Source : r.Sink)?.SpawnGroupId === anchor.SpawnGroupId)
        .filter(spawnRowSelectable)
        .map(spawnKey)
}
