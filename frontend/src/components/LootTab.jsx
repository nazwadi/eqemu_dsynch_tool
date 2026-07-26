import {useState} from 'react';
import {lootDropEntryFieldNames, lootItemSetDiff, lootNpcMatchesSearch, lootTableFieldNames} from '../lib/lootHelpers';

// Small "align to source" link — cyan like the app's other inline action links ("Select all N →",
// "Sync spawngroup from source →"), armed state shown as a filled dot so a mid-pairing click is
// visually obvious across both columns at once, not just within the row it was clicked in.
function AlignTrigger({armed, onClick, label}) {
    return (
        <button
            onClick={e => {
                e.stopPropagation()
                onClick()
            }}
            title={armed ? `Cancel — click to un-arm` : `Mark this ${label} to align its ID`}
            className={`text-xs ml-1 shrink-0 underline ${armed ? 'text-yellow-400' : 'text-cyan-400 hover:text-cyan-300'}`}>
            {armed ? '● armed' : 'align'}
        </button>
    )
}

// Shared disclosure-triangle button used by every collapsible row in this tab. Left-aligned in
// its own fixed-width slot, in reading order — the convention essentially every hierarchical UI
// uses (Finder, VS Code's file tree, GitHub's PR file list) puts the expand/collapse control
// first, not trailing after other text on the right where it's easy to miss. Brighter than the
// row text around it so it reads as a control, not punctuation.
function Disclosure({expanded}) {
    return (
        <span className={`w-4 shrink-0 text-center text-sm ${expanded ? 'text-yellow-400' : 'text-gray-400'}`}>
            {expanded ? '▾' : '▸'}
        </span>
    )
}

