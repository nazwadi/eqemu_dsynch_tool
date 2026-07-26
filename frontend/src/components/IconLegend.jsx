// Always-visible row-icon legend, added 2026-07-25 — the exact pattern ZoneMapView.jsx's Grids
// Map legend already established (a small persistent strip explaining marker meaning, instead of
// hover-only tooltips), generalized into a shared component so other diff lists whose rows rely on
// bare icons can reuse it instead of each explaining itself only on hover or in a separate help
// drawer. items: [{icon, label}].
function IconLegend({items}) {
    return (
        <div className="flex gap-3 flex-wrap px-3 py-1.5 text-xs text-gray-500 border-b border-gray-700 bg-gray-850">
            {items.map(({icon, label}) => (
                <span key={label} className="flex items-center gap-1">
                    <span>{icon}</span>
                    <span>{label}</span>
                </span>
            ))}
        </div>
    )
}

export default IconLegend
