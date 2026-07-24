// Field groups for the NPC Detail panel's collapsible sections. Authoritative allowlist (unlike
// the Spawn Point panel's drift-tolerant Behavior section) since npc_types columns don't drift
// the same way spawn2 does between schema variants.
export const fieldGroups = {
    identity: ['name', 'lastname', 'race', 'class', 'gender', 'bodytype', 'size', 'texture', 'helmtexture', 'model'],
    combat: ['level', 'maxlevel', 'scalerate', 'hp', 'mana', 'AC', 'ATK', 'mindmg', 'maxdmg', 'attack_count', 'attack_speed', 'attack_delay', 'hp_regen_rate', 'mana_regen_rate'],
    resistances: ['MR', 'CR', 'DR', 'FR', 'PR', 'Corrup', 'PhR'],
    ability_scores: ['STR', 'STA', 'DEX', 'AGI', 'INT', 'WIS', 'CHA'],
    behavior: ['aggroradius', 'assistradius', 'npc_aggro', 'always_aggro', 'see_invis', 'see_invis_undead', 'see_hide', 'trackable', 'flymode'],
    // merchant_id, not merchantid — npc_types spells it with an underscore even though the table
    // it points at (merchantlist) doesn't; confirmed via SHOW COLUMNS after "merchantid" here (and
    // in app.go's referenceFKColumns/buildTODOItems) silently returned nothing for every NPC.
    references: ['loottable_id', 'npc_spells_id', 'npc_faction_id', 'merchant_id', 'alt_currency_id']
}

// Which References fields currently have a working source-vs-sink comparison drawer — extend this
// as more reference types (spells/merchant/loot) gain their own. A field not listed here renders
// as a plain, non-interactive row, exactly like before this existed; alt_currency_id is
// deliberately absent since it's unused (0 count) on every server checked so far, not just
// "not built yet" — see CLAUDE.md's roadmap notes on the shared reference table comparison work.
export const referenceComparisonTypes = {
    npc_faction_id: 'faction',
    npc_spells_id: 'spells',
    merchant_id: 'merchant'
}

// loottable_id is clickable too, but doesn't open the shared ReferenceDrawer the way the three
// above do — loot's own comparison is one level deeper (loottable -> loottable_entries ->
// lootdrop -> lootdrop_entries) and already has its own richer tab (LootTab.jsx, including the
// ID-alignment action) rather than a read-only drawer, so clicking it navigates there with this
// NPC preloaded instead of duplicating that tree UI in a slide-over. Kept as its own map (not
// folded into referenceComparisonTypes) since the two are genuinely different actions — open a
// drawer vs. switch tabs — not two flavors of the same click.
export const referenceNavigationTypes = {
    loottable_id: 'loot'
}

// Mirrors spawnRowMatchesSearch's shape for the NPCs tab — matches either side's name, since a
// "removed" row only has a Sink name and a "new" row only has a Source one.
export function npcRowMatchesSearch(row, query) {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (row.Source?.Fields?.name ?? '').toLowerCase().includes(q) ||
        (row.Sink?.Fields?.name ?? '').toLowerCase().includes(q)
}

// A "modified" row can differ purely because of columns the user has chosen to exclude from sync
// (see CompareZones' excludedFields param and NPCDiffRow.FieldsDiffer) — Sync's UPDATE won't touch
// those, so selecting and syncing such a row would be a real but pointless no-op UPDATE that looks
// like progress while the (deliberately unsynced) difference is still sitting there. Mirrors
// spawnRowSelectable/spawnEntriesOnly's exact shape for the same reason. Every other status is left
// exactly as selectable as it already was — "removed" rows, for instance, already no-op safely
// through Sync's existing "not found in source" skip path, so there's nothing new to gate there.
export function npcRowSelectable(row) {
    if (row.Status === 'modified') return row.FieldsDiffer
    return true
}

// True when a "modified" row's only difference is in excluded fields — nothing here for Sync to
// change. Used to visually separate "this needs syncing" from "this is deliberately left alone",
// the same distinction spawnEntriesOnly draws for spawn2 rows.
export function npcFieldsOnlyExcluded(row) {
    return row.Status === 'modified' && !row.FieldsDiffer
}

// Every real npc_types column seen across the currently-loaded diff rows — the candidate universe
// for the "Excluded fields" drawer. Derived from already-loaded data rather than a hardcoded list
// (unlike fieldGroups, which is curated for the detail panel's own sections) specifically so it
// stays accurate against schema drift instead of going stale if a schema variant adds/removes
// columns — the same drift-tolerant philosophy spawnBehaviorFields already uses for spawn2. "id"
// is never a candidate — excluding the primary key isn't meaningful and upsertNPC already treats
// it specially regardless.
export function npcAllFieldNames(diffRows) {
    const names = new Set()
    for (const row of diffRows) {
        for (const key of Object.keys(row.Source?.Fields ?? {})) names.add(key)
        for (const key of Object.keys(row.Sink?.Fields ?? {})) names.add(key)
    }
    names.delete('id')
    return Array.from(names).sort()
}

// True if either side's NPC.MissingReferences (npc_faction_id/npc_spells_id/merchant_id pointing
// at a row that doesn't exist in that same database — see app.go's annotateMissingReferences)
// has anything in it — drives the diff list's row-level flag, the same "subtle badge before you
// even open the detail view" treatment SpawnsTab gives SpawnGroupMissing/PathgridMissing.
export function npcRowHasMissingReferences(row) {
    return Object.keys(row.Source?.MissingReferences ?? {}).length > 0 ||
        Object.keys(row.Sink?.MissingReferences ?? {}).length > 0
}
