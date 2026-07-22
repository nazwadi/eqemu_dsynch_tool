// Pure helpers for the Loot tab.

// Matches an NPC diff row against a name/id search string — mirrors npcRowMatchesSearch's shape,
// but also matches the numeric NPC id, useful when you already know which NPC you're chasing.
export function lootNpcMatchesSearch(row, query) {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    const name = (row.Source?.Fields?.name ?? row.Sink?.Fields?.name ?? '').toLowerCase()
    const id = String(row.Source?.Id ?? row.Sink?.Id ?? '')
    return name.includes(q) || id.includes(q)
}

// The loottable_id an NPC diff row carries on each side — 0 if that side has no NPC there, or
// the NPC has no loot table linked. Read directly off the already-loaded NPCs tab diff row, so
// picking an NPC for the Loot tab needs no extra Go round trip just to find out which
// loottable_id to look up (CompareZones already fetched it as part of npc_types.*).
export function lootTableIdsForRow(row) {
    return {
        sourceId: Number(row.Source?.Fields?.loottable_id ?? 0),
        sinkId: Number(row.Sink?.Fields?.loottable_id ?? 0)
    }
}

// LootTable's own fields worth showing, in a soft priority order — mirrors spawnBehaviorFields'
// drift-tolerant shape (a curated order for the common ones, anything else still shows,
// alphabetically after) rather than a hardcoded allowlist that could go stale against schema
// drift (T_PEQ_DEV and PEQ already differ on loottable_entries/lootdrop_entries columns).
const lootTablePriorityFields = ['mincash', 'maxcash', 'avgcoin', 'done', 'min_expansion', 'max_expansion']

export function lootTableFieldNames(fields) {
    const all = Object.keys(fields ?? {})
    const priority = lootTablePriorityFields.filter(f => all.includes(f))
    const rest = all.filter(f => !lootTablePriorityFields.includes(f)).sort()
    return [...priority, ...rest]
}

// lootdrop_entries' own fields worth showing first — chance is the one everyone actually cares
// about, the rest is secondary tuning data. Same drift-tolerant shape as above.
const lootDropEntryPriorityFields = ['chance', 'item_charges', 'multiplier', 'equip_item']

export function lootDropEntryFieldNames(fields) {
    const all = Object.keys(fields ?? {})
    const priority = lootDropEntryPriorityFields.filter(f => all.includes(f))
    const rest = all.filter(f => !lootDropEntryPriorityFields.includes(f)).sort()
    return [...priority, ...rest]
}
