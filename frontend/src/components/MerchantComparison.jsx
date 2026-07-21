import {useState} from 'react';

// Read-only content for the merchant_id reference drawer — the third reference type built. Simpler
// than FactionComparison/SpellsComparison in one respect: merchantlist has no separate header/
// parent row (npc_types.merchant_id points straight at merchantlist rows — the two tables spell it
// differently, npc_types.merchant_id vs merchantlist.merchantid), so there's no "profile"
// section here, just entries. Each entry has ~15 comparable fields (faction/level/status
// requirements, alt currency cost, probability, bucket conditions, etc.) — dense enough that
// entries collapse by default, the same shape SpellsComparison already uses for the same reason.
// Every item id is always shown next to its resolved name, never hidden behind it.

function MerchantEntryRow({entry}) {
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
                    {entry.ItemName || 'Unknown Item'} <span className="text-gray-600">({entry.ItemID})</span>
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

function MerchantComparison({comparison}) {
    if (!comparison) {
        return <div className="text-xs text-gray-500">Loading…</div>
    }

    const entries = comparison.Entries ?? []
    // merchantlist has no single header row the way npc_faction/npc_spells do (see the module
    // comment) — a merchant_id "exists" only in the sense of having at least one merchantlist row,
    // so that's what "dangling" means here: a nonzero id with zero rows on that side.
    const sourceHasEntries = entries.some(e => e.SourceExists)
    const sinkHasEntries = entries.some(e => e.SinkExists)

    return (
        <>
            {comparison.SourceId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no merchant list on source.</div>
            )}
            {comparison.SinkId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no merchant list on sink.</div>
            )}
            {comparison.SourceId !== 0 && !sourceHasEntries && (
                <div className="text-xs text-red-400">⚠ No merchant inventory found for merchant_id {comparison.SourceId} in source.</div>
            )}
            {comparison.SinkId !== 0 && !sinkHasEntries && (
                <div className="text-xs text-red-400">⚠ No merchant inventory found for merchant_id {comparison.SinkId} in sink — likely copied verbatim from source by npc_types sync.</div>
            )}
            <div className="flex justify-between px-2 py-0.5 text-xs">
                <span className="w-32 shrink-0 text-gray-500">merchant_id</span>
                <span className="flex-1 text-gray-500">{comparison.SourceId || '—'}</span>
                <span className="px-1 text-gray-600">→</span>
                <span className="flex-1 text-right text-gray-500">{comparison.SinkId || '—'}</span>
            </div>
            <div className="flex flex-col gap-1">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Merchant Entries{entries.length > 0 && ` (${entries.length})`}
                </div>
                {entries.length === 0 ? (
                    <div className="px-2 text-xs text-gray-600">No merchant entries on either side.</div>
                ) : (
                    entries.map(entry => <MerchantEntryRow key={entry.ItemID} entry={entry}/>)
                )}
            </div>
        </>
    )
}

export default MerchantComparison
