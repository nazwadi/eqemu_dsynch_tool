// Field groups for the NPC Detail panel's collapsible sections. Authoritative allowlist (unlike
// the Spawn Point panel's drift-tolerant Behavior section) since npc_types columns don't drift
// the same way spawn2 does between schema variants.
export const fieldGroups = {
    identity: ['name', 'lastname', 'race', 'class', 'gender', 'bodytype', 'size', 'texture', 'helmtexture', 'model'],
    combat: ['level', 'maxlevel', 'scalerate', 'hp', 'mana', 'AC', 'ATK', 'mindmg', 'maxdmg', 'attack_count', 'attack_speed', 'attack_delay', 'hp_regen_rate', 'mana_regen_rate'],
    resistances: ['MR', 'CR', 'DR', 'FR', 'PR', 'Corrup', 'PhR'],
    ability_scores: ['STR', 'STA', 'DEX', 'AGI', 'INT', 'WIS', 'CHA'],
    behavior: ['aggroradius', 'assistradius', 'npc_aggro', 'always_aggro', 'see_invis', 'see_invis_undead', 'see_hide', 'trackable', 'flymode'],
    references: ['loottable_id', 'npc_spells_id', 'npc_faction_id', 'merchantid', 'alt_currency_id']
}

// Which References fields currently have a working source-vs-sink comparison drawer — extend this
// as more reference types (spells/merchant/loot) gain their own. A field not listed here renders
// as a plain, non-interactive row, exactly like before this existed; alt_currency_id is
// deliberately absent since it's unused (0 count) on every server checked so far, not just
// "not built yet" — see CLAUDE.md's roadmap notes on the shared reference table comparison work.
export const referenceComparisonTypes = {
    npc_faction_id: 'faction',
    npc_spells_id: 'spells',
    merchantid: 'merchant'
}

// A "new" NPC that needs a real spawn point can't sync unless the "Create spawn points" checkbox
// (syncSpawns) is on — takes syncSpawns as a parameter rather than closing over it so this stays
// a pure function testable/movable independent of component state.
export function needsSpawnPoint(row, syncSpawns) {
    return row.Status === 'new' && row.Source?.HasSpawnPoint && !syncSpawns
}

// Mirrors spawnRowMatchesSearch's shape for the NPCs tab — matches either side's name, since a
// "removed" row only has a Sink name and a "new" row only has a Source one.
export function npcRowMatchesSearch(row, query) {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return (row.Source?.Fields?.name ?? '').toLowerCase().includes(q) ||
        (row.Sink?.Fields?.name ?? '').toLowerCase().includes(q)
}
