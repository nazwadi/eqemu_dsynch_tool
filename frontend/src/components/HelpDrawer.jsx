import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Shared right-edge slide-over chrome (backdrop, panel, header title + close button, focus trap)
// for every tab's inline help drawer — extracted 2026-07-24 from SpawnHelpDrawer.jsx once four
// more of these were added, so five near-identical copies of this same shell didn't accumulate the
// way useModalFocusTrap was extracted for the same reason a session earlier. Deliberately not a
// modal (every modal in this app means "you're about to commit to something"; a help drawer is
// passive reference content) and not a popover (no positioning library, and the detail panel is
// too narrow to anchor one usefully) — see CLAUDE.md for the full reasoning, first written for the
// Spawn Points tab's own drawer. Content is entirely up to the caller via children; this component
// owns only the chrome every drawer shares.
function HelpDrawer({open, onClose, title, children}) {
    const {ref, handleKeyDown} = useModalFocusTrap(open, onClose)

    if (!open) return null
    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose}/>
            <div
                ref={ref}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                className="fixed top-0 right-0 bottom-0 w-96 max-w-full bg-gray-800 border-l border-gray-700 z-50 outline-none flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <h2 className="text-sm font-medium text-gray-200">{title}</h2>
                    <button onClick={onClose}
                            className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm text-gray-300">
                    {children}
                </div>
            </div>
        </>
    )
}

export default HelpDrawer
