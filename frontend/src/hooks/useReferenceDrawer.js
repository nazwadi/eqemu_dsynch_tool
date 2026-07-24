import {useState} from 'react';
import {CompareNPCFaction, CompareNPCMerchant, CompareNPCSpells} from "../../wailsjs/go/main/App";

// Shared faction/spells/merchant reference-comparison drawer state — one open/close flag and one
// data slot reused across types (see ReferenceDrawer.jsx for the shared chrome this drives).
// Self-contained: no dependency on any other hook, which is what lets both NpcDetailPanel's
// References-row clicks and useTodo's openTodoItem() call into this independently.
export function useReferenceDrawer() {
    const [showReferenceDrawer, setShowReferenceDrawer] = useState(false)
    const [referenceDrawerType, setReferenceDrawerType] = useState(null) // 'faction' | 'spells' | 'merchant'
    const [referenceDrawerData, setReferenceDrawerData] = useState(null) // null while loading

    // Single entry point for every reference-comparison drawer trigger, dispatched by type. Takes
    // a drawer type directly ('faction' | 'spells' | 'merchant' — the same strings
    // referenceComparisonTypes maps NPC field names to, and the same strings TODOItem.Type already
    // uses) rather than an NPC field name — the field→type lookup happens at each trigger's own
    // call site, since a TODO item never has an NPC field name to translate from.
    function openReferenceComparison(type, sourceVal, sinkVal) {
        setShowReferenceDrawer(true)
        setReferenceDrawerData(null)
        setReferenceDrawerType(type)
        if (type === 'faction') {
            CompareNPCFaction(sourceVal ?? 0, sinkVal ?? 0).then(setReferenceDrawerData)
        } else if (type === 'spells') {
            CompareNPCSpells(sourceVal ?? 0, sinkVal ?? 0).then(setReferenceDrawerData)
        } else if (type === 'merchant') {
            CompareNPCMerchant(sourceVal ?? 0, sinkVal ?? 0).then(setReferenceDrawerData)
        }
    }

    return {
        showReferenceDrawer, setShowReferenceDrawer,
        referenceDrawerType, referenceDrawerData,
        openReferenceComparison
    }
}
