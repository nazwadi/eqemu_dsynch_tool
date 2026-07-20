import {useState} from 'react';

// Read-only content for the npc_spells reference drawer — the second reference type built after
// npc_faction. Deliberately shaped differently from FactionComparison: npc_spells_entries has 16
// columns with no single "the important one" (unlike faction's clean value/npc_value/temp), so
// both the header's ~18 behavior fields and each entry's fields render as generic, collapsible
// field-diff lists — the same drift-tolerant shape spawn2's Behavior section already uses — rather
// than hardcoded columns. Every id (npc_spells_id, spellid) is always shown next to its resolved
// name, never hidden behind it — this tool is for devs cross-referencing raw SQL.

// One spell entry, collapsed by default (an NPC can have dozens) — the collapsed header alone
// shows enough to know whether it's worth opening: name, id, and a differs/one-sided indicator.
function SpellEntryRow({entry}) {
    const [expanded, setExpanded] = useState(false)
    const allFields = Array.from(new Set([
        ...Object.keys(entry.SourceFields ?? {}),
        ...Object.keys(entry.SinkFields ?? {})
    ])).sort()

    return (
        <div>
            <div
                className={`flex justify-between items-center py-1 px-2 rounded cursor-pointer hover:bg-gray-700 ${entry.Differs ? 'bg-yellow-950/40' : 'bg-gray-800'}`}
                onClick={() => setExpanded(e => !e)}>
                <span className={`text-xs ${entry.Differs ? 'text-yellow-400' : 'text-gray-300'}`}>
                    {entry.SpellName || 'Unknown Spell'} <span className="text-gray-600">({entry.SpellID})</span>
                    {!entry.SourceExists && <span className="ml-1 text-red-400">(sink only)</span>}
                    {!entry.SinkExists && <span className="ml-1 text-green-400">(source only)</span>}
                </span>
                <span className="text-xs text-gray-600">{expanded ? '▾' : '▸'}</span>
            </div>
            {expanded && (
                <div className="flex flex-col gap-0.5 py-1">
                    {allFields.map(field => {
                        const srcVal = entry.SourceFields?.[field]
                        const sinkVal = entry.SinkFields?.[field]
                        const differs = entry.SourceExists && entry.SinkExists && srcVal !== sinkVal
                        return (
                            <div key={field} className="flex justify-between px-2 py-0.5 text-xs">
                                <span className="w-40 shrink-0 text-gray-500">{field}</span>
                                <span className={`flex-1 ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>{srcVal ?? '—'}</span>
                                <span className="px-1 text-gray-600">→</span>
                                <span className={`flex-1 text-right ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>{sinkVal ?? '—'}</span>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// The list's own ~18 behavior fields (procs, engaged/pursue/idle casting chance & recast), also
// collapsed by default for the same reason — this is tuning data you check when something looks
// off, not something to scan top-to-bottom every time the drawer opens.
function SpellsHeaderFields({sourceFields, sinkFields, fields}) {
    const [expanded, setExpanded] = useState(false)
    const anyDiffers = sourceFields != null && sinkFields != null && fields.some(f => sourceFields[f] !== sinkFields[f])
    return (
        <div>
            <div className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                 onClick={() => setExpanded(e => !e)}>
                <span className="text-xs text-gray-400 uppercase tracking-wider">
                    Behavior Fields{anyDiffers ? ' ⚠' : ''}
                </span>
                <span className="text-xs text-gray-600">{expanded ? '▾' : '▸'}</span>
            </div>
            {expanded && fields.map(field => {
                const srcVal = sourceFields?.[field]
                const sinkVal = sinkFields?.[field]
                const differs = sourceFields != null && sinkFields != null && srcVal !== sinkVal
                return (
                    <div key={field} className="flex justify-between px-2 py-0.5 text-xs">
                        <span className="w-40 shrink-0 text-gray-500">{field}</span>
                        <span className={`flex-1 ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>{srcVal ?? '—'}</span>
                        <span className="px-1 text-gray-600">→</span>
                        <span className={`flex-1 text-right ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>{sinkVal ?? '—'}</span>
                    </div>
                )
            })}
        </div>
    )
}

function SpellsComparison({comparison}) {
    if (!comparison) {
        return <div className="text-xs text-gray-500">Loading…</div>
    }

    const sourceFields = comparison.SourceFields
    const sinkFields = comparison.SinkFields
    const entries = comparison.Entries ?? []

    // name (cosmetic label) and parent_list (a pointer to another list, not a behavior value —
    // see CompareNPCSpells for why it's shown but not walked) get their own fixed rows above the
    // generic behavior-field list, same treatment FactionComparison gives npc_faction.name.
    const behaviorFields = Array.from(new Set([
        ...Object.keys(sourceFields ?? {}),
        ...Object.keys(sinkFields ?? {})
    ])).filter(f => f !== 'name' && f !== 'parent_list').sort()

    return (
        <>
            {comparison.SourceId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no spell list on source.</div>
            )}
            {comparison.SinkId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no spell list on sink.</div>
            )}
            {(sourceFields || sinkFields) && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs text-gray-400 uppercase tracking-wider">List Profile</div>
                    <div className="flex justify-between px-2 py-0.5 text-xs">
                        <span className="w-32 shrink-0 text-gray-500">npc_spells_id</span>
                        <span className="flex-1 text-gray-500">{comparison.SourceId || '—'}</span>
                        <span className="px-1 text-gray-600">→</span>
                        <span className="flex-1 text-right text-gray-500">{comparison.SinkId || '—'}</span>
                    </div>
                    <div className="flex justify-between px-2 py-0.5 text-xs">
                        <span className="w-32 shrink-0 text-gray-500">name</span>
                        <span className="flex-1 text-gray-400">{sourceFields?.name ?? '—'}</span>
                        <span className="px-1 text-gray-600">→</span>
                        <span className="flex-1 text-right text-gray-400">{sinkFields?.name ?? '—'}</span>
                    </div>
                    <div className="flex justify-between px-2 py-0.5 text-xs">
                        <span className="w-32 shrink-0 text-gray-500">parent_list</span>
                        <span className="flex-1 text-gray-400">{sourceFields?.parent_list || '—'}</span>
                        <span className="px-1 text-gray-600">→</span>
                        <span className="flex-1 text-right text-gray-400">{sinkFields?.parent_list || '—'}</span>
                    </div>
                    {behaviorFields.length > 0 && (
                        <SpellsHeaderFields sourceFields={sourceFields} sinkFields={sinkFields} fields={behaviorFields}/>
                    )}
                </div>
            )}
            <div className="flex flex-col gap-1">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Spell Entries{entries.length > 0 && ` (${entries.length})`}
                </div>
                {entries.length === 0 ? (
                    <div className="px-2 text-xs text-gray-600">No spell entries on either side.</div>
                ) : (
                    entries.map(entry => <SpellEntryRow key={entry.SpellID} entry={entry}/>)
                )}
            </div>
        </>
    )
}

export default SpellsComparison
