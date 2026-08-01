// Field groups for the NPC Detail panel's collapsible sections. Authoritative allowlist (unlike
// the Spawn Point panel's drift-tolerant Behavior section) since npc_types columns don't drift
// the same way spawn2 does between schema variants.
export const fieldGroups = {
    identity: ['name', 'lastname', 'race', 'class', 'gender', 'bodytype', 'size', 'texture', 'helmtexture', 'model'],
    combat: ['level', 'maxlevel', 'scalerate', 'hp', 'mana', 'AC', 'ATK', 'mindmg', 'maxdmg', 'attack_count', 'attack_speed', 'attack_delay', 'hp_regen_rate', 'mana_regen_rate'],
    resistances: ['MR', 'CR', 'DR', 'FR', 'PR', 'Corrup', 'PhR'],
    ability_scores: ['STR', 'STA', 'DEX', 'AGI', 'INT', 'WIS', 'CHA'],
    // special_abilities (added 2026-08-01) — a caret/comma-encoded flag string covering ~40
    // unrelated abilities (Rampage/Flurry/Area Rampage's own "percent chance of a bonus melee
    // attack" among them — the closest thing to an "attack proc" that exists on npc_types; there is
    // no dedicated attack_proc/ranged_proc column, confirmed against EQEmu's own schema docs).
    // Already participated in the full field diff/Sync upsert like any other npc_types column —
    // this was the only thing actually missing: without it in a field group, a difference here
    // could flip a row to "modified" with no way to see WHY in the detail panel. Shown as one
    // opaque string, not parsed into individual abilities — a deliberate choice: this app already
    // errs on the side of never guessing at an undocumented format for something that could get
    // written back to a live server, and this format's positional per-ability parameters aren't
    // documented cleanly enough to trust that decoding without real risk of getting one wrong.
    // npcspecialattks (the pre-special_abilities predecessor column) is excluded — official docs
    // mark it deprecated, so it's not worth cluttering this section with a fully superseded field.
    behavior: ['aggroradius', 'assistradius', 'npc_aggro', 'always_aggro', 'see_invis', 'see_invis_undead', 'see_hide', 'trackable', 'flymode', 'special_abilities'],
    // merchant_id, not merchantid — npc_types spells it with an underscore even though the table
    // it points at (merchantlist) doesn't; confirmed via SHOW COLUMNS after "merchantid" here (and
    // in app.go's referenceFKColumns/buildTODOItems) silently returned nothing for every NPC.
    // npc_spells_effects_id (added 2026-08-01) — EQEmu's "NPC Spell Effects" system, structurally a
    // clone of npc_spells; 0 NPCs used it on the database this was verified against, built ahead of
    // adoption anyway (see CompareNPCSpellsEffects's own comment).
    references: ['loottable_id', 'npc_spells_id', 'npc_faction_id', 'merchant_id', 'alt_currency_id', 'npc_spells_effects_id']
}

// Which References fields currently have a working source-vs-sink comparison drawer — extend this
// as more reference types (spells/merchant/loot) gain their own. A field not listed here renders
// as a plain, non-interactive row, exactly like before this existed; alt_currency_id is
// deliberately absent since it's unused (0 count) on every server checked so far, not just
// "not built yet" — see CLAUDE.md's roadmap notes on the shared reference table comparison work.
export const referenceComparisonTypes = {
    npc_faction_id: 'faction',
    npc_spells_id: 'spells',
    merchant_id: 'merchant',
    npc_spells_effects_id: 'spellEffects'
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

// Name-first summary of new/missing NPCs for the NPC Diff panel — compares raw name COUNTS across
// the entire source/sink population for this zone, completely independent of npc_types.id and of
// CompareZones' own id-based Status. This is deliberately NOT built on top of Status='new'/
// 'removed' rows (an earlier version of this function was) — real, verified data from a live
// zone (Skyfire, both databases, 2026-07-30) showed why that doesn't work: npc_types.id is
// AUTO_INCREMENT, not portable lineage, and some custom EQEmu content additionally reuses a
// `zoneidnumber*1000 + offset` id convention independently on each database. For Skyfire, EVERY
// one of source's 37 ids happened to also exist in sink — but 21 of those 37 id-matched pairs
// were two completely unrelated NPCs (e.g. id 91002 was "Guardian_of_Felia" in source and
// "a_mature_wyvern" in sink). CompareZones correctly calls a row like that "modified" (the id
// matched, the fields differ) — but semantically it's not a modified NPC at all, it's two
// different NPCs colliding on a number. The real practical effect: those NPCs' true same-name
// counterparts on the other side never show up in the 'new'/'removed' buckets at all (they got
// silently absorbed into a false id-match instead), so a reconciliation built on those buckets
// has nothing to reconcile against and can't fix this case.
//
// Counting names directly across the FULL population sidesteps the whole problem: it never looks
// at which id matched which, only "how many NPCs named X exist in source" vs "...in sink" —
// so a real content gap (sink has 5 `a_bottomless_devourer` scattered across ids, source has 1)
// shows up correctly as "+4" regardless of which specific ids happened to collide along the way.
//
// **Summary-only lens, on purpose.** The full diff table and Sync's own selection stay strictly
// id-matched, exactly as before — npc_types.id is still the real primary key Sync writes against,
// and a shared name is not a safe basis for deciding what gets synced, only for helping a human
// understand what they're looking at. Real name collisions (EQ trash mobs like "a bat" or "a fear
// creature," sharing one name across many genuinely distinct spawns) mean a name's counts can
// coincidentally line up even when the underlying NPCs differ — an accepted blind spot for a
// summary view, not something to silently paper over by guessing which specific bat is which.
export function npcNameGroupDiff(diffRows) {
    const countByName = (side) => {
        const counts = new Map()
        for (const row of diffRows) {
            const npc = row[side]
            if (!npc) continue
            const name = npc.Fields?.name || `NPC ${npc.Id}`
            counts.set(name, (counts.get(name) ?? 0) + 1)
        }
        return counts
    }
    const sourceCounts = countByName('Source')
    const sinkCounts = countByName('Sink')

    const onlyInSource = []
    const onlyInSink = []
    for (const name of new Set([...sourceCounts.keys(), ...sinkCounts.keys()])) {
        const sourceCount = sourceCounts.get(name) ?? 0
        const sinkCount = sinkCounts.get(name) ?? 0
        if (sourceCount > sinkCount) onlyInSource.push({name, sourceCount, sinkCount, delta: sourceCount - sinkCount})
        else if (sinkCount > sourceCount) onlyInSink.push({name, sourceCount, sinkCount, delta: sinkCount - sourceCount})
    }
    const sortByName = (a, b) => a.name.localeCompare(b.name)
    return {
        onlyInSource: onlyInSource.sort(sortByName),
        onlyInSink: onlyInSink.sort(sortByName)
    }
}

// True if either side's NPC.MissingReferences (npc_faction_id/npc_spells_id/merchant_id pointing
// at a row that doesn't exist in that same database — see app.go's annotateMissingReferences)
// has anything in it — drives the diff list's row-level flag, the same "subtle badge before you
// even open the detail view" treatment SpawnsTab gives SpawnGroupMissing/PathgridMissing.
export function npcRowHasMissingReferences(row) {
    return Object.keys(row.Source?.MissingReferences ?? {}).length > 0 ||
        Object.keys(row.Sink?.MissingReferences ?? {}).length > 0
}
