import {useEffect, useRef, useState} from 'react';
import {computeMapBounds, fitTransformFor, makeTransform} from '../lib/zoneMapHelpers';
import {spawnCoords, spawnKey, spawnRowLabel} from '../lib/spawnHelpers';

const VIEW_SIZE = 900
const ZOOM_MIN = 0.5
const ZOOM_MAX = 12
const ZOOM_STEP = 1.4
const SOURCE_COLOR = 'rgb(250,204,21)'  // amber-400 — same source/sink convention ZoneMapView's grid markers use
const SINK_COLOR = 'rgb(45,212,191)'    // teal-400

// Renders a Brewall's Maps background (zoneMap.Segments) with every spawn2 location in the zone
// overlaid, mirroring ZoneMapView.jsx's Grids Map view (see that component's own header comment
// for the shared transform's design and why one BASE transform instance is non-negotiable here).
//
// A spawn2 location is a single point, not a multi-waypoint path — and unlike a grid's waypoints,
// which really can drift between source and sink, a "modified"/"match" spawn row's source and
// sink coordinates are IDENTICAL by construction (spawn2 identity IS the coordinate match, see
// CLAUDE.md's "Spawn point identity" note) — there's no equivalent drift to visualize. So instead
// of separate source/sink markers joined by a drift line, each location gets one marker: a filled
// amber dot when source has a row here, a hollow teal ring when sink does, both together (dot
// inside ring) when the location is matched on both sides. A lone dot is a "new" row (source
// only); a lone ring is a "removed" row about to be deleted (sink only) — the marker shape itself
// already tells you the row's status without needing a separate color-by-status scheme, the same
// restraint ZoneMapView's own grid markers show (color there is selected-vs-not, not new/modified/
// removed either).
//
// Every location in the zone renders dimly for context, same as every non-selected grid path in
// ZoneMapView; selecting a row highlights and auto-frames it. Pan/zoom is the identical
// implementation ZoneMapView already uses (wheel-to-cursor via getScreenCTM, drag-to-pan, +/-/Fit
// buttons) — copied rather than shared, since the two components' marker rendering differs enough
// (paths+waypoints vs. single points) that extracting a common base would mostly just be
// indirection around a few dozen lines of svg event wiring.
function SpawnMapView({zoneMap, spawnDiffRows, selectedSpawnRow, onSelectSpawnRow}) {
    const segments = zoneMap?.Segments ?? []
    const svgRef = useRef(null)
    const [view, setView] = useState({scale: 1, offsetX: 0, offsetY: 0})

    const points = (spawnDiffRows ?? [])
        .map(row => {
            const [x, y] = spawnCoords(row)
            return {row, x, y}
        })
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))

    const bounds = computeMapBounds(segments, points)
    const transform = makeTransform(bounds, VIEW_SIZE, VIEW_SIZE)
    const selectedRowKey = selectedSpawnRow ? spawnKey(selectedSpawnRow) : null

    // Auto-frame the selected spawn point — same "selection drives the view" behavior as
    // ZoneMapView's grid framing, just simpler: one coordinate, not a whole waypoint list.
    // transform.sx/sy are new closures every render, deliberately left out of the dependency
    // array — see ZoneMapView.jsx's identical note for why.
    useEffect(() => {
        const [x, y] = selectedSpawnRow ? spawnCoords(selectedSpawnRow) : [NaN, NaN]
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            setView({scale: 1, offsetX: 0, offsetY: 0})
            return
        }
        setView(fitTransformFor([{x: transform.sx(x), y: transform.sy(y)}], VIEW_SIZE))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedRowKey, zoneMap])

    // Zoom-to-cursor — identical implementation to ZoneMapView.jsx, see that component's own
    // comments for why getScreenCTM (not getBoundingClientRect) and a native wheel listener
    // (not the passive-by-default JSX onWheel prop) are both required here.
    function zoomBy(factor, cursor) {
        setView(prev => {
            const newScale = Math.min(Math.max(prev.scale * factor, ZOOM_MIN), ZOOM_MAX)
            const worldX = (cursor.x - prev.offsetX) / prev.scale
            const worldY = (cursor.y - prev.offsetY) / prev.scale
            return {scale: newScale, offsetX: cursor.x - worldX * newScale, offsetY: cursor.y - worldY * newScale}
        })
    }

    useEffect(() => {
        const svg = svgRef.current
        if (!svg) return
        const onWheel = (e) => {
            e.preventDefault()
            const pt = svg.createSVGPoint()
            pt.x = e.clientX
            pt.y = e.clientY
            const ctm = svg.getScreenCTM()
            if (!ctm) return
            const cursor = pt.matrixTransform(ctm.inverse())
            zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, cursor)
        }
        svg.addEventListener('wheel', onWheel, {passive: false})
        return () => svg.removeEventListener('wheel', onWheel)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    function handleBackgroundMouseDown(e) {
        e.preventDefault()
        const svg = svgRef.current
        if (!svg) return
        const startClientX = e.clientX
        const startClientY = e.clientY
        const startOffsetX = view.offsetX
        const startOffsetY = view.offsetY
        const onMouseMove = (e) => {
            const ctm = svg.getScreenCTM()
            if (!ctm) return
            setView(prev => ({
                ...prev,
                offsetX: startOffsetX + (e.clientX - startClientX) / ctm.a,
                offsetY: startOffsetY + (e.clientY - startClientY) / ctm.d
            }))
        }
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
        }
        window.addEventListener('mousemove', onMouseMove)
        window.addEventListener('mouseup', onMouseUp)
    }

    if (segments.length === 0 && points.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                No Brewall map found for this zone, and no spawn points to plot.
            </div>
        )
    }

    const groupTransform = `translate(${view.offsetX},${view.offsetY}) scale(${view.scale})`

    return (
        <div className="flex-1 flex flex-col bg-black overflow-hidden">
            {segments.length === 0 && (
                <div className="shrink-0 text-xs text-amber-400 bg-gray-900 px-2 py-1 text-center">
                    No Brewall map file for this zone — showing spawn points only, unscaled to real terrain.
                </div>
            )}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
                     className="w-full h-full max-w-full max-h-full cursor-grab active:cursor-grabbing"
                     preserveAspectRatio="xMidYMid meet"
                     onMouseDown={handleBackgroundMouseDown}>
                    <rect width={VIEW_SIZE} height={VIEW_SIZE} fill="black"/>
                    {/* Stroke widths and marker radii are divided by view.scale so they stay a
                        constant on-screen size regardless of zoom, same reasoning as
                        ZoneMapView.jsx's identical treatment. */}
                    <g transform={groupTransform}>
                        {segments.map((s, i) => {
                            const color = s.R === 0 && s.G === 0 && s.B === 0 ? 'rgb(120,120,120)' : `rgb(${s.R},${s.G},${s.B})`
                            return (
                                <line key={i}
                                      x1={transform.sx(s.X1)} y1={transform.sy(s.Y1)}
                                      x2={transform.sx(s.X2)} y2={transform.sy(s.Y2)}
                                      stroke={color} strokeWidth={1 / view.scale}/>
                            )
                        })}
                        {points.map(({row, x, y}) => {
                            const key = spawnKey(row)
                            const isSelected = key === selectedRowKey
                            const cx = transform.sx(x)
                            const cy = transform.sy(y)
                            const hasSource = !!row.Source
                            const hasSink = !!row.Sink
                            const dotRadius = (isSelected ? 5 : 3) / view.scale
                            const ringRadius = dotRadius + 2 / view.scale
                            return (
                                <g key={key} className="cursor-pointer"
                                   onMouseDown={e => e.stopPropagation()}
                                   onClick={e => {
                                       e.stopPropagation()
                                       onSelectSpawnRow(row)
                                   }}>
                                    <title>{spawnRowLabel(row.Source ?? row.Sink)} — {row.Status}</title>
                                    {isSelected && (
                                        <circle cx={cx} cy={cy} r={ringRadius + 4 / view.scale} fill="none"
                                                stroke="white" strokeWidth={1.5 / view.scale} opacity={0.85}/>
                                    )}
                                    {hasSource && (
                                        <circle cx={cx} cy={cy} r={dotRadius} fill={SOURCE_COLOR}
                                                opacity={isSelected ? 1 : 0.55}/>
                                    )}
                                    {hasSink && (
                                        <circle cx={cx} cy={cy} r={ringRadius} fill="none" stroke={SINK_COLOR}
                                                strokeWidth={(isSelected ? 2 : 1.5) / view.scale}
                                                opacity={isSelected ? 1 : 0.55}/>
                                    )}
                                </g>
                            )
                        })}
                    </g>
                </svg>
                <div className="absolute top-2 left-2 flex flex-col gap-1 text-[10px] text-gray-300 bg-gray-900/80 border border-gray-700 rounded px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{background: SOURCE_COLOR}}/>
                        Source
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-full border shrink-0" style={{borderColor: SINK_COLOR, borderWidth: 1.5}}/>
                        Sink
                    </div>
                    <div className="text-gray-500">Dot + ring together = matched location</div>
                </div>
                {/* Redundant with wheel-zoom on purpose — same reasoning as ZoneMapView's identical buttons. */}
                <div className="absolute bottom-2 right-2 flex flex-col gap-1">
                    <button onClick={() => zoomBy(ZOOM_STEP, {x: VIEW_SIZE / 2, y: VIEW_SIZE / 2})}
                            title="Zoom in"
                            className="w-6 h-6 flex items-center justify-center rounded bg-gray-900/80 border border-gray-600 text-gray-300 text-sm hover:border-gray-400 hover:text-white">
                        +
                    </button>
                    <button onClick={() => zoomBy(1 / ZOOM_STEP, {x: VIEW_SIZE / 2, y: VIEW_SIZE / 2})}
                            title="Zoom out"
                            className="w-6 h-6 flex items-center justify-center rounded bg-gray-900/80 border border-gray-600 text-gray-300 text-sm hover:border-gray-400 hover:text-white">
                        −
                    </button>
                    <button onClick={() => setView({scale: 1, offsetX: 0, offsetY: 0})}
                            title="Reset to full zone"
                            className="w-6 h-6 flex items-center justify-center rounded bg-gray-900/80 border border-gray-600 text-gray-300 text-[9px] hover:border-gray-400 hover:text-white">
                        Fit
                    </button>
                </div>
            </div>
        </div>
    )
}

export default SpawnMapView
