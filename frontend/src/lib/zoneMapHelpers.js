// Pure helpers for rendering a Brewall's Maps ZoneMap + grid overlay as SVG. The scale-to-fit +
// Y-flip transform here is the exact math verified against real data (gfaydark.txt, 2730
// segments) while planning this feature — rendered it standalone and got an immediately
// recognizable Greater Faydark (the big-tree village cluster, the zone-line notches at the
// borders) with world X -> screen X and world Y -> screen Y *inverted*, no axis swap. Background
// map segments and grid waypoints MUST share one transform instance (see ZoneMapView.jsx) — both
// are the same world coordinate system spawn2/grid_entries already use, so two independently
// computed transforms would silently misalign the overlay against the map.

// computeMapBounds takes the union of every zone map segment's endpoints AND every grid
// waypoint's own coordinates (segments may not exist yet — a zone with no Brewall coverage still
// has grids worth plotting on their own bounding box) so the fit-to-container scale always covers
// everything actually being drawn, not just the background.
export function computeMapBounds(segments, gridPoints) {
    const xs = []
    const ys = []
    for (const s of segments) {
        xs.push(s.X1, s.X2)
        ys.push(s.Y1, s.Y2)
    }
    for (const g of gridPoints) {
        for (const e of g.Entries ?? []) {
            xs.push(e.X)
            ys.push(e.Y)
        }
    }
    if (xs.length === 0) return null
    return {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys)}
}

// makeTransform returns {sx(x), sy(y)} closures mapping world coordinates into a width x height
// viewBox, scaled to fit with even padding on all sides and Y inverted (so +Y reads "up" on
// screen, matching the verified prototype). Returns identity-ish no-ops if bounds is null (empty
// map, e.g. no segments and no grids) so callers don't need a separate null-check branch.
export function makeTransform(bounds, width, height, padding = 20) {
    if (!bounds) {
        return {sx: () => width / 2, sy: () => height / 2}
    }
    const w = bounds.maxX - bounds.minX || 1 // avoid divide-by-zero for a degenerate single-point map
    const h = bounds.maxY - bounds.minY || 1
    const scale = Math.min((width - 2 * padding) / w, (height - 2 * padding) / h)
    return {
        sx: x => padding + (x - bounds.minX) * scale,
        sy: y => padding + (bounds.maxY - y) * scale
    }
}

// One grid's waypoints, in Number order, as an SVG polyline "x,y x,y ..." points string — the
// ordering (not insertion order) is what actually defines the patrol path.
export function gridPolylinePoints(grid, transform) {
    const entries = [...(grid.Entries ?? [])].sort((a, b) => a.Number - b.Number)
    return entries.map(e => `${transform.sx(e.X)},${transform.sy(e.Y)}`).join(' ')
}

// fitTransformFor computes the {scale, offsetX, offsetY} for the pan/zoom <g> wrapper (see
// ZoneMapView.jsx) that frames a set of points already run through the base transform (i.e. in
// viewBox space, 0..viewSize) centered in the viewport with padding. The base transform (sx/sy
// above) never changes — this only ever computes an additional scale+translate layered on top of
// it, which is what lets "reset zoom" be plain identity (see ZoneMapView.jsx for why). Clamped to
// the same [0.5, 12] range interactive zoom uses, so framing a single-waypoint grid doesn't zoom
// in absurdly far.
export function fitTransformFor(points, viewSize, padding = 60) {
    if (points.length === 0) return {scale: 1, offsetX: 0, offsetY: 0}
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    const w = maxX - minX || 1
    const h = maxY - minY || 1
    const rawScale = Math.min((viewSize - 2 * padding) / w, (viewSize - 2 * padding) / h)
    const scale = Math.min(Math.max(rawScale, 0.5), 12)
    const centerX = (minX + maxX) / 2
    const centerY = (minY + maxY) / 2
    return {
        scale,
        offsetX: viewSize / 2 - centerX * scale,
        offsetY: viewSize / 2 - centerY * scale
    }
}

// A short line segment from a waypoint in its Heading direction — a cheap facing indicator.
// EQ headings are 0-255 "heading units" (not degrees) running clockwise from... convention varies
// enough across tools that this is deliberately just a visual tick, not claimed to be
// compass-precise — see the zone map feature's own verification note about confirming orientation
// against a real, known grid before trusting it.
export function headingTickEnd(entry, transform, length = 15) {
    const radians = (entry.Heading / 256) * 2 * Math.PI
    const x1 = transform.sx(entry.X)
    const y1 = transform.sy(entry.Y)
    return {
        x1, y1,
        x2: x1 + Math.sin(radians) * length,
        y2: y1 - Math.cos(radians) * length
    }
}
