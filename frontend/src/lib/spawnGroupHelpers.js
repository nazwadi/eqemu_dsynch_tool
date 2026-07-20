// Pure helpers for the Spawngroups tab. Row identity here is SourceGroupId when the row has one,
// falling back to SinkGroupId for "removed" rows that don't (see SpawnGroupDiffRow) — unlike
// spawn2, a matched spawngroup row's SourceGroupId/SinkGroupId aren't the same number (they're
// independent auto-increment sequences from two separate databases), so there's no single "the"
// id the way spawn2 has coordinates; SourceGroupId is just the one that's always present except
// on a source-less row.

export function spawnGroupRowId(row) {
    return row.SourceGroupId || row.SinkGroupId
}

// Only "modified" rows are syncable from this tab. "new" rows have no sink spawn2 location to
// attach a spawngroup to yet (SyncSpawnGroup, like the entries-only sync it generalizes, requires
// an existing sink spawn2 row to identify the target — sync that spawn point itself first, same as
// the Spawn Points tab's own "not found" message already explains). "ambiguous" rows are flagged,
// not guessed at, so there's no single sink spawngroup to sync into. "removed"/"match" have
// nothing to sync.
export function spawnGroupRowSelectable(row) {
    return row.Status === 'modified'
}

// A spawngroup with one spawn entry is a normal single-NPC spawn; more than one means a weighted
// pool. Mirrors spawnPoolSummary's shape (frontend/src/lib/spawnHelpers.js) but reads directly off
// a SpawnGroupDiffRow's own Source/SinkPool rather than a SpawnPoint's nested one.
export function spawnGroupPoolSummary(pool) {
    if (!pool || pool.length === 0) return '(no spawn entries)'
    // NPCID always shown alongside the name, never hidden behind it — see spawnPoolSummary's
    // matching comment in spawnHelpers.js.
    if (pool.length === 1) return `${pool[0].NPCName || 'Unknown NPC'} (${pool[0].NPCID})`
    return `${pool.length} NPCs`
}

// The one-line "name · spawn entries preview · used at N locations" text for a diff-list row.
export function spawnGroupRowLabel(name, pool, locationCount) {
    if (name == null) return '-'
    const locations = locationCount === 1 ? '1 location' : `${locationCount ?? 0} locations`
    return `"${name}" · ${spawnGroupPoolSummary(pool)} · ${locations}`
}
