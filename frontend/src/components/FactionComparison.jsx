// Read-only content for the npc_faction reference drawer — the phase-1 prototype for what should
// eventually cover every shared-reference-table type buildTODOItems() already flags. Deliberately
// read-only: no sync action exists for any of these tables yet, so this is purely "see what you'd
// be walking into," the same visibility-before-action step the Spawn Points and Spawngroups tabs
// both went through before either gained a sync action.

// npc_value/temp are flag-shaped (0/1), not graduated values like `value` is, so they're folded
// into the cell as a compact suffix instead of two more full columns — keeps the entries table
// readable at this drawer's width while still surfacing every real difference.
function fmtEntry(exists, value, npcValue, temp) {
    if (!exists) return '—'
    const flags = [npcValue ? 'npc' : null, temp ? 'temp' : null].filter(Boolean)
    return flags.length > 0 ? `${value} (${flags.join(', ')})` : `${value}`
}

function FactionComparison({comparison}) {
    if (!comparison) {
        return <div className="text-xs text-gray-500">Loading…</div>
    }

    const sourceFields = comparison.SourceFields
    const sinkFields = comparison.SinkFields
    const entries = comparison.Entries ?? []

    return (
        <>
            {comparison.SourceId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no faction link on source.</div>
            )}
            {comparison.SinkId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no faction link on sink.</div>
            )}
            {(sourceFields || sinkFields) && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs text-gray-400 uppercase tracking-wider">Profile</div>
                    {/* name is a display label (same category as spawngroup.name), not diffed */}
                    <div className="flex justify-between px-2 py-0.5 text-xs">
                        <span className="w-32 shrink-0 text-gray-500">name</span>
                        <span className="flex-1 text-gray-400">{sourceFields?.name ?? '—'}</span>
                        <span className="px-1 text-gray-600">→</span>
                        <span className="flex-1 text-right text-gray-400">{sinkFields?.name ?? '—'}</span>
                    </div>
                    {['primaryfaction', 'ignore_primary_assist'].map(field => {
                        const srcVal = sourceFields?.[field]
                        const sinkVal = sinkFields?.[field]
                        const differs = sourceFields != null && sinkFields != null && srcVal !== sinkVal
                        return (
                            <div key={field} className="flex justify-between px-2 py-0.5 text-xs">
                                <span className="w-32 shrink-0 text-gray-500">{field}</span>
                                <span className={`flex-1 ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>{srcVal ?? '—'}</span>
                                <span className="px-1 text-gray-600">→</span>
                                <span className={`flex-1 text-right ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>{sinkVal ?? '—'}</span>
                            </div>
                        )
                    })}
                </div>
            )}
            <div className="flex flex-col gap-1">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Faction Entries{entries.length > 0 && ` (${entries.length})`}
                </div>
                {entries.length === 0 ? (
                    <div className="px-2 text-xs text-gray-600">No faction entries on either side.</div>
                ) : (
                    <>
                        <div className="flex px-2 text-xs text-gray-500">
                            <span className="flex-1">Faction</span>
                            <span className="w-28 text-right">Source</span>
                            <span className="w-28 text-right">Sink</span>
                        </div>
                        {entries.map(entry => (
                            <div key={entry.FactionID}
                                 className={`flex px-2 text-xs ${entry.Differs ? 'text-yellow-400' : 'text-gray-400'}`}>
                                <span className="flex-1">{entry.FactionName || `Faction ${entry.FactionID}`}</span>
                                <span className="w-28 text-right">{fmtEntry(entry.SourceExists, entry.SourceValue, entry.SourceNPCValue, entry.SourceTemp)}</span>
                                <span className="w-28 text-right">{fmtEntry(entry.SinkExists, entry.SinkValue, entry.SinkNPCValue, entry.SinkTemp)}</span>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </>
    )
}

export default FactionComparison
