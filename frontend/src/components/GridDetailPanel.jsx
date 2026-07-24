import {fmtCoord} from '../lib/spawnHelpers';
import {gridEntryRows} from '../lib/gridHelpers';

// Grids branch of the shared detail panel — see DetailPanel.jsx for the dispatcher/chrome this
// plugs into.
function GridDetailPanel({selectedGridRow, expandedSections, setExpandedSections}) {
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
                                    {gridEntryRows(selectedGridRow).map(({number, src, sink, differs}) => {
                                        const fmt = e => e ? `${fmtCoord(e.X)}, ${fmtCoord(e.Y)}, ${fmtCoord(e.Z)}, ${fmtCoord(e.Heading)}, ${e.Pause}` : '—'
                                        return (
                                            <div key={number}
                                                 className={`flex text-xs ${differs ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                <span className="w-8 shrink-0">{number}</span>
                                                <span className="flex-1">{fmt(src)}</span>
                                                {sink && (
                                                    <>
                                                        <span className="text-gray-600 px-1 shrink-0">→</span>
                                                        <span className="flex-1">{fmt(sink)}</span>
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
