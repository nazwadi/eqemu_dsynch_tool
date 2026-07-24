import {useEffect, useRef} from 'react';

// Shared focus-on-open + Escape-to-close behavior for every modal/drawer in the app. Escape calls
// e.preventDefault() before onClose — without it, WKWebView (Wails on macOS) lets the key event
// fall through to native handling, which plays the system alert sound (NSBeep()) since nothing in
// the native responder chain implements the cancelOperation: action Escape is bound to by default.
// Spread {ref, onKeyDown: handleKeyDown} onto the modal's outer, tabIndex={-1} wrapper div.
export function useModalFocusTrap(isOpen, onClose) {
    const ref = useRef(null)
    useEffect(() => {
        if (isOpen) ref.current?.focus()
    }, [isOpen])

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
        }
    }

    return {ref, handleKeyDown}
}
