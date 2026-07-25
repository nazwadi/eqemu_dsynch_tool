import {useRef} from 'react';

// Shared Up/Down arrow-key row navigation for the diff lists (NPCs, Spawn Points, Grids,
// Spawngroups) — added 2026-07-25 in direct response to "if I select a row in a list and up or
// down arrow, it moves the scrollbar... the better experience is to move up or down one row in
// the list." None of these lists had any tabIndex/keyboard handling before this, so Up/Down fell
// through to the browser's default behavior (scroll the nearest scrollable ancestor) — mouse
// wheel/scrollbar still do that; this only changes what the arrow keys themselves do once a row
// is selected.
//
// Clamps at the top/bottom rather than wrapping around — the standard listbox/file-browser/
// spreadsheet behavior, not this app inventing its own convention. `rows` must be the SAME
// filtered+sorted array the caller renders (not the raw unfiltered diff rows), so navigation moves
// through what's actually visible on screen, not some other order.
export function useListArrowKeyNav({rows, getKey, selectedKey, onSelect}) {
    const containerRef = useRef(null)

    function onKeyDown(e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
        if (rows.length === 0) return
        e.preventDefault()
        const currentIndex = rows.findIndex(r => getKey(r) === selectedKey)
        const delta = e.key === 'ArrowDown' ? 1 : -1
        const nextIndex = currentIndex === -1 ? 0 : currentIndex + delta
        if (nextIndex < 0 || nextIndex >= rows.length) return
        const nextRow = rows[nextIndex]
        onSelect(nextRow)
        // Only actually scrolls if the newly-selected row is outside the visible area — deferred a
        // frame so it runs after the row re-render that the selection change above triggers, not
        // against last render's DOM.
        const key = getKey(nextRow)
        requestAnimationFrame(() => {
            containerRef.current?.querySelector(`[data-row-key="${CSS.escape(String(key))}"]`)?.scrollIntoView({block: 'nearest'})
        })
    }

    return {containerRef, onKeyDown}
}
