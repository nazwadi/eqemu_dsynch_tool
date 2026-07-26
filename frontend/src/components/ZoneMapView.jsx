import {useEffect, useRef, useState} from 'react';
import {computeMapBounds, fitTransformFor, gridPolylinePoints, headingTickEnd, makeTransform} from '../lib/zoneMapHelpers';
import {gridEntryRows, gridId} from '../lib/gridHelpers';

const VIEW_SIZE = 900
const ZOOM_MIN = 0.5
const ZOOM_MAX = 12
const ZOOM_STEP = 1.4  // per button click; wheel uses a gentler 1.15 per notch
const SOURCE_COLOR = 'rgb(250,204,21)'  // amber-400 — matches the selected-grid path color
const SINK_COLOR = 'rgb(45,212,191)'    // teal-400 — deliberately distinct from amber (source),
                                         // the cyan used for non-selected grid paths, AND the
                                         // white selection ring, so all four meanings stay legible
                                         // at once
const DRIFT_LINE_COLOR = 'rgb(248,113,113)'  // red-400

// Renders a Brewall's Maps background (zoneMap.Segments) with every grid in the zone overlaid as
// a path, matched by coordinate transform to the same world space (see zoneMapHelpers.js's own
// header comment for why one shared BASE transform instance is non-negotiable here). Always plots
// source's grid PATHS — this app's whole design already treats source as the reference dataset,
// same reasoning CompareSpawnGroups/CompareGrids use elsewhere; every other (non-selected) grid
// renders as a thin, dim path for context only, so a zone with many grids doesn't turn into visual
// noise. The SELECTED grid's individual WAYPOINTS are a different story (added 2026-07-24, see
// below) — both source's and sink's are plotted, since the whole point of a diffing tool is
// answering "which side do I keep," which a source-only view can't do.
//
// Waypoint diff visualization (added 2026-07-24, direct follow-up to the pan/zoom pass): source
// waypoints render as filled amber dots, sink's as hollow teal rings, joined by a dashed red line
// when their X/Y position actually differs (a Z-only or heading-only difference draws no line —
// the dots would sit on top of each other anyway, so a connector would be a meaningless dot).
// Matched by gridEntryRows() (lib/gridHelpers.js, already shared with GridDetailPanel's own
// waypoint table) rather than re-deriving the source/sink pairing here. Selection state (the white
// ring) is drawn as an independent extra shape rather than baked into the marker's own fill/stroke
// color, so a selected waypoint's source/sink identity color stays legible instead of being
// overwritten by "selected" — the same reason it isn't just recolored blue the way it briefly was
// in the pan/zoom pass before sink markers existed.
//
// Pan/zoom (added 2026-07-24) is a SECOND transform layered on top of the base one via a single
// <g transform="translate(...) scale(...)"> wrapping everything the base transform already
// positions — the base transform itself never changes, so "reset" is just identity on the outer
// <g> (see zoneMapHelpers.js's fitTransformFor doc comment). Selecting a grid auto-frames it
// (the primary way this view is meant to be used, per the UX pass this shipped with); wheel/drag
// are the freeform complement. Waypoint markers are click-selectable and cross-highlight with
// GridDetailPanel's own waypoint table via selectedWaypointNumber, lifted into useGridSync so both
// components can read AND write it.
function ZoneMapView({zoneMap, gridDiffRows, selectedGridRow, selectedWaypointNumber, onSelectWaypoint}) {
    const grids = (gridDiffRows ?? []).map(row => row.Source).filter(Boolean)
    const segments = zoneMap?.Segments ?? []
    const svgRef = useRef(null)
    const [view, setView] = useState({scale: 1, offsetX: 0, offsetY: 0})

    const bounds = computeMapBounds(segments, grids.flatMap(g => (g.Entries ?? []).map(e => ({x: e.X, y: e.Y}))))
    const transform = makeTransform(bounds, VIEW_SIZE, VIEW_SIZE)
    const selectedId = selectedGridRow?.Source?.Id

    // Auto-frame the selected grid. Includes BOTH source's and sink's waypoints (not source only)
    // so a drifted sink waypoint is guaranteed visible rather than silently clipped outside the
    // frame — the whole point of this pass is comparing the two, so both need to actually be on
    // screen. No selection (or nothing to frame on either side) falls back to the identity view —
    // which, since the base transform already fits the whole zone into the viewBox, IS the
    // full-zone view. transform.sx/sy are new closures every render, so they're deliberately left
    // out of the dependency array (they're pure functions of props already covered by the
    // zoneMap/gridDiffRows this effect re-derives from); including them would re-fit on every
    // render, fighting any manual pan/zoom the user just did.
    useEffect(() => {
        const entries = [...(selectedGridRow?.Source?.Entries ?? []), ...(selectedGridRow?.Sink?.Entries ?? [])]
        if (entries.length === 0) {
            setView({scale: 1, offsetX: 0, offsetY: 0})
            return
        }
        const points = entries.map(e => ({x: transform.sx(e.X), y: transform.sy(e.Y)}))
        setView(fitTransformFor(points, VIEW_SIZE))
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedGridRow ? gridId(selectedGridRow) : null, zoneMap])

    // Zoom-to-cursor: keeps whatever world point is currently under the cursor fixed on screen
    // while the scale changes, the standard map-style zoom feel. cursor is in the SVG root's own
    // user space (pre-<g>, i.e. the same space the base transform's sx/sy already output), via
    // getScreenCTM — robust against the SVG's rendered CSS size differing from its 900x900
    // viewBox, unlike hand-rolling the math from getBoundingClientRect.
    function zoomBy(factor, cursor) {
        setView(prev => {
            const newScale = Math.min(Math.max(prev.scale * factor, ZOOM_MIN), ZOOM_MAX)
            const worldX = (cursor.x - prev.offsetX) / prev.scale
            const worldY = (cursor.y - prev.offsetY) / prev.scale
            return {scale: newScale, offsetX: cursor.x - worldX * newScale, offsetY: cursor.y - worldY * newScale}
        })
    }

    // Native (non-passive) wheel listener, not a JSX onWheel prop — React attaches onWheel as a
    // passive listener by default, which silently no-ops e.preventDefault() and logs a console
    // warning. Using the functional setView(prev => ...) form inside zoomBy means this effect
    // never needs `view` in its own dependencies and can register once.
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

    // Drag-to-pan on the background — same window-level mousemove/mouseup pattern App.jsx already
    // uses for the sidebar/detail-panel resize handles, so a drag that leaves the SVG's bounds
    // doesn't get stuck "stuck down". Waypoint markers stopPropagation() their own onMouseDown, so
    // a press-drag starting exactly on one doesn't pan the view out from under the click.
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

    // One waypoint marker, source or sink — `filled` is the only thing that distinguishes them
    // visually (amber dot vs. hollow teal ring); selection is a separate white ring drawn behind
    // it (see the component doc comment above for why it isn't just a recolor).
    function renderWaypointMarker(entry, {side, color, filled, isSelected}) {
        const cx = transform.sx(entry.X)
        const cy = transform.sy(entry.Y)
        // headingTickEnd's length is in pre-zoom viewBox space, same as stroke widths/marker
        // radii elsewhere in this function — divide by scale so the tick stays a constant
        // on-screen length instead of stretching into a long spike once "fit to selected grid"
        // zooms in tight on a small, dense cluster of waypoints.
        const tick = headingTickEnd(entry, transform, 15 / view.scale)
        return (
            <g className="cursor-pointer"
               onMouseDown={e => e.stopPropagation()}
               onClick={e => {
                   e.stopPropagation()
                   onSelectWaypoint(entry.Number)
               }}>
                <title>
                    #{entry.Number} ({side}): ({entry.X.toFixed(1)}, {entry.Y.toFixed(1)}, {entry.Z.toFixed(1)}) heading {entry.Heading}
                </title>
                {isSelected && (
                    <circle cx={cx} cy={cy} r={8 / view.scale} fill="none"
                            stroke="white" strokeWidth={1.5 / view.scale} opacity={0.85}/>
                )}
                <line x1={tick.x1} y1={tick.y1} x2={tick.x2} y2={tick.y2}
                      stroke={color} strokeWidth={1.5 / view.scale}/>
                {entry.Centerpoint ? (
                    <path d={`M ${cx - 4} ${cy} L ${cx + 4} ${cy} M ${cx} ${cy - 4} L ${cx} ${cy + 4}`}
                          stroke={color} strokeWidth={2 / view.scale}/>
                ) : (
                    <circle cx={cx} cy={cy} r={3.5 / view.scale}
                            fill={filled ? color : 'none'}
                            stroke={filled ? 'none' : color}
                            strokeWidth={filled ? 0 : 2 / view.scale}/>
                )}
            </g>
        )
    }

    if (segments.length === 0 && grids.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                No Brewall map found for this zone, and no grids to plot.
            </div>
        )
    }

    const groupTransform = `translate(${view.offsetX},${view.offsetY}) scale(${view.scale})`
    const entryRows = selectedGridRow ? gridEntryRows(selectedGridRow) : []
    const hasDrift = entryRows.some(r => r.src && r.sink && (r.src.X !== r.sink.X || r.src.Y !== r.sink.Y))

    return (
        <div className="flex-1 flex flex-col bg-black overflow-hidden">
            {segments.length === 0 && (
                <div className="shrink-0 text-xs text-amber-400 bg-gray-900 px-2 py-1 text-center">
                    No Brewall map file for this zone — showing grids only, unscaled to real terrain.
                </div>
            )}
            <div className="flex-1 flex items-center justify-center overflow-hidden relative">
                <svg ref={svgRef} viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
                     className="w-full h-full max-w-full max-h-full cursor-grab active:cursor-grabbing"
                     preserveAspectRatio="xMidYMid meet"
                     onMouseDown={handleBackgroundMouseDown}>
                    <rect width={VIEW_SIZE} height={VIEW_SIZE} fill="black"/>
                    {/* Everything below shares the base transform's coordinates; the pan/zoom
                        transform wraps them as one extra layer rather than being folded into
                        transform.sx/sy itself — see the component doc comment above. Stroke
                        widths and marker radii are divided by view.scale so they stay a constant
                        on-screen size regardless of zoom, rather than growing/shrinking with it
                        the way SVG strokes do by default under a scaling transform. */}
                    <g transform={groupTransform}>
                        {segments.map((s, i) => {
                            // Pure black reads as invisible against the black background — Brewall's
                            // own files use it for plain terrain/wall lines, so it's lifted to a
                            // visible gray rather than rendered as intended (invisible), which is
                            // what the in-game map client does by drawing on its own dark-but-not-
                            // pure-black canvas instead.
                            const color = s.R === 0 && s.G === 0 && s.B === 0 ? 'rgb(120,120,120)' : `rgb(${s.R},${s.G},${s.B})`
                            return (
                                <line key={i}
                                      x1={transform.sx(s.X1)} y1={transform.sy(s.Y1)}
                                      x2={transform.sx(s.X2)} y2={transform.sy(s.Y2)}
                                      stroke={color} strokeWidth={1 / view.scale}/>
                            )
                        })}
                        {grids.map(grid => {
                            const isSelected = grid.Id === selectedId
                            return (
                                <polyline key={grid.Id}
                                          points={gridPolylinePoints(grid, transform)}
                                          fill="none"
                                          stroke={isSelected ? 'rgb(250,204,21)' : 'rgb(6,182,212)'}
                                          strokeWidth={(isSelected ? 2.5 : 1) / view.scale}
                                          opacity={isSelected ? 1 : 0.35}/>
                            )
                        })}
                        {entryRows.map(({number, src, sink}) => {
                            const isSelectedWaypoint = number === selectedWaypointNumber
                            const positionDiffers = src && sink && (src.X !== sink.X || src.Y !== sink.Y)
                            return (
                                <g key={number}>
                                    {positionDiffers && (
                                        <line x1={transform.sx(src.X)} y1={transform.sy(src.Y)}
                                              x2={transform.sx(sink.X)} y2={transform.sy(sink.Y)}
                                              stroke={DRIFT_LINE_COLOR} strokeWidth={1 / view.scale}
                                              strokeDasharray={`${3 / view.scale} ${3 / view.scale}`}/>
                                    )}
                                    {src && renderWaypointMarker(src, {side: 'source', color: SOURCE_COLOR, filled: true, isSelected: isSelectedWaypoint})}
                                    {sink && renderWaypointMarker(sink, {side: 'sink', color: SINK_COLOR, filled: false, isSelected: isSelectedWaypoint})}
                                </g>
                            )
                        })}
                    </g>
                </svg>
                {selectedGridRow && (
                    <div className="absolute top-2 left-2 flex flex-col gap-1 text-[10px] text-gray-300 bg-gray-900/80 border border-gray-700 rounded px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{background: SOURCE_COLOR}}/>
                            Source
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="inline-block w-2 h-2 rounded-full border shrink-0" style={{borderColor: SINK_COLOR, borderWidth: 1.5}}/>
                            Sink
                        </div>
                        {hasDrift && (
                            <div className="flex items-center gap-1.5">
                                <span className="inline-block w-3 h-0 border-t border-dashed shrink-0" style={{borderColor: DRIFT_LINE_COLOR}}/>
                                Position differs
                            </div>
                        )}
                    </div>
                )}
                {/* Redundant with wheel-zoom on purpose — not everyone tries scrolling on a map
                    without a hint. */}
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

export default ZoneMapView
