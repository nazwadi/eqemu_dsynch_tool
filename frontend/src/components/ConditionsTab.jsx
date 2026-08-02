import {useState} from 'react';
import ConnectionNotice from './ConnectionNotice';

// Row background convention shared with every other diff list in the app.
function statusBg(status) {
    if (status === 'new') return 'bg-green-950'
    if (status === 'removed') return 'bg-red-950'
    if (status === 'modified') return 'bg-yellow-950'
    return 'bg-transparent'
}

// One spawn_events row, collapsed by default — mirrors MerchantComparison.jsx's MerchantEntryRow
// shape, but for a single side's own fields (events are never paired across databases, see
// ConditionsHelpDrawer.jsx), not a source/sink diff.
function SpawnEventRow({event}) {
    const [expanded, setExpanded] = useState(false)
    const fields = event.Fields ?? {}
    const fieldNames = Object.keys(fields).sort()
    return (
        <div>
            <div
                className="flex justify-between items-center py-1 px-2 rounded cursor-pointer hover:bg-gray-700 bg-gray-800"
                onClick={() => setExpanded(e => !e)}>
                <span className="text-xs text-gray-300">
                    {fields.name || 'Unnamed'} <span className="text-gray-600">({event.Id})</span>
                    {' — cond_id '}{fields.cond_id ?? '—'}, {fields.enabled ? 'enabled' : 'disabled'}
                </span>
                <span className="text-xs text-gray-600">{expanded ? '▾' : '▸'}</span>
            </div>
            {expanded && (
                <div className="flex flex-col gap-0.5 py-1">
                    {fieldNames.map(field => (
                        <div key={field} className="flex justify-between px-2 py-0.5 text-xs">
                            <span className="w-32 shrink-0 text-gray-500">{field}</span>
                            <span className="text-gray-300">{String(fields[field])}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}

// Conditions tab body — read-only visibility for spawn_conditions/spawn_condition_values/
// spawn_events (added 2026-07-25). No selection, no detail panel, no sync action anywhere in this
// tab: Spawn Conditions is the only one of the three with a real diff; Condition Values and Spawn
// Events are informational listings only — see ConditionsHelpDrawer.jsx / conditions.go for why.
function ConditionsTab({conditionsComparison, conditionsLoading, selectedZoneShortName, sourceStatus, sinkStatus, setShowConditionsHelp}) {
    const conditions = conditionsComparison?.Conditions ?? []
    const sourceValues = conditionsComparison?.SourceValues ?? []
    const sinkValues = conditionsComparison?.SinkValues ?? []
    const sourceEvents = conditionsComparison?.SourceEvents ?? []
    const sinkEvents = conditionsComparison?.SinkEvents ?? []

    if (sourceStatus !== 'connected' || sinkStatus !== 'connected') {
        return <ConnectionNotice sourceStatus={sourceStatus} sinkStatus={sinkStatus}/>
    }
    if (!selectedZoneShortName) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                Select a zone to view its conditions
            </div>
        )
    }
    if (conditionsLoading) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm">
                Loading conditions…
            </div>
        )
    }
    if (!conditionsComparison && selectedZoneShortName) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                No conditions data found in this zone
            </div>
        )
    }

    return (
        <div className="flex-1 flex flex-col overflow-y-auto">
            <div className="flex items-center justify-end px-3 py-2 border-b border-gray-700">
                <button
                    onClick={() => setShowConditionsHelp(true)}
                    title="Why Condition Values and Spawn Events aren't diffed the way Spawn Conditions is"
                    className="w-4 h-4 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 text-[10px] hover:border-gray-400 hover:text-white shrink-0">
                    ?
                </button>
            </div>

            {/* Spawn Conditions — real diff */}
            <div className="flex flex-col gap-1 px-3 py-2 border-b border-gray-700">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Spawn Conditions{conditions.length > 0 && ` (${conditions.length})`}
                </div>
                {conditions.length === 0 ? (
                    <div className="text-xs text-gray-600">No spawn conditions found in this zone.</div>
                ) : (
                    <>
                        <div className="flex text-xs text-gray-500 px-2">
                            <span className="w-12 shrink-0">ID</span>
                            <span className="flex-1">Name</span>
                            <span className="w-32 text-right shrink-0">Value</span>
                            <span className="w-32 text-right shrink-0">OnChange</span>
                        </div>
                        {conditions.map(row => {
                            const point = row.Source ?? row.Sink
                            return (
                                <div key={point.Id} className={`flex text-xs px-2 py-0.5 rounded ${statusBg(row.Status)}`}>
                                    <span className="w-12 shrink-0 text-gray-500">{point.Id}</span>
                                    <span className="flex-1 text-gray-300">
                                        {row.Source?.Fields?.name ?? row.Sink?.Fields?.name ?? '—'}
                                    </span>
                                    <span className="w-32 text-right shrink-0 text-gray-400">
                                        {row.Source?.Fields?.value ?? '—'} → {row.Sink?.Fields?.value ?? '—'}
                                    </span>
                                    <span className="w-32 text-right shrink-0 text-gray-400">
                                        {row.Source?.Fields?.onchange ?? '—'} → {row.Sink?.Fields?.onchange ?? '—'}
                                    </span>
                                </div>
                            )
                        })}
                    </>
                )}
            </div>

            {/* Condition Values — read-only, never diffed */}
            <div className="flex flex-col gap-1 px-3 py-2 border-b border-gray-700">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Condition Values</div>
                <div className="text-xs text-gray-500">
                    Live, per-instance runtime state — shown for visibility only, never diffed (see the "?" above).
                </div>
                <div className="flex gap-3">
                    <div className="flex-1 flex flex-col gap-0.5">
                        <div className="text-xs text-gray-500 uppercase tracking-wider">Source</div>
                        {sourceValues.length === 0 ? (
                            <div className="text-xs text-gray-600">None</div>
                        ) : sourceValues.map(v => (
                            <div key={`${v.Id}-${v.InstanceId}`} className="text-xs text-gray-300">
                                #{v.Id} <span className="text-gray-600">(instance {v.InstanceId})</span>: {v.Value}
                            </div>
                        ))}
                    </div>
                    <div className="flex-1 flex flex-col gap-0.5 border-l border-gray-700 pl-3">
                        <div className="text-xs text-gray-500 uppercase tracking-wider">Sink</div>
                        {sinkValues.length === 0 ? (
                            <div className="text-xs text-gray-600">None</div>
                        ) : sinkValues.map(v => (
                            <div key={`${v.Id}-${v.InstanceId}`} className="text-xs text-gray-300">
                                #{v.Id} <span className="text-gray-600">(instance {v.InstanceId})</span>: {v.Value}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Spawn Events — read-only, never paired */}
            <div className="flex flex-col gap-1 px-3 py-2">
                <div className="text-xs text-gray-400 uppercase tracking-wider">Spawn Events</div>
                <div className="flex gap-3">
                    <div className="flex-1 flex flex-col gap-0.5">
                        <div className="text-xs text-gray-500 uppercase tracking-wider">
                            Source{sourceEvents.length > 0 && ` (${sourceEvents.length})`}
                        </div>
                        {sourceEvents.length === 0 ? (
                            <div className="text-xs text-gray-600">None</div>
                        ) : sourceEvents.map(event => <SpawnEventRow key={event.Id} event={event}/>)}
                    </div>
                    <div className="flex-1 flex flex-col gap-0.5 border-l border-gray-700 pl-3">
                        <div className="text-xs text-gray-500 uppercase tracking-wider">
                            Sink{sinkEvents.length > 0 && ` (${sinkEvents.length})`}
                        </div>
                        {sinkEvents.length === 0 ? (
                            <div className="text-xs text-gray-600">None</div>
                        ) : sinkEvents.map(event => <SpawnEventRow key={event.Id} event={event}/>)}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default ConditionsTab
