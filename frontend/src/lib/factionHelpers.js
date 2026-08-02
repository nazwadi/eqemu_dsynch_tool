// Pure helpers for the Factions tab.
import {fieldMatches} from './searchHelpers';

export function factionMatchesSearch(faction, query, exact) {
    if (!query.trim()) return true
    const q = query.trim().toLowerCase()
    return fieldMatches(faction.Name, q, exact) || fieldMatches(faction.Id, q, exact)
}

// Shared by both Factions tab columns so they always sort in the same order — comparing two
// arbitrary npc_faction rows across databases means nothing (see ListNPCFactions' own comment), so
// keeping both lists in the same visual order is what actually helps a human eyeball a match, not
// a per-column independent sort.
export function sortFactions(list, sortBy, sortDir) {
    const sorted = [...list].sort((a, b) =>
        sortBy === 'id' ? a.Id - b.Id : (a.Name ?? '').localeCompare(b.Name ?? '')
    )
    if (sortDir === 'desc') sorted.reverse()
    return sorted
}

// npc_value/temp are flag-shaped (0/1), not graduated values like `value` is, so they're folded
// into the cell as a compact suffix instead of two more columns — same convention
// FactionComparison's fmtEntry already established for the paired-diff case, adapted here for a
// single one-sided value (no exists/differs to account for, an entry either is or isn't in the list).
export function formatFactionEntry(entry) {
    const flags = [entry.NPCValue ? 'npc' : null, entry.Temp ? 'temp' : null].filter(Boolean)
    return flags.length > 0 ? `${entry.Value} (${flags.join(', ')})` : `${entry.Value}`
}
