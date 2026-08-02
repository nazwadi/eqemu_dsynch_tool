import {factionMatchesSearch, formatFactionEntry, sortFactions} from '../lib/factionHelpers';
import ExactMatchToggle from './ExactMatchToggle';

// Small "align to source" link — identical shape to LootTab's AlignTrigger (same two-step
// cross-column arming pattern, reused here since npc_faction has the same "no cross-database
// anchor" problem lootdrop does).
function AlignTrigger({armed, onClick}) {
    return (
        <button
            onClick={e => {
                e.stopPropagation()
                onClick()
            }}
            title={armed ? 'Cancel — click to un-arm' : 'Mark this npc_faction to align/sync it'}
            className={`text-xs ml-1 shrink-0 underline ${armed ? 'text-yellow-400' : 'text-cyan-400 hover:text-cyan-300'}`}>
            {armed ? '● armed' : 'align'}
        </button>
    )
}

function Disclosure({expanded}) {
    return (
        <span className={`w-4 shrink-0 text-center text-sm ${expanded ? 'text-yellow-400' : 'text-gray-400'}`}>
            {expanded ? '▾' : '▸'}
        </span>
    )
}

// One npc_faction row's expanded detail — plain one-sided content (fetched lazily, see
// useFactionsTab's detailById caches), not a diff: there's no "other side" to diff against at this
// level, source and sink rows are never paired automatically (see FactionsTab's own comment).
// Two sections: the faction's own entries (what it grants/costs), and — the direct answer to "I
// can see source has 7 Trakanon%-named factions and sink has 1, but I can't tell why" — which NPCs
// reference this row and which zones those NPCs actually spawn in, so a pile of similarly-named
// factions can be told apart by what's actually using them instead of guessed at from the name alone.
function FactionEntries({detail}) {
    if (detail === 'loading') {
        return <div className="text-xs text-gray-600 px-2 py-1">Loading…</div>
    }
    if (detail?.error) {
        return <div className="text-xs text-red-400 px-2 py-1">{detail.error}</div>
    }
    const entries = detail?.Entries ?? []
    const usedBy = detail?.UsedBy ?? []
    return (
        <div className="flex flex-col gap-2 py-1 pl-6">
            <div className="flex flex-col gap-0.5">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider">Entries</div>
                {entries.length === 0 ? (
                    <div className="text-xs text-gray-600 px-2">No faction entries.</div>
                ) : entries.map(entry => (
                    <div key={entry.FactionID} className="flex justify-between px-2 py-0.5 text-xs">
                        <span className="text-gray-400 truncate">
                            {entry.FactionName || 'Unknown Faction'} <span className="text-gray-600">({entry.FactionID})</span>
                        </span>
                        <span className="text-gray-400 shrink-0">{formatFactionEntry(entry)}</span>
                    </div>
                ))}
            </div>
            <div className="flex flex-col gap-0.5">
                <div className="text-[10px] text-gray-600 uppercase tracking-wider">
                    Used By{usedBy.length > 0 && ` (${usedBy.length} NPC${usedBy.length === 1 ? '' : 's'})`}
                </div>
                {usedBy.length === 0 ? (
                    <div className="text-xs text-gray-600 px-2">No NPCs reference this faction on this side.</div>
                ) : usedBy.map(u => (
                    <div key={u.NPCID} className="flex justify-between px-2 py-0.5 text-xs gap-2">
                        <span className="text-gray-400 truncate">
                            {u.NPCName || 'Unknown NPC'} <span className="text-gray-600">({u.NPCID})</span>
                        </span>
                        <span className="text-gray-500 shrink-0 text-right truncate max-w-[50%]"
                              title={u.Zones?.join(', ') || undefined}>
                            {u.Zones?.length > 0 ? u.Zones.join(', ') : 'no static spawn point'}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// NPC usage count is deliberately NOT shown here in the collapsed row — see ListNPCFactions' own
// comment for why: npc_types.npc_faction_id has no index, so a usage count for every row up front
// (~1,600 rows on the database this was found against) meant ~35 million scanned rows just to
// paint the list. The count is still available, just lazily — expand the row (FactionEntries'
// "Used By" section, driven by GetNPCFactionDetail) to see it, the same one-id-at-a-time query
// that was already fast because it's bounded to a single row.
function FactionRow({faction, expanded, onToggle, detail, armed, onArm, onCreateInSink}) {
    return (
        <div>
            <div className={`flex items-center gap-2 py-1 px-2 rounded cursor-pointer hover:bg-gray-700 ${armed ? 'bg-yellow-950' : 'bg-gray-850'}`}
                 onClick={onToggle}>
                <Disclosure expanded={expanded}/>
                <span className="text-xs text-gray-300 min-w-0 truncate flex-1">
                    {faction.Name || 'Unnamed'} <span className="text-gray-600">
                        ({faction.Id}) · {faction.EntryCount} entr{faction.EntryCount === 1 ? 'y' : 'ies'}
                    </span>
                </span>
                <AlignTrigger armed={armed} onClick={() => onArm(faction.Id, faction.Name)}/>
                {onCreateInSink && (
                    <button
                        onClick={e => {
                            e.stopPropagation()
                            onCreateInSink(faction.Id)
                        }}
                        title="Copy this npc_faction and its entries to the sink, at the same id if it's free"
                        className="text-xs ml-1 shrink-0 underline text-cyan-400 hover:text-cyan-300">
                        create in sink
                    </button>
                )}
            </div>
            {expanded && <FactionEntries detail={detail}/>}
        </div>
    )
}

// One side's full npc_faction list — independent of the other column, same restraint LootTab's
// own LootTableColumn already established for lootdrop trees. onCreateInSink is only ever passed
// for the Source column (see FactionsTab below) — mirrors LootTab's "source is the reference
// dataset" convention, no sink→source creation.
function FactionColumn({label, dbName, list, loaded, searchFilter, searchExact, sortBy, sortDir, expandedIds, detailById, onToggle, armedId, onArm, onCreateInSink}) {
    const visible = sortFactions(list.filter(f => factionMatchesSearch(f, searchFilter, searchExact)), sortBy, sortDir)
    return (
        <div className="flex-1 min-w-0 flex flex-col overflow-y-auto border-l border-gray-700 first:border-l-0">
            <div className="text-xs px-2 py-1 text-gray-400 uppercase tracking-wider border-b border-gray-700 bg-gray-800">
                {label}: {dbName} {loaded && <span className="text-gray-600">({visible.length} of {list.length})</span>}
            </div>
            <div className="flex flex-col gap-1 p-2">
                {!loaded ? (
                    <div className="text-xs text-gray-600">Loading…</div>
                ) : visible.length === 0 ? (
                    <div className="text-xs text-gray-600">No factions match.</div>
                ) : visible.map(faction => (
                    <FactionRow key={faction.Id} faction={faction}
                                expanded={expandedIds.has(faction.Id)}
                                onToggle={() => onToggle(faction.Id)}
                                detail={detailById[faction.Id]}
                                armed={armedId === faction.Id}
                                onArm={onArm}
                                onCreateInSink={onCreateInSink}/>
                ))}
            </div>
        </div>
    )
}

// Factions tab body — a database-wide, zone-independent browse/align view over npc_faction. Not
// nested under the zone sidebar flow at all (npc_faction has no zone column), unlike every other
// tab in this app. Source and sink render as two independent lists, never auto-paired — see
// useFactionsTab's own comment for why (npc_faction.id is a local surrogate, and even npc_types.id
// turned out not to be a reliable enough anchor to match through). The user recognizes a match by
// name and arms it manually, the same two-step cross-column click the Loot tab's lootdrop
// alignment already established.
function FactionsTab({
    sourceList, sinkList, loaded, loading, loadError,
    searchFilter, setSearchFilter, searchExact, setSearchExact,
    sortBy, setSortBy, sortDir, setSortDir,
    sourceDetailById, sinkDetailById,
    expandedSourceIds, expandedSinkIds, toggleExpand,
    armedSource, armedSink, armSource, armSink, clearArmed,
    refresh,
    dbSourceName, dbSinkName,
    onAlign, onSyncContent, onCreateInSink
}) {
    function confirmAlign() {
        onAlign(armedSource.id, armedSink.id)
        clearArmed()
    }

    function confirmSyncContent() {
        onSyncContent(armedSource.id, armedSink.id)
        clearArmed()
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-700">
                <input
                    className="w-64 text-xs border border-gray-600 bg-gray-700 rounded px-2 py-1"
                    placeholder="Filter factions by name or ID..."
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                <ExactMatchToggle checked={searchExact} onChange={setSearchExact}/>
                <div className="flex gap-1">
                    {[{label: 'Name', value: 'name'}, {label: 'ID', value: 'id'}].map(sort => (
                        <button
                            key={sort.value}
                            onClick={() => {
                                if (sortBy === sort.value) {
                                    setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
                                } else {
                                    setSortBy(sort.value)
                                    setSortDir('asc')
                                }
                            }}
                            className={`text-xs px-2 py-1 rounded border ${sortBy === sort.value ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                            {sort.label} {sortBy === sort.value ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                        </button>
                    ))}
                </div>
                <button
                    onClick={refresh}
                    disabled={loading}
                    title="Re-fetch both lists — useful after aligning/syncing elsewhere"
                    className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-300 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed">
                    ⟳ Refresh
                </button>
            </div>
            <div className="px-3 py-1 text-xs text-gray-500 border-b border-gray-700 bg-gray-850">
                Every <span className="text-gray-400">npc_faction</span> row on each side, independently — npc_faction.id isn't portable across databases, so the two columns are never auto-paired. Recognize a match by name, click <span className="text-cyan-400">align</span> on one row in each column, then align the id or sync its content.
            </div>
            {loadError && (
                <div className="px-3 py-2 text-xs text-red-400">{loadError}</div>
            )}
            {(armedSource || armedSink) && !(armedSource && armedSink) && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-gray-700 text-xs">
                    <span className="text-cyan-400">
                        {armedSource
                            ? <>Armed source npc_faction #{armedSource.id} ("{armedSource.name || 'Unnamed'}") — now click <span className="underline">align</span> on the matching row in the <span className="text-gray-300">Sink</span> column below.</>
                            : <>Armed sink npc_faction #{armedSink.id} ("{armedSink.name || 'Unnamed'}") — now click <span className="underline">align</span> on the matching row in the <span className="text-gray-300">Source</span> column below.</>}
                    </span>
                    <button onClick={clearArmed} className="text-gray-400 hover:text-white shrink-0 ml-2">Cancel</button>
                </div>
            )}
            {armedSource && armedSink && (
                <div className="flex items-center justify-between px-3 py-1.5 bg-yellow-950 border-b border-gray-700 text-xs">
                    <span className="text-yellow-400">
                        Sink's npc_faction #{armedSink.id} ("{armedSink.name || 'Unnamed'}") ↔ source's #{armedSource.id} ("{armedSource.name || 'Unnamed'}")
                    </span>
                    <div className="flex items-center gap-2 shrink-0 ml-2">
                        <button onClick={clearArmed} className="text-gray-400 hover:text-white">Cancel</button>
                        <button onClick={confirmSyncContent}
                                title="Overwrite sink's fields+entries with source's — id untouched"
                                className="px-2 py-1 rounded text-xs border border-amber-700 text-amber-400 hover:border-amber-400 hover:text-amber-300">
                            Sync content →
                        </button>
                        <button onClick={confirmAlign}
                                title="Renumber sink's id to match source's — content untouched"
                                className="px-2 py-1 rounded text-xs border border-yellow-600 text-yellow-400 font-medium hover:border-yellow-400 hover:text-yellow-300">
                            Align ID →
                        </button>
                    </div>
                </div>
            )}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                <FactionColumn label="Source" dbName={dbSourceName} list={sourceList} loaded={loaded}
                                searchFilter={searchFilter} searchExact={searchExact} sortBy={sortBy} sortDir={sortDir}
                                expandedIds={expandedSourceIds} detailById={sourceDetailById}
                                onToggle={id => toggleExpand(true, id)} armedId={armedSource?.id} onArm={armSource}
                                onCreateInSink={onCreateInSink}/>
                <FactionColumn label="Sink" dbName={dbSinkName} list={sinkList} loaded={loaded}
                                searchFilter={searchFilter} searchExact={searchExact} sortBy={sortBy} sortDir={sortDir}
                                expandedIds={expandedSinkIds} detailById={sinkDetailById}
                                onToggle={id => toggleExpand(false, id)} armedId={armedSink?.id} onArm={armSink}/>
            </div>
        </div>
    )
}

export default FactionsTab
