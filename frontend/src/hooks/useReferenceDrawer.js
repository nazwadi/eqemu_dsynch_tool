import {useRef, useState} from 'react';
import {CompareNPCFaction, CompareNPCMerchant, CompareNPCSpells} from "../../wailsjs/go/main/App";

// Shared faction/spells/merchant reference-comparison drawer state — one open/close flag and one
// data slot reused across types (see ReferenceDrawer.jsx for the shared chrome this drives).
// Self-contained: no dependency on any other hook, which is what lets both NpcDetailPanel's
// References-row clicks and useTodo's openTodoItem() call into this independently.
export function useReferenceDrawer() {
    const [showReferenceDrawer, setShowReferenceDrawer] = useState(false)
    const [referenceDrawerType, setReferenceDrawerType] = useState(null) // 'faction' | 'spells' | 'merchant'
    const [referenceDrawerData, setReferenceDrawerData] = useState(null) // null while loading
    // Guards against an older request's response landing after a newer one and clobbering it with
    // stale data — same class of bug fixed in useLoot.js's runLookup (found 2026-07-25). Lower risk
    // here (no rapid multi-click workflow attached), but this hook is now also called from
    // refreshReferenceAfterAlign/refreshReferenceAfterSyncContent, both of which could plausibly
    // overlap a still-in-flight initial open, so the same one-line-ish fix is applied for the same
    // reason rather than waiting for its own separate bug report.
    const requestIdRef = useRef(0)

    // Single entry point for every reference-comparison drawer trigger, dispatched by type. Takes
    // a drawer type directly ('faction' | 'spells' | 'merchant' — the same strings
    // referenceComparisonTypes maps NPC field names to, and the same strings TODOItem.Type already
    // uses) rather than an NPC field name — the field→type lookup happens at each trigger's own
    // call site, since a TODO item never has an NPC field name to translate from.
    function openReferenceComparison(type, sourceVal, sinkVal) {
        setShowReferenceDrawer(true)
        setReferenceDrawerData(null)
        setReferenceDrawerType(type)
        const requestId = ++requestIdRef.current
        const applyResult = data => {
            if (requestId !== requestIdRef.current) return // a newer request has since started — discard this stale response
            setReferenceDrawerData(data)
        }
        if (type === 'faction') {
            CompareNPCFaction(sourceVal ?? 0, sinkVal ?? 0).then(applyResult)
        } else if (type === 'spells') {
            CompareNPCSpells(sourceVal ?? 0, sinkVal ?? 0).then(applyResult)
        } else if (type === 'merchant') {
            CompareNPCMerchant(sourceVal ?? 0, sinkVal ?? 0).then(applyResult)
        }
    }

    return {
        showReferenceDrawer, setShowReferenceDrawer,
        referenceDrawerType, referenceDrawerData,
        openReferenceComparison
    }
}
