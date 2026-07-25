import {usePendingGoCalls} from '../lib/pendingGoCalls';

// A thin, fixed, top-of-window loading bar shown whenever ANY backend call is in flight — added
// 2026-07-25, direct response to "the UI often lags while queries are happening... can we show
// some kind of progress bar." usePendingGoCalls() is a single global counter fed by every Go call
// automatically (see lib/pendingGoCalls.js's instrumentGoCalls), so this needs no per-action
// wiring — it covers every existing loading state (zone diffs, sync previews, relocate, align,
// connect, ...) and any future one, without each needing its own spinner.
//
// Indeterminate, not a real percentage — a single Promise has no "% complete" to report, so this
// mirrors the standard indeterminate-progress pattern instead (see style.css's
// global-progress-slide keyframes). Fixed at the very top of the viewport, above all content
// (z-50, same layer other modals use), so it's visible regardless of which tab/modal is open.
function GlobalProgressBar() {
    const pending = usePendingGoCalls()
    if (pending === 0) return null
    return (
        <div className="fixed top-0 left-0 right-0 h-0.5 z-50 overflow-hidden bg-transparent pointer-events-none">
            <div
                className="h-full w-full bg-yellow-400 origin-left"
                style={{animation: 'global-progress-slide 1.1s ease-in-out infinite'}}
            />
        </div>
    )
}

export default GlobalProgressBar
