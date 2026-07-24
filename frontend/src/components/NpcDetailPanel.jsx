import {fieldGroups, referenceComparisonTypes, referenceNavigationTypes} from '../lib/npcHelpers';

// NPC branch of the shared detail panel — see DetailPanel.jsx for the dispatcher/chrome this
// plugs into. expandedSections is the parent's shared state object (NPC keys here never collide
// with the other tabs' own keys — see DetailPanel.jsx's comment for why that's kept as one object).
function NpcDetailPanel({selectedNpc, openReferenceComparison, onInspectLoot, expandedSections, setExpandedSections}) {
    return (
        <>
            {!selectedNpc && (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                    Select an NPC to view details
                </div>
            )}
            {selectedNpc && (selectedNpc.Source ?? selectedNpc.Sink)?.HasSpawnPoint === false && (
                <div className="text-purple-400 px-2 py-1 flex items-center gap-1">
                    <span>⚡</span> Quest-spawned — no static spawn point
                </div>
            )}
            {selectedNpc && Object.entries(fieldGroups).map(([section, fields]) => (
                <div key={section}>
                    <div
                        className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                        onClick={() => setExpandedSections(prev => ({
                            ...prev,
                            [section]: !prev[section]
                        }))}
                    >
                        <span
                            className="text-gray-400 uppercase tracking-wider text-xs">{section.replace('_', ' ')}</span>
                        <span
                            className="text-gray-600">{expandedSections[section] ? '▾' : '▸'}</span>
                    </div>
                    {expandedSections[section] && fields.map(field => {
                        const srcVal = selectedNpc.Source?.Fields?.[field]
                        const sinkVal = selectedNpc.Sink?.Fields?.[field]
                        const differs = srcVal !== sinkVal
                        // References fields with a working comparison (drawer, see
                        // lib/npcHelpers.js's referenceComparisonTypes) or a navigation target
                        // (loottable_id, see referenceNavigationTypes) become clickable once at
                        // least one side actually points at something — a reference that's 0 on
                        // both sides has nothing to compare, so it stays a plain row like any
                        // other field.
                        const isNavigation = field in referenceNavigationTypes
                        const comparable = section === 'references' &&
                            (referenceComparisonTypes[field] || isNavigation) && (srcVal || sinkVal)
                        // These FK columns are local surrogate IDs (see CLAUDE.md's
                        // identity trust model) copied verbatim by npc_types sync — a
                        // nonzero value that doesn't resolve in its OWN database is the
                        // same "dangling reference" situation as spawn2.spawngroupID,
                        // just surfaced per-field here instead of a top banner (this
                        // section can have up to three independently-dangling fields).
                        const srcMissing = section === 'references' && selectedNpc.Source?.MissingReferences?.[field]
                        const sinkMissing = section === 'references' && selectedNpc.Sink?.MissingReferences?.[field]
                        return (
                            <div key={field}
                                 className={`flex justify-between px-2 py-0.5 ${comparable ? 'cursor-pointer hover:bg-gray-700 rounded' : ''}`}
                                 onClick={!comparable ? undefined : isNavigation ? onInspectLoot : () => openReferenceComparison(referenceComparisonTypes[field], srcVal, sinkVal)}
                                 title={comparable ? (isNavigation ? 'View in Loot tab' : 'View source vs sink comparison') : undefined}>
                                <span className={`w-24 shrink-0 ${comparable ? 'text-cyan-400 underline decoration-dotted' : 'text-gray-500'}`}>{field}</span>
                                <span
                                    className={srcMissing ? 'text-red-400' : differs ? 'text-yellow-400' : 'text-gray-400'}
                                    title={srcMissing ? "Doesn't exist in source's own table" : undefined}>{srcVal ?? '—'}</span>
                                <span className="text-gray-600 px-1">→</span>
                                <span
                                    className={sinkMissing ? 'text-red-400' : differs ? 'text-yellow-400' : 'text-gray-400'}
                                    title={sinkMissing ? "Doesn't exist in sink's own table — likely copied verbatim by npc_types sync" : undefined}>{sinkVal ?? '—'}</span>
                            </div>
                        )
                    })}
                </div>
            ))}
        </>
    )
}

export default NpcDetailPanel
