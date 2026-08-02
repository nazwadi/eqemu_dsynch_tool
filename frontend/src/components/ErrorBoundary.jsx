import {Component} from 'react';

// Last-resort safety net for uncaught rendering exceptions — added 2026-08-01 alongside the Go
// backend crash fixes (missing sourceDB/sinkDB nil guards in CompareZones/CompareSpawns/
// CompareSpawnGroups/CompareGrids, see those methods' own comments). Those fixes address the
// actual reported bug — a Go panic in a goroutine that took down the whole app process — but
// "the app can't crash" is a broader requirement than that one bug: a plain JS exception anywhere
// in a tab's render (a future null-safety gap, a bad prop from an edge case not anticipated here)
// currently unmounts React's entire tree, turning any single mistake into a blank white window
// with no way back short of restarting the app. This is the standard React fix for exactly that —
// componentDidCatch is the only way to intercept a render-phase exception; there is no hook
// equivalent, which is why this is a class component in an otherwise all-function-component
// codebase.
//
// Deliberately scoped narrow rather than one boundary around the whole app: App.jsx wraps the tab
// content area and the detail panel each in their own instance (see App.jsx), so a crash in one
// still leaves the sidebar, zone list, and the other panel usable — "disable (mute) the broken
// feature," not "take down everything else working fine alongside it." Each instance is remounted
// (via a changing `resetKey` prop, typically the active tab name) rather than needing its own
// explicit retry button, so switching away from and back to a crashed tab is itself the recovery
// path, no different from any other tab switch.
class ErrorBoundary extends Component {
    constructor(props) {
        super(props)
        this.state = {error: null}
    }

    static getDerivedStateFromError(error) {
        return {error}
    }

    componentDidCatch(error, info) {
        console.error('Render error caught by ErrorBoundary:', error, info)
    }

    componentDidUpdate(prevProps) {
        if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
            this.setState({error: null})
        }
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4">
                    <div className="text-red-400 text-sm">Something went wrong rendering this view.</div>
                    <div className="text-gray-500 text-xs max-w-md">{String(this.state.error?.message ?? this.state.error)}</div>
                    <button
                        onClick={() => this.setState({error: null})}
                        className="mt-2 px-3 py-1 rounded text-xs border border-gray-600 text-gray-300 hover:border-gray-400">
                        Try again
                    </button>
                </div>
            )
        }
        return this.props.children
    }
}

export default ErrorBoundary
