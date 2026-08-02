// Shared substring/exact matching for every search box in this app (NPCs/Spawn Points/Loot/
// Factions tabs, the zone sidebar) — 'exact' switches from the default case-insensitive substring
// match to case-insensitive exact equality. Added specifically for id lookups (Factions' search
// doubles as a name/id lookup): a short numeric id otherwise matches every longer id that happens
// to contain it as a substring ("12" matching 120, 1200, 512, ...), which makes jumping straight
// to one specific id unreliable. One shared function so every *MatchesSearch helper switches the
// same way instead of five independent ternaries that could drift out of sync with each other.
export function fieldMatches(value, query, exact) {
    const v = (value ?? '').toString().toLowerCase()
    return exact ? v === query : v.includes(query)
}
