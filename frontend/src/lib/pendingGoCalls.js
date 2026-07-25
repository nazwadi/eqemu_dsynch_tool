import {useSyncExternalStore} from 'react';

// Global "is any backend call in flight" signal, added 2026-07-25 alongside the Go-side
// parallelization pass (see dbutil.go's runParallel) — direct response to "the UI often lags while
// queries are happening... can we show some kind of progress bar." Parallelizing the Compare*
// methods cuts real wait time over an SSH tunnel; this is the other half — visible feedback for
// whatever wait time is left, for EVERY backend call, not just the ones this pass happened to
// touch.
//
// instrumentGoCalls() patches window.go.main.App itself (the runtime binding object Wails injects,
// not the generated wailsjs/go/main/App.js wrapper functions) so every call automatically
// increments/decrements a shared counter — no individual hook needs to opt in, and it keeps working
// for Go methods added after this was written, since it wraps whatever's on the object at call time
// rather than an enumerated list of names. Deliberately patches the runtime object, not the
// generated file, since `wails generate module` regenerates App.js on every build and would wipe
// out any edits made there directly.
let count = 0
const listeners = new Set()

function notify() {
    for (const listener of listeners) listener()
}

function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function getSnapshot() {
    return count
}

export function usePendingGoCalls() {
    return useSyncExternalStore(subscribe, getSnapshot)
}

export function instrumentGoCalls() {
    const app = window.go?.main?.App
    if (!app || app.__pendingCallsInstrumented) return
    for (const key of Object.keys(app)) {
        const original = app[key]
        if (typeof original !== 'function') continue
        app[key] = function (...args) {
            count++
            notify()
            const finish = () => {
                count--
                notify()
            }
            let result
            try {
                result = original.apply(app, args)
            } catch (err) {
                finish()
                throw err
            }
            if (result && typeof result.then === 'function') {
                result.then(finish, finish)
            } else {
                finish()
            }
            return result
        }
    }
    app.__pendingCallsInstrumented = true
}
