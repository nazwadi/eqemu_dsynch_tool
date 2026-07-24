import {useEffect, useState} from 'react';
import {LoadTODOItems, SetTODOItemDismissed} from "../../wailsjs/go/main/App";
import {referenceComparisonTypes} from '../lib/npcHelpers';

// TODO tab state. Takes its cross-domain dependencies (diffRows/selectNpc from useNpcSync,
// setActiveView from App.jsx, openReferenceComparison from useReferenceDrawer) as parameters
// rather than closing over them implicitly — this hook is created AFTER those, so it can read
// their current values directly; the one call that goes the other direction (useNpcSync's
// executeSync wanting to call refreshTodoItems) is wired at call time instead, see useNpcSync.
export function useTodo({diffRows, setSelectedNpc, setSelectedRowKey, setActiveView, openReferenceComparison}) {
    const [todoItems, setTodoItems] = useState([])
    const [showDismissedTodos, setShowDismissedTodos] = useState(false)

    function refreshTodoItems() {
        LoadTODOItems().then(items => setTodoItems(items ?? [])).catch(err => console.error("load todo items failed:", err))
    }

    function toggleTodoDismissed(item) {
        SetTODOItemDismissed(item.ID, !item.Dismissed).then(refreshTodoItems).catch(err => console.error("toggle todo dismissed failed:", err))
    }

    function jumpToNpc(npcId) {
        setActiveView('npcs')
        const row = diffRows.find(r => (r.Source?.Id ?? r.Sink?.Id) === npcId)
        if (row) {
            setSelectedNpc(row)
            setSelectedRowKey(`${row.Source?.Id ?? ''}-${row.Sink?.Id ?? ''}`)
        }
    }

    // TODO items are zone-scoped already (see zoneTodoItems in App.jsx), so unlike jumpToNpc this
    // never needs to switch zones — just decide where clicking the item should actually take you.
    // referenceComparisonTypes' values are the only drawer types that exist yet (faction/spells/
    // merchant); TODOItem.Type uses the exact same strings by design (see buildTODOItems' fkFields
    // in app.go), so no translation is needed, just a membership check. loottable/alt_currency
    // items have no drawer built yet, so they still fall back to the older "just show me the NPC"
    // behavior rather than being dead clicks.
    function openTodoItem(item) {
        if (Object.values(referenceComparisonTypes).includes(item.Type)) {
            openReferenceComparison(item.Type, item.SourceID, item.SinkID)
        } else {
            jumpToNpc(item.NPCID)
        }
    }

    useEffect(() => {
        refreshTodoItems()
    }, [])

    return {
        todoItems, showDismissedTodos, setShowDismissedTodos,
        refreshTodoItems, toggleTodoDismissed, jumpToNpc, openTodoItem
    }
}
