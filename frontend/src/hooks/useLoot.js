import {useEffect, useRef, useState} from 'react';
import {CompareNPCLoot, GetLootTable, LoadLootReviewMarks, SetLootReviewMark} from "../../wailsjs/go/main/App";
import {lootTableIdsForRow} from '../lib/lootHelpers';

// Loot tab state — read-only (phase 1) for the comparison itself, no bulk selection/diff-list like
// the other tabs. Fully self-contained: LootTab does its own NPC search off the diffRows prop it's
// already given (see App.jsx), so lookupLootByNpc only ever needs the row it's handed, not
// diffRows itself.
export function useLoot() {
    const [lootSearchFilter, setLootSearchFilter] = useState('')
    const [lootSearchExact, setLootSearchExact] = useState(false) // exact vs substring match, see lib/searchHelpers.js
    // 'status' | 'name' | 'id' — mirrors the NPCs tab's own Status/Name/ID sort control exactly
    // (same default, 'status') rather than Factions' Name/ID-only version: the NPC picker here is
    // the exact same diffRows the NPCs tab shows, so matching its default ordering means a row you
    // were just looking at on the NPCs tab lands in the same relative position here too, not a
    // reshuffled one — see LootTab's own comment on jumpToLoot/scroll-into-view for the rest of
    // that "find the same NPC" story.
    const [lootSortBy, setLootSortBy] = useState('status')
    const [lootSortDir, setLootSortDir] = useState('asc')
    const [lootRawSide, setLootRawSide] = useState('source')
    const [lootRawId, setLootRawId] = useState('')
    const [lootComparison, setLootComparison] = useState(null)
    const [lootLoading, setLootLoading] = useState(false)
    const [lootError, setLootError] = useState(null)
    // Which NPC (npc_types.id) is currently shown in the panes below, so the picker list can keep
    // that row highlighted — otherwise, once you'd scrolled the list or the comparison finished
    // loading, there was no way to tell which of the (possibly many, similarly-named) NPCs you'd
    // actually clicked. Only ever set from the picker itself (lookupLootByNpc); a raw loot table
    // ID lookup isn't picking a row from this list, so it clears the highlight rather than leaving
    // a stale/misleading one showing.
    const [selectedNpcId, setSelectedNpcId] = useState(null)
    // Describes whichever lookup last populated lootComparison — {type: 'npc', sourceId, sinkId}
    // or {type: 'raw', isSource, id} — so refreshLoot() can replay the exact same fetch without
    // needing to re-derive it from the NPC search UI or raw-ID form fields, either of which may
    // have moved on since (the raw ID inputs in particular aren't cleared after an NPC pick, so
    // they can't be trusted to reflect "what's currently shown").
    const [lastLookup, setLastLookup] = useState(null)
    // Guards against out-of-order responses clobbering a newer result with a stale one — real,
    // shipped bug (found 2026-07-25 via user report: syncing loottable content, then clicking
    // "create in sink" for several dangling entries in a row, left stale data showing that neither
    // the manual Refresh button nor another runLookup call could fix, only a full zone reset).
    // Each "create in sink" success already auto-triggers its own refreshLoot() call — clicking
    // through several dangling entries quickly means multiple overlapping CompareNPCLoot requests
    // can be in flight at once, and network/response timing gives no guarantee they resolve in the
    // order they were sent. An earlier request's response landing AFTER a later one would silently
    // overwrite the fresh data with stale data, and a manual Refresh click is just one more request
    // that can itself lose the same race. Fixed the standard way: only apply a response if it's
    // still the most recently issued request by the time it resolves; anything older is discarded.
    const requestIdRef = useRef(0)

    // Single fetch path both lookup modes (and refreshLoot) share, so there's exactly one place
    // that knows how to turn a lookup descriptor into a lootComparison — refreshing is just
    // replaying the same descriptor, not a parallel implementation that could drift from the
    // original lookup's behavior.
    function runLookup(lookup) {
        const requestId = ++requestIdRef.current
        setLootLoading(true)
        setLootError(null)
        const promise = lookup.type === 'npc'
            ? CompareNPCLoot(lookup.sourceId, lookup.sinkId)
            // The raw-ID fallback only ever targets one side (see lib/lootHelpers.js for why), so
            // its result is normalized into the same {SourceId, SinkId, SourceTable, SinkTable}
            // shape CompareNPCLoot returns, with the untouched side left at its zero value —
            // LootTab renders both lookup modes through the one path either way.
            : GetLootTable(lookup.isSource, lookup.id).then(table => ({
                SourceId: lookup.isSource ? lookup.id : 0,
                SinkId: lookup.isSource ? 0 : lookup.id,
                SourceTable: lookup.isSource ? table : null,
                SinkTable: lookup.isSource ? null : table
            }))
        promise
            .then(result => {
                if (requestId !== requestIdRef.current) return // a newer request has since started — discard this stale response
                setLootComparison(result)
            })
            .catch(err => {
                if (requestId !== requestIdRef.current) return
                setLootError(String(err))
            })
            .finally(() => {
                if (requestId === requestIdRef.current) setLootLoading(false)
            })
    }

    // Picking an NPC needs no extra Go round trip to find out which loottable_id to compare — both
    // sides' values are already sitting in the NPCs tab's diffRows (CompareZones already fetched
    // them as part of npc_types.*).
    function lookupLootByNpc(row) {
        const {sourceId, sinkId} = lootTableIdsForRow(row)
        const lookup = {type: 'npc', sourceId, sinkId}
        setLastLookup(lookup)
        setSelectedNpcId(row.Source?.Id ?? row.Sink?.Id ?? null)
        runLookup(lookup)
    }

    function lookupLootByRawId() {
        const id = Number(lootRawId)
        if (!id) return
        const lookup = {type: 'raw', isSource: lootRawSide === 'source', id}
        setLastLookup(lookup)
        setSelectedNpcId(null)
        runLookup(lookup)
    }

    // Re-fetches the currently-loaded NPC-anchored comparison using explicit ids, rather than
    // replaying the NPC row that led here — used after AlignId succeeds (see useAlignId.js). The
    // NPC diff row's own loottable_id came from the NPCs tab's diffRows, which AlignId doesn't
    // (and can't cheaply) refresh; a loottable-level align actually changes the sink's
    // npc_types.loottable_id in the database, so replaying the stale row would look up an id that
    // no longer exists. The caller always knows the correct post-align ids directly (source's own
    // id is never touched; sink's becomes source's id after a loottable align, or is unchanged
    // after a lootdrop-only align — see the two call sites in App.jsx), so this only ever needs a
    // plain two-id refetch, not the NPC-lookup path at all. Also updates lastLookup, so a manual
    // refresh click right after an align continues to refetch the correct post-align ids instead
    // of stale pre-align ones.
    function refreshWithIds(sourceId, sinkId) {
        const lookup = {type: 'npc', sourceId, sinkId}
        setLastLookup(lookup)
        runLookup(lookup)
    }

    // Manual "refresh" trigger — added directly next to the Item Diff summary work, since ID
    // alignment or a sync elsewhere can change the underlying data out from under an already-open
    // comparison with no other way to see the update short of re-searching for the same NPC/id.
    // A no-op before anything's ever been looked up (nothing to refresh yet).
    function refreshLoot() {
        if (lastLookup) runLookup(lastLookup)
    }

    // Zone switch has no diff to reload here (nothing's selected until an NPC/ID is looked up),
    // just stale state to clear — the previous lookup was for an NPC in the OLD zone.
    function resetForZoneChange() {
        setLootSearchFilter('')
        setLootRawId('')
        setLootComparison(null)
        setLootError(null)
        setLastLookup(null)
        setSelectedNpcId(null)
    }

    // "Mark complete" — the user's own review-tracking flag, independent of lootIdMatchStatus
    // (lib/lootHelpers.js): a mismatched or one-sided loot table might still be deliberately left
    // that way (reviewed and decided not to touch), and a matching id doesn't itself prove the
    // content was actually looked at — this is a plain manual "I'm done with this one" marker, not
    // derived from anything else. Persisted via LoadLootReviewMarks/SetLootReviewMark (lootreview.go)
    // the same way TODO's dismiss state is, so marks survive an app restart — working through a
    // zone's full NPC list realistically spans more than one sitting. Loaded once at mount (the
    // whole small archive, across every zone), same "load once, filter client-side per zone" shape
    // useTodo.js's todoItems already uses; App.jsx derives the current zone's marked set the same
    // way it already derives zoneTodoItems.
    const [lootReviewMarks, setLootReviewMarks] = useState([])

    function refreshLootReviewMarks() {
        LoadLootReviewMarks().then(marks => setLootReviewMarks(marks ?? [])).catch(err => console.error("load loot review marks failed:", err))
    }

    function toggleLootReviewed(zoneShortName, zoneVersion, npcId, reviewed) {
        SetLootReviewMark(zoneShortName, zoneVersion, npcId, reviewed)
            .then(refreshLootReviewMarks)
            .catch(err => console.error("toggle loot review mark failed:", err))
    }

    useEffect(() => {
        refreshLootReviewMarks()
    }, [])

    return {
        lootSearchFilter, setLootSearchFilter, lootSearchExact, setLootSearchExact,
        lootSortBy, setLootSortBy, lootSortDir, setLootSortDir,
        lootRawSide, setLootRawSide,
        lootRawId, setLootRawId,
        lootComparison, lootLoading, lootError,
        selectedNpcId,
        lootReviewMarks, toggleLootReviewed,
        lookupLootByNpc, lookupLootByRawId, refreshWithIds, refreshLoot,
        resetForZoneChange
    }
}
