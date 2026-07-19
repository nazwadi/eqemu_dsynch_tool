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
