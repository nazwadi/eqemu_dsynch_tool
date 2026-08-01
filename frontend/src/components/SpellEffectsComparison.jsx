import {useState} from 'react';

// Content for the npc_spells_effects reference drawer — EQEmu's "NPC Spell Effects" system,
// structurally a near-exact clone of npc_spells/npc_spells_entries (own header row + a list of
// entries), so this mirrors SpellsComparison.jsx's shape closely. The one real difference:
// spell_effect_id is a fixed numeric spell-effect-attribute (SPA) constant hardcoded in the EQEmu
// server itself, not a row in any database table — there's no name to resolve the way SpellName
// does for npc_spells_entries' spellid, so entries show the raw id only rather than guessing at a
// hardcoded SPA-name table that could drift out of date. See CompareNPCSpellsEffects's own comment
// for why this was built ahead of any NPC actually using it.

// One spell-effect entry, collapsed by default, mirroring SpellEntryRow's shape minus the name.
function SpellEffectEntryRow({entry}) {
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
                    Spell Effect #{entry.SpellEffectID}
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

function SpellEffectsComparison({comparison, onAlign, onSyncContent}) {
    if (!comparison) {
        return <div className="text-xs text-gray-500">Loading…</div>
    }

    const sourceFields = comparison.SourceFields
    const sinkFields = comparison.SinkFields
    const entries = comparison.Entries ?? []

    const behaviorFields = Array.from(new Set([
        ...Object.keys(sourceFields ?? {}),
        ...Object.keys(sinkFields ?? {})
    ])).filter(f => f !== 'name' && f !== 'parent_list').sort()

    return (
        <>
            {comparison.SourceId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no spell effects list on source.</div>
            )}
            {comparison.SinkId === 0 && (
                <div className="text-xs text-amber-400">This NPC has no spell effects list on sink.</div>
            )}
            {/* npc_spells_effects_id is a local surrogate key (not portable) — same distinction
                SpellsComparison draws for npc_spells_id. */}
            {comparison.SourceId !== 0 && !sourceFields && (
                <div className="text-xs text-red-400">⚠ npc_spells_effects_id {comparison.SourceId} doesn't exist in source's npc_spells_effects table.</div>
            )}
            {comparison.SinkId !== 0 && !sinkFields && (
                <div className="text-xs text-red-400">⚠ npc_spells_effects_id {comparison.SinkId} doesn't exist in sink's npc_spells_effects table — likely copied verbatim from source by npc_types sync.</div>
            )}
            {(sourceFields || sinkFields) && (
                <div className="flex flex-col gap-1">
                    <div className="text-xs text-gray-400 uppercase tracking-wider">List Profile</div>
                    <div className="flex justify-between px-2 py-0.5 text-xs">
                        <span className="w-32 shrink-0 text-gray-500">npc_spells_effects_id</span>
                        <span className="flex-1 text-gray-500">{comparison.SourceId || '—'}</span>
                        <span className="px-1 text-gray-600">→</span>
                        <span className="flex-1 text-right text-gray-500">{comparison.SinkId || '—'}</span>
                    </div>
                    {comparison.SourceId !== 0 && comparison.SinkId !== 0 && comparison.SourceId !== comparison.SinkId && (
                        <div className="flex justify-end px-2">
                            <button onClick={() => onAlign(comparison.SourceId, comparison.SinkId)}
                                    className="px-2 py-1 rounded text-xs border border-cyan-700 text-cyan-400 hover:border-cyan-400 hover:text-cyan-300">
                                Align npc_spells_effects ID to source →
                            </button>
                        </div>
                    )}
                    {comparison.SourceId !== 0 && comparison.SinkId !== 0 && (
                        <div className="flex justify-end px-2">
                            <button onClick={() => onSyncContent(comparison.SourceId, comparison.SinkId)}
                                    className="px-2 py-1 rounded text-xs border border-amber-700 text-amber-400 hover:border-amber-400 hover:text-amber-300">
                                Sync content from source →
                            </button>
                        </div>
                    )}
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
                        <div className="flex flex-col gap-0.5">
                            {behaviorFields.map(field => {
                                const srcVal = sourceFields?.[field]
                                const sinkVal = sinkFields?.[field]
                                const differs = sourceFields != null && sinkFields != null && srcVal !== sinkVal
                                return (
                                    <div key={field} className="flex justify-between px-2 py-0.5 text-xs">
                                        <span className="w-32 shrink-0 text-gray-500">{field}</span>
                                        <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{srcVal ?? '—'}</span>
                                        <span className="px-1 text-gray-600">→</span>
                                        <span className={`text-right flex-1 ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>{sinkVal ?? '—'}</span>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}
            <div className="flex flex-col gap-1">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Spell Effect Entries{entries.length > 0 && ` (${entries.length})`}
                </div>
                {entries.length === 0 ? (
                    <div className="px-2 text-xs text-gray-600">No spell effect entries on either side.</div>
                ) : (
                    entries.map(entry => <SpellEffectEntryRow key={entry.SpellEffectID} entry={entry}/>)
                )}
            </div>
        </>
    )
}

export default SpellEffectsComparison
