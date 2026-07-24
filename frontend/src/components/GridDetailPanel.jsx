import {useEffect, useRef} from 'react';
import {fmtCoord} from '../lib/spawnHelpers';
import {gridEntryRows, waypointFieldDiffs} from '../lib/gridHelpers';

// Grids branch of the shared detail panel — see DetailPanel.jsx for the dispatcher/chrome this
// plugs into. selectedWaypointNumber/onSelectWaypoint (added 2026-07-24) cross-link this table
// with ZoneMapView's waypoint markers — lifted into useGridSync so both components can read AND
// write the same selection, see that hook's own comment.
function GridDetailPanel({selectedGridRow, selectedWaypointNumber, onSelectWaypoint, expandedSections, setExpandedSections}) {
    // Callback-ref map (waypoint number -> row element) rather than one ref per row, since the
    // row count is dynamic (a grid's waypoint count, not a fixed list) — the same reason a plain
    // array of refs wouldn't work here without knowing the count up front.
    const rowRefs = useRef(new Map())
    useEffect(() => {
        if (selectedWaypointNumber == null) return
        rowRefs.current.get(selectedWaypointNumber)?.scrollIntoView({block: 'nearest'})
    }, [selectedWaypointNumber])

    return (
        <>
            {!selectedGridRow && (
                <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                    Select a grid to view details
                </div>
            )}
            {selectedGridRow && (() => {
                const point = selectedGridRow.Source ?? selectedGridRow.Sink
                const allFields = Array.from(new Set([
                    ...Object.keys(selectedGridRow.Source?.Fields ?? {}),
                    ...Object.keys(selectedGridRow.Sink?.Fields ?? {})
                ])).sort()
                return (
                    <>
                        <div className="px-2 pt-1 text-gray-400 uppercase tracking-wider text-xs">Grid #{point?.Id}</div>
                        {allFields.map(field => {
                            const srcVal = selectedGridRow.Source?.Fields?.[field]
                            const sinkVal = selectedGridRow.Sink?.Fields?.[field]
                            const differs = srcVal !== sinkVal
                            return (
                                <div key={field} className="flex justify-between px-2 py-0.5">
                                    <span className="text-gray-500 w-24 shrink-0">{field}</span>
                                    <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{srcVal ?? '—'}</span>
                                    <span className="text-gray-600 px-1">→</span>
                                    <span className={differs ? 'text-yellow-400' : 'text-gray-400'}>{sinkVal ?? '—'}</span>
                                </div>
                            )
                        })}
                        <div>
                            <div
                                className="flex justify-between items-center py-1 px-2 bg-gray-800 rounded cursor-pointer hover:bg-gray-700"
                                onClick={() => setExpandedSections(prev => ({
                                    ...prev,
                                    grid_waypoints: !prev.grid_waypoints
                                }))}
                            >
                                <span className="text-gray-400 uppercase tracking-wider text-xs">Waypoints</span>
                                <span className="text-gray-600">{(expandedSections.grid_waypoints ?? true) ? '▾' : '▸'}</span>
                            </div>
                            {(expandedSections.grid_waypoints ?? true) && (
                                <div className="flex flex-col gap-0.5 px-2 py-1">
                                    <div className="flex text-gray-500 text-xs">
                                        <span className="w-8">#</span>
                                        <span className="flex-1">x, y, z, heading, pause</span>
                                    </div>
                                    {gridEntryRows(selectedGridRow).map(({number, src, sink}) => {
                                        // Per-field diff, not row-level — a Z-only drift (likely
                                        // terrain/elevation) reads very differently from an X/Y
                                        // drift (a genuinely different spot), and that's exactly
                                        // the distinction that matters when deciding which side to
                                        // keep. See waypointFieldDiffs's own comment.
                                        const fields = waypointFieldDiffs(src, sink)
                                        const isSelected = number === selectedWaypointNumber
                                        const renderSide = entry => {
                                            if (!entry) return <span className="text-gray-600">—</span>
                                            return fields.map((f, i) => (
                                                <span key={f.key}>
                                                    <span className={f.differs ? 'text-yellow-400 font-medium' : 'text-gray-400'}>
                                                        {f.key === 'Pause' ? entry.Pause : fmtCoord(entry[f.key])}
                                                    </span>
                                                    {i < fields.length - 1 && <span className="text-gray-600">, </span>}
                                                </span>
                                            ))
                                        }
                                        return (
                                            <div key={number}
                                                 ref={el => {
                                                     if (el) rowRefs.current.set(number, el)
                                                     else rowRefs.current.delete(number)
                                                 }}
                                                 onClick={() => onSelectWaypoint(number)}
                                                 className={`flex text-xs cursor-pointer rounded px-1 -mx-1 ${
                                                     isSelected ? 'bg-blue-900/40' : 'hover:bg-gray-800'
                                                 }`}>
                                                <span className="w-8 shrink-0 text-gray-500">{number}</span>
                                                <span className="flex-1">{renderSide(src)}</span>
                                                {sink && (
                                                    <>
                                                        <span className="text-gray-600 px-1 shrink-0">→</span>
                                                        <span className="flex-1">{renderSide(sink)}</span>
                                                    </>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )
            })()}
        </>
    )
}

export default GridDetailPanel
