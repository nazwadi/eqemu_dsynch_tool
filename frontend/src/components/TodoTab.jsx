// TODO tab body: zone-scoped, grouped by Type, with Gmail-style archive semantics
// (dismiss/restore, not delete — see CLAUDE.md's Sync Design section for the reasoning).
function TodoTab({selectedZoneShortName, zoneTodoItems, showDismissedTodos, setShowDismissedTodos, jumpToNpc, toggleTodoDismissed}) {
    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                    {showDismissedTodos ? 'Dismissed' : 'Open'} TODO items
                </span>
                <label className="ml-auto flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox"
                           className="accent-yellow-400 cursor-pointer w-3 h-3"
                           checked={showDismissedTodos}
                           onChange={e => setShowDismissedTodos(e.target.checked)}/>
                    Show dismissed ({zoneTodoItems.filter(t => t.Dismissed).length})
                </label>
            </div>
            <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
                {!selectedZoneShortName ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                        Select a zone to see its TODO items
                    </div>
                ) : zoneTodoItems.filter(t => t.Dismissed === showDismissedTodos).length === 0 ? (
                    <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                        {showDismissedTodos ? 'No dismissed items' : 'No open TODO items for this zone'}
                    </div>
                ) : (
                    Object.entries(
                        zoneTodoItems
                            .filter(t => t.Dismissed === showDismissedTodos)
                            .reduce((groups, item) => {
                                if (!groups[item.Type]) groups[item.Type] = []
                                groups[item.Type].push(item)
                                return groups
                            }, {})
                    ).map(([type, items]) => (
                        <div key={type} className="flex flex-col gap-1">
                            <div className="text-xs text-gray-400 uppercase tracking-wider">{type} ({items.length})</div>
                            {items.map(item => (
                                <div key={item.ID} className="flex items-center gap-2 text-xs px-2 py-1 bg-gray-800 rounded">
                                    <button onClick={() => jumpToNpc(item.NPCID)}
                                            className="text-gray-300 hover:text-yellow-400 cursor-pointer">
                                        {item.NPCName} ({item.NPCID})
                                    </button>
                                    <span className="text-gray-600">
                                        source {item.SourceID} → sink {item.SinkID || '—'}
                                    </span>
                                    <button
                                        onClick={() => toggleTodoDismissed(item)}
                                        className="ml-auto text-xs px-2 py-0.5 rounded border border-gray-600 text-gray-400 hover:border-gray-400 hover:text-white">
                                        {item.Dismissed ? 'Restore' : 'Dismiss'}
                                    </button>
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

export default TodoTab
