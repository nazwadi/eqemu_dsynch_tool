// Pure helpers for the Spawngroups tab. Row identity here is SourceGroupId when the row has one,
// falling back to SinkGroupId for "removed" rows that don't (see SpawnGroupDiffRow) — unlike
// spawn2, a matched spawngroup row's SourceGroupId/SinkGroupId aren't the same number (they're
// independent auto-increment sequences from two separate databases), so there's no single "the"
// id the way spawn2 has coordinates; SourceGroupId is just the one that's always present except
// on a source-less row.

export function spawnGroupRowId(row) {
    return row.SourceGroupId || row.SinkGroupId
}

// True when both sides have a spawngroup at this row (matched by member spawn2 coordinates, see
// CompareSpawnGroups) but under different raw ids. **Not automatically benign** — some custom
// content assigns spawngroup.id following the same zoneIdNumber*1000+offset block npc_types' own
// quest-spawn range uses (see EQEmu Schema Notes), and for a zone that does, source and sink
// mostly end up with the EXACT SAME id, not just "both plausible." Confirmed against real data
// (Skyfire, 2026-07-30): 43 of 47 spawngroups matched id-for-id across both databases; the 4 that
// didn't were legacy sink-side ids never migrated onto the convention source now uses. See
// row.SourceIdOutOfZoneRange/SinkIdOutOfZoneRange for the sharper, more specific signal — an id
// outside the zone's own numbering block is the concrete, checkable version of "this is probably
// unmigrated leftover content," whereas this flag alone just means the two numbers don't match
// (which is unremarkable for a zone that never used the convention in the first place).
export function spawnGroupIdsDiffer(row) {
    return !!row.SourceGroupId && !!row.SinkGroupId && row.SourceGroupId !== row.SinkGroupId
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
// pool. Mirrors spawnEntriesSummary's shape (frontend/src/lib/spawnHelpers.js) but reads directly off
// a SpawnGroupDiffRow's own Source/SinkSpawnEntries rather than a SpawnPoint's nested one.
export function spawnGroupEntriesSummary(entries) {
    if (!entries || entries.length === 0) return '(no spawn entries)'
    // NPCID always shown alongside the name, never hidden behind it — see spawnEntriesSummary's
    // matching comment in spawnHelpers.js.
    if (entries.length === 1) return `${entries[0].NPCName || 'Unknown NPC'} (${entries[0].NPCID})`
    return `${entries.length} NPCs`
}

// The one-line "name · spawn entries preview · used at N locations" text for a diff-list row.
export function spawnGroupRowLabel(name, entries, locationCount) {
    if (name == null) return '-'
    const locations = locationCount === 1 ? '1 location' : `${locationCount ?? 0} locations`
    return `"${name}" · ${spawnGroupEntriesSummary(entries)} · ${locations}`
}
