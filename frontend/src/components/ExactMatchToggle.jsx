// Small "exact match" checkbox, shared by every search box in this app (NPCs/Spawn Points/Loot/
// Factions tabs, the zone sidebar) — see lib/searchHelpers.js's fieldMatches for why this exists
// (short numeric id lookups otherwise drown in unrelated substring matches). One shared component
// so all five toggles look and behave identically rather than five hand-copied checkboxes.
function ExactMatchToggle({checked, onChange}) {
    return (
        <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer shrink-0"
               title="Match the full name/id exactly instead of anywhere it appears as a substring">
            <input type="checkbox"
                   className="accent-yellow-400 cursor-pointer w-3 h-3"
                   checked={checked}
                   onChange={e => onChange(e.target.checked)}/>
            Exact
        </label>
    )
}

export default ExactMatchToggle
