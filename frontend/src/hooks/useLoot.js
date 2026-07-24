import {useState} from 'react';
import {CompareNPCLoot, GetLootTable} from "../../wailsjs/go/main/App";
import {lootTableIdsForRow} from '../lib/lootHelpers';

// Loot tab state — read-only (phase 1), no bulk selection/diff-list like the other tabs. Fully
// self-contained: LootTab does its own NPC search off the diffRows prop it's already given (see
// App.jsx), so lookupLootByNpc only ever needs the row it's handed, not diffRows itself.
export function useLoot() {
    const [lootSearchFilter, setLootSearchFilter] = useState('')
    const [lootRawSide, setLootRawSide] = useState('source')
    const [lootRawId, setLootRawId] = useState('')
    const [lootComparison, setLootComparison] = useState(null)
    const [lootLoading, setLootLoading] = useState(false)
    const [lootError, setLootError] = useState(null)

    // Picking an NPC needs no extra Go round trip to find out which loottable_id to compare — both
    // sides' values are already sitting in the NPCs tab's diffRows (CompareZones already fetched
    // them as part of npc_types.*). CompareNPCLoot's own result shape already matches what LootTab
    // expects, so it's used as-is.
    function lookupLootByNpc(row) {
        setLootLoading(true)
        setLootError(null)
        const {sourceId, sinkId} = lootTableIdsForRow(row)
        CompareNPCLoot(sourceId, sinkId)
            .then(setLootComparison)
            .catch(err => setLootError(String(err)))
            .finally(() => setLootLoading(false))
    }

    // The raw-ID fallback only ever targets one side (see lib/lootHelpers.js for why), so its
    // result is normalized into the same {SourceId, SinkId, SourceTable, SinkTable} shape
    // CompareNPCLoot returns, with the untouched side left at its zero value — LootTab renders both
    // lookup modes through the one path either way.
    function lookupLootByRawId() {
        const id = Number(lootRawId)
        if (!id) return
        const isSource = lootRawSide === 'source'
        setLootLoading(true)
        setLootError(null)
        GetLootTable(isSource, id)
            .then(table => setLootComparison({
                SourceId: isSource ? id : 0,
                SinkId: isSource ? 0 : id,
                SourceTable: isSource ? table : null,
                SinkTable: isSource ? null : table
            }))
            .catch(err => setLootError(String(err)))
            .finally(() => setLootLoading(false))
    }

    // Re-fetches the currently-loaded NPC-anchored comparison using explicit ids, rather than
    // replaying the NPC row that led here — used after AlignId succeeds (see useAlignId.js). The
    // NPC diff row's own loottable_id came from the NPCs tab's diffRows, which AlignId doesn't
    // (and can't cheaply) refresh; a loottable-level align actually changes the sink's
    // npc_types.loottable_id in the database, so replaying the stale row would look up an id that
    // no longer exists. The caller always knows the correct post-align ids directly (source's own
    // id is never touched; sink's becomes source's id after a loottable align, or is unchanged
    // after a lootdrop-only align — see the two call sites in App.jsx), so this only ever needs a
    // plain two-id refetch, not the NPC-lookup path at all.
    function refreshWithIds(sourceId, sinkId) {
        setLootLoading(true)
        setLootError(null)
        CompareNPCLoot(sourceId, sinkId)
            .then(setLootComparison)
            .catch(err => setLootError(String(err)))
            .finally(() => setLootLoading(false))
    }

    // Zone switch has no diff to reload here (nothing's selected until an NPC/ID is looked up),
    // just stale state to clear — the previous lookup was for an NPC in the OLD zone.
    function resetForZoneChange() {
        setLootSearchFilter('')
        setLootRawId('')
        setLootComparison(null)
        setLootError(null)
    }

    return {
        lootSearchFilter, setLootSearchFilter,
        lootRawSide, setLootRawSide,
        lootRawId, setLootRawId,
        lootComparison, lootLoading, lootError,
        lookupLootByNpc, lookupLootByRawId, refreshWithIds,
        resetForZoneChange
    }
}