// Item-level source-vs-sink summary, above the two-column tree — answers "what would sink's NPC
// actually drop differently from source's," independent of how each side happens to organize its
// lootdrops (see lootItemSetDiff's own comment). Green/red match this app's existing new/removed
// color convention (green = source has it, sink doesn't, i.e. "missing from sink"; red = sink has
// it, source doesn't, i.e. "extra, not in source"). Collapsed by default when there IS a
// difference to review — expanded by default would be a lot of names dumped in your face before
// you've even looked at the tree below; the header's own counts already tell you whether it's
// worth opening. Each side's list is its own bordered, independently-scrollable box (not just a
// bare max-height div) — a real, reported bug: an unbordered overflow-y-auto with no visible
// boundary just silently clipped once a side had a lot of items, reading as "broken/too small"
// rather than "scroll for more," since nothing hinted more content existed below the fold.
// **Second bug, same feature:** the scrollable box was originally `flex flex-col` with the rows
// as its flex-item children — with 30+ rows, flex items' default `min-height: auto` let the
// browser shrink every row down to fit the box instead of actually scrolling, squashing all of
// them into overlapping, illegible text. Rows are deliberately plain block-level divs with
// `space-y-0.5` on the parent instead of `flex flex-col gap-0.5` — outside flex layout entirely,
// a block element can never be shrunk to fit like this, so overflow-y-auto's scrollbar is the
// only way to see content that doesn't fit, exactly as intended.
function ItemDiffSummary({sourceTable, sinkTable}) {
    const [expanded, setExpanded] = useState(false)
    const {onlyInSource, onlyInSink, sharedCount} = lootItemSetDiff(sourceTable, sinkTable)

    if (onlyInSource.length === 0 && onlyInSink.length === 0) {
        return (
            <div className="px-3 py-1.5 text-xs text-gray-500 border-b border-gray-700 bg-gray-850">
                Item diff: sink drops the same {sharedCount} item{sharedCount === 1 ? '' : 's'} as source, regardless of how they're organized into lootdrops.
            </div>
        )
    }

    return (
        <div className="border-b border-gray-700 bg-gray-850">
            <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-gray-800"
                 onClick={() => setExpanded(e => !e)}>
                <Disclosure expanded={expanded}/>
                <span className="text-xs text-gray-400 uppercase tracking-wider">Item Diff</span>
                <span className="text-xs text-gray-500">
                    {sharedCount} shared
                    {onlyInSource.length > 0 && <span className="text-green-400"> · {onlyInSource.length} missing from sink</span>}
                    {onlyInSink.length > 0 && <span className="text-red-400"> · {onlyInSink.length} extra in sink</span>}
                </span>
            </div>
            {expanded && (
                <div className="flex px-3 pb-3 gap-4 text-xs">
                    <div className="flex-1 min-w-0">
                        <div className="text-green-400 mb-1">Only in source — missing from sink ({onlyInSource.length})</div>
                        <div className="max-h-72 overflow-y-auto rounded border border-gray-700 bg-gray-900/40 p-2 space-y-0.5">
                            {onlyInSource.length === 0 ? <div className="text-gray-600">—</div> : onlyInSource.map(({itemId, itemName}) => (
                                <div key={itemId} className="text-gray-300 truncate">{itemName} <span className="text-gray-600">({itemId})</span></div>
                            ))}
                        </div>
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-red-400 mb-1">Only in sink — extra, not in source ({onlyInSink.length})</div>
                        <div className="max-h-72 overflow-y-auto rounded border border-gray-700 bg-gray-900/40 p-2 space-y-0.5">
                            {onlyInSink.length === 0 ? <div className="text-gray-600">—</div> : onlyInSink.map(({itemId, itemName}) => (
                                <div key={itemId} className="text-gray-300 truncate">{itemName} <span className="text-gray-600">({itemId})</span></div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// One item within an expanded lootdrop — collapsed by default, same shape as
// SpellEntryRow/MerchantEntryRow. Item id always shown next to its resolved name.
function LootDropEntryRow({entry}) {
    const [expanded, setExpanded] = useState(false)
    const fieldNames = lootDropEntryFieldNames(entry.Fields)
    return (
        <div>
            <div className="flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-gray-700 bg-gray-800"
                 onClick={() => setExpanded(e => !e)}>
                <Disclosure expanded={expanded}/>
                <span className="text-xs text-gray-300">
                    {entry.ItemName || 'Unknown Item'} <span className="text-gray-600">({entry.ItemID})</span>
                </span>
            </div>
            {expanded && (
                <div className="flex flex-col gap-0.5 py-1 pl-6">
                    {fieldNames.map(field => (
                        <div key={field} className="flex justify-between px-2 py-0.5 text-xs">
                            <span className="w-32 shrink-0 text-gray-500">{field}</span>
                            <span className="text-gray-400">{entry.Fields[field] ?? '—'}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// One loottable_entries row: this loottable's own weighting for one lootdrop, expandable to that
// lootdrop's full item list. entry.Drop is nil when lootdrop_id doesn't resolve to a real
// lootdrop row on this side — shown as a plain red flag rather than hidden, same "don't silently
// drop a dangling reference" treatment as SpawnPoint.SpawnGroupMissing. Expand state is
// controlled by the parent column (not local), so "Expand All"/"Collapse All" can drive every row
// at once. onCreateInSink (source column only, see LootTab's own comment) is a single click, no
// arming needed — unlike align, there's no sink row to pick, so the only input is this row's own
// LootDropId.
function LootTableEntryRow({entry, expanded, onToggle, armed, onArm, onCreateInSink}) {
    const drop = entry.Drop
    const itemCount = drop?.Entries?.length ?? 0
    const sharedCount = drop?.SharedCount ?? 0
    return (
        <div>
            <div className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-gray-700 ${armed ? 'bg-yellow-950' : 'bg-gray-850'}`}
                 onClick={onToggle}>
                <Disclosure expanded={expanded}/>
                <span className="text-xs text-gray-300 min-w-0 truncate flex-1">
                    {drop ? (drop.Fields?.name || 'Unnamed drop') : <span className="text-red-400">missing lootdrop</span>}
                    {' '}<span className="text-gray-600">(lootdrop {entry.LootDropId}) · {itemCount} item{itemCount === 1 ? '' : 's'}</span>
                    {sharedCount > 0 && (
                        <span className="text-cyan-400 ml-1"
                              title={`Also referenced by ${sharedCount} other loottable${sharedCount === 1 ? '' : 's'} in this database`}>
                            shared ×{sharedCount + 1}
                        </span>
                    )}
                </span>
                {drop && onArm && <AlignTrigger armed={armed} onClick={() => onArm(entry.LootDropId, drop.Fields?.name)} label="lootdrop"/>}
                {drop && onCreateInSink && (
                    <button
                        onClick={e => {
                            e.stopPropagation()
                            onCreateInSink(entry.LootDropId)
                        }}
                        title="Copy this lootdrop and its items to the sink, at the same id if it's free"
                        className="text-xs ml-1 shrink-0 underline text-cyan-400 hover:text-cyan-300">
                        create in sink
                    </button>
                )}
                <span className="text-xs text-gray-500 shrink-0">
                    {entry.Fields?.probability}% · ×{entry.Fields?.multiplier ?? 1}
                </span>
            </div>
            {expanded && (
                <div className="flex flex-col gap-0.5 py-1 pl-6">
                    {itemCount > 0 ? (
                        drop.Entries.map(e => <LootDropEntryRow key={e.ItemID} entry={e}/>)
                    ) : (
                        <div className="text-xs text-gray-600 px-2">No items in this lootdrop.</div>
                    )}
                </div>
            )}
        </div>
    )
}

// One side's full loot tree. Deliberately doesn't try to line up its entries against the other
// column's — see NPCLootComparison in app.go for why: lootdrop.id has no anchor to match across
// databases the way spawn2 coordinates give spawngroup, so this renders exactly what's on this
// side, independent of the other column, rather than claiming a correspondence it can't verify.
function LootTableColumn({label, dbName, table, lookedUp, armedDropId, onArmDrop, onCreateInSink}) {
    const [expandedDrops, setExpandedDrops] = useState(new Set())
    const allDropIds = table?.Entries?.map(e => e.LootDropId) ?? []
    const allExpanded = allDropIds.length > 0 && allDropIds.every(id => expandedDrops.has(id))

    function toggleDrop(id) {
        setExpandedDrops(prev => {
            const next = new Set(prev)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            return next
        })
    }

    return (
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto border-l border-gray-700 first:border-l-0">
            <div className="text-xs px-2 py-1 text-gray-400 uppercase tracking-wider border-b border-gray-700 bg-gray-800">
                {label}: {dbName}
            </div>
            <div className="flex flex-col gap-1 p-2">
                {!lookedUp ? (
                    <div className="text-xs text-gray-600">Select an NPC or look up a loot table ID.</div>
                ) : !table ? (
                    <div className="text-xs text-amber-400">No loot table on this side.</div>
                ) : (
                    <>
                        <div className="text-sm text-gray-200">
                            "{table.Fields?.name || 'Unnamed'}" <span className="text-gray-600 text-xs">(loottable {table.Id})</span>
                        </div>
                        {lootTableFieldNames(table.Fields).filter(f => f !== 'name').map(field => (
                            <div key={field} className="flex justify-between px-2 py-0.5 text-xs">
                                <span className="w-32 shrink-0 text-gray-500">{field}</span>
                                <span className="text-gray-400">{table.Fields[field] ?? '—'}</span>
                            </div>
                        ))}
                        <div className="flex items-center justify-between mt-1">
                            <span className="text-xs text-gray-400 uppercase tracking-wider">
                                Lootdrops{table.Entries?.length > 0 && ` (${table.Entries.length})`}
                            </span>
                            {allDropIds.length > 0 && (
                                <button
                                    onClick={() => setExpandedDrops(allExpanded ? new Set() : new Set(allDropIds))}
                                    className="text-xs text-cyan-400 hover:text-cyan-300 underline">
                                    {allExpanded ? 'Collapse All' : 'Expand All'}
                                </button>
                            )}
                        </div>
                        {table.Entries?.length > 0 ? (
                            table.Entries.map(entry => (
                                <LootTableEntryRow key={entry.LootDropId} entry={entry}
                                                    expanded={expandedDrops.has(entry.LootDropId)}
                                                    onToggle={() => toggleDrop(entry.LootDropId)}
                                                    armed={armedDropId === entry.LootDropId}
                                                    onArm={onArmDrop}
                                                    onCreateInSink={onCreateInSink}/>
                            ))
                        ) : (
                            <div className="text-xs text-gray-600 px-2">No lootdrops in this table.</div>
                        )}
                    </>
                )}
            </div>
        </div>
    )
}

// Loot tab body: an NPC search (reusing the NPCs tab's already-loaded diffRows — picking an NPC
// needs no extra Go call, both sides' loottable_id are already sitting in that data) plus a raw
// loot table ID fallback for when you already know the number and just want to look at it
// (necessarily one-sided — see lib/lootHelpers.js and NPCLootComparison for why a raw id only
// means something on the database it came from). Read-only: no sync action exists yet, this is
// phase 1 (visibility) of the shared-reference-table roadmap, same as it was for faction/spells/
// merchant before any of them got here.
function LootTab({
    diffRows,
    lootSearchFilter, setLootSearchFilter,
    lootRawSide, setLootRawSide, lootRawId, setLootRawId,
    lootComparison, lootLoading, lootError,
    onSelectNpc, onLookupRawId, onRefresh,
    dbSourceName, dbSinkName, selectedZoneShortName,
    onAlignLoottable, onAlignLootdrop, onCreateLootDrop, onSyncLoottableContent,
    setShowLootHelp
}) {
    // Always browsable, not just once you start typing — a dev reviewing a zone they don't have
    // memorized shouldn't have to already know an NPC's name to find it. The search box narrows
    // the list; an empty box just shows everything, sorted, the same "full list + optional
    // filter" shape the NPCs tab and the zone sidebar already use.
    const npcOptions = diffRows
        .filter(row => lootNpcMatchesSearch(row, lootSearchFilter))
        .sort((a, b) => (a.Source?.Fields?.name ?? a.Sink?.Fields?.name ?? '')
            .localeCompare(b.Source?.Fields?.name ?? b.Sink?.Fields?.name ?? ''))

    // Lootdrop-level alignment pairing — unlike the loottable itself (anchored via the NPC, so
    // both ids are already known), lootdrop.id has no cross-database anchor (see LootTableColumn's
    // comment), so the user has to identify the pairing by hand: click the source row, then the
    // matching sink row. Cleared after a successful align or by clicking either armed row again.
    const [armedSourceDrop, setArmedSourceDrop] = useState(null) // {id, name} | null
    const [armedSinkDrop, setArmedSinkDrop] = useState(null)

    function armSourceDrop(id, name) {
        setArmedSourceDrop(prev => prev?.id === id ? null : {id, name})
    }
    function armSinkDrop(id, name) {
        setArmedSinkDrop(prev => prev?.id === id ? null : {id, name})
    }
    function confirmDropAlign() {
        onAlignLootdrop(armedSourceDrop.id, armedSinkDrop.id)
        setArmedSourceDrop(null)
        setArmedSinkDrop(null)
    }

    const loottableAlignable = lootComparison?.SourceId > 0 && lootComparison?.SinkId > 0 && lootComparison.SourceId !== lootComparison.SinkId
    // Content sync doesn't need the ids to differ the way alignment does — sink's loottable content
    // can differ from source's regardless of whether the two ids happen to match numerically.
    const loottableSyncable = lootComparison?.SourceId > 0 && lootComparison?.SinkId > 0

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                <input
                    className="w-64 text-xs border border-gray-600 bg-gray-700 rounded px-2 py-1"
                    placeholder="Search NPC by name or ID..."
                    value={lootSearchFilter}
                    onChange={e => setLootSearchFilter(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                <div className="w-px h-4 bg-gray-700"/>
                <span className="text-xs text-gray-500">or loot table ID:</span>
                <select
                    className="text-xs border border-gray-600 bg-gray-700 rounded px-1 py-1"
                    value={lootRawSide}
                    onChange={e => setLootRawSide(e.target.value)}>
                    <option value="source">Source</option>
                    <option value="sink">Sink</option>
                </select>
                <input
                    type="number"
                    className="w-24 text-xs border border-gray-600 bg-gray-700 rounded px-2 py-1"
                    placeholder="ID"
                    value={lootRawId}
                    onChange={e => setLootRawId(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && onLookupRawId()}/>
                <button
                    onClick={onLookupRawId}
                    disabled={!lootRawId}
                    className="text-xs px-3 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
                    Look Up
                </button>
                {lootComparison && (
                    <button
                        onClick={onRefresh}
                        disabled={lootLoading}
                        title="Re-fetch this comparison — useful after an ID alignment or a sync elsewhere that may have changed the underlying data"
                        className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
                        ⟳ Refresh
                    </button>
                )}
                <button
                    onClick={() => setShowLootHelp(true)}
                    title="Why the two columns aren't paired, and how ID alignment works"
                    className="ml-auto w-4 h-4 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 text-[10px] hover:border-gray-400 hover:text-white shrink-0">
                    ?
                </button>
            </div>
            {diffRows.length > 0 && (
                <div className="flex flex-col border-b border-gray-700">
                    <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-800">
                        {npcOptions.length} of {diffRows.length} NPCs — click one to view its loot
                    </div>
                    <div className="flex flex-col max-h-56 overflow-y-auto">
                        {npcOptions.length === 0 ? (
                            <div className="px-3 py-2 text-xs text-gray-600">No NPCs match "{lootSearchFilter}"</div>
                        ) : npcOptions.map(row => {
                            const npcId = row.Source?.Id ?? row.Sink?.Id
                            const name = row.Source?.Fields?.name ?? row.Sink?.Fields?.name
                            return (
                                <div key={npcId}
                                     className="flex items-center gap-2 px-3 py-1 text-xs text-gray-300 hover:bg-gray-800 cursor-pointer"
                                     onClick={() => onSelectNpc(row)}>
                                    {name} <span className="text-gray-600">({npcId})</span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            )}
            {lootError && (
                <div className="px-3 py-2 text-xs text-red-400">{lootError}</div>
            )}
            {loottableAlignable && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs">
                    <span className="text-gray-400">
                        Sink's loottable is #{lootComparison.SinkId}, source's is #{lootComparison.SourceId} — same NPC, different id.
                    </span>
                    <button
                        onClick={() => onAlignLoottable(lootComparison.SourceId, lootComparison.SinkId)}
                        className="px-2 py-1 rounded text-xs border border-cyan-700 text-cyan-400 hover:border-cyan-400 hover:text-cyan-300 shrink-0 ml-2">
                        Align loottable ID to source →
                    </button>
                </div>
            )}
            {loottableSyncable && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs">
                    <span className="text-gray-400">
                        Overwrite sink's loottable #{lootComparison.SinkId} fields + entries with source's — lootdrop content itself isn't touched (align/create those separately first).
                    </span>
                    <button
                        onClick={() => onSyncLoottableContent(lootComparison.SourceId, lootComparison.SinkId)}
                        className="px-2 py-1 rounded text-xs border border-amber-700 text-amber-400 hover:border-amber-400 hover:text-amber-300 shrink-0 ml-2">
                        Sync content from source →
                    </button>
                </div>
            )}
            {(armedSourceDrop || armedSinkDrop) && !(armedSourceDrop && armedSinkDrop) && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs">
                    <span className="text-cyan-400">
                        {armedSourceDrop
                            ? <>Armed source lootdrop #{armedSourceDrop.id} ("{armedSourceDrop.name || 'Unnamed'}") — now click <span className="underline">align</span> on the matching drop in the <span className="text-gray-300">Sink</span> column below.</>
                            : <>Armed sink lootdrop #{armedSinkDrop.id} ("{armedSinkDrop.name || 'Unnamed'}") — now click <span className="underline">align</span> on the matching drop in the <span className="text-gray-300">Source</span> column below.</>}
                    </span>
                    <button onClick={() => { setArmedSourceDrop(null); setArmedSinkDrop(null) }}
                            className="text-gray-400 hover:text-white shrink-0 ml-2">Cancel</button>
                </div>
            )}
            {armedSourceDrop && armedSinkDrop && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-yellow-950 border-b border-gray-700 text-xs">
                    <span className="text-yellow-400">
                        Align sink's lootdrop #{armedSinkDrop.id} ("{armedSinkDrop.name || 'Unnamed'}") → #{armedSourceDrop.id} ("{armedSourceDrop.name || 'Unnamed'}")?
                    </span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button onClick={() => { setArmedSourceDrop(null); setArmedSinkDrop(null) }}
                                className="text-gray-400 hover:text-white">Cancel</button>
                        <button onClick={confirmDropAlign}
                                className="px-2 py-1 rounded text-xs border border-yellow-600 text-yellow-400 font-medium hover:border-yellow-400 hover:text-yellow-300">Align →</button>
                    </div>
                </div>
            )}
            {!selectedZoneShortName ? (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                    Select a zone to search its NPCs
                </div>
            ) : lootLoading ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                    Loading loot table…
                </div>
            ) : (
                <>
                    {lootComparison && (lootComparison.SourceTable || lootComparison.SinkTable) && (
                        <ItemDiffSummary sourceTable={lootComparison.SourceTable} sinkTable={lootComparison.SinkTable}/>
                    )}
                    <div className="flex flex-1 min-h-0 overflow-hidden">
                        <LootTableColumn label="Source" dbName={dbSourceName} table={lootComparison?.SourceTable} lookedUp={!!lootComparison}
                                          armedDropId={armedSourceDrop?.id} onArmDrop={armSourceDrop} onCreateInSink={onCreateLootDrop}/>
                        <LootTableColumn label="Sink" dbName={dbSinkName} table={lootComparison?.SinkTable} lookedUp={!!lootComparison}
                                          armedDropId={armedSinkDrop?.id} onArmDrop={armSinkDrop}/>
                    </div>
                </>
            )}
        </div>
    )
}

export default LootTab
