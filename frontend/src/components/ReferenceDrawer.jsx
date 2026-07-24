import {useModalFocusTrap} from '../hooks/useModalFocusTrap';

// Reusable right-edge slide-over shell for "click a shared reference, see a read-only source-vs-
// sink comparison" drawers — npc_faction is the first; spells/merchant/loot are expected to reuse
// this same chrome once their own comparisons exist. Mirrors SpawnHelpDrawer's shape (backdrop,
// Escape-to-close, focus-on-open, right-edge positioning) since this is the same "passive
// reference content, not a commit action" category as that drawer, not a Confirm modal. Wider
// (w-[32rem] vs w-96) since this shows real tabular data rather than a paragraph.
//
// Content is passed as children rather than baked in here — what a faction comparison shows and
// what a future loot comparison shows are genuinely different shapes (see CompareNPCFaction's
// comment on why that type isn't generic either); only this chrome is shared across all of them.
function ReferenceDrawer({open, onClose, title, children}) {
    const {ref, handleKeyDown} = useModalFocusTrap(open, onClose)

    if (!open) return null
    return (
        <>
            <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose}/>
            <div
                ref={ref}
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                className="fixed top-0 right-0 bottom-0 w-[32rem] max-w-full bg-gray-800 border-l border-gray-700 z-50 outline-none flex flex-col shadow-2xl">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
                    <h2 className="text-sm font-medium text-gray-200">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white cursor-pointer">✕</button>
                </div>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-sm text-gray-300">
                    {children}
                </div>
            </div>
        </>
    )
}

export default ReferenceDrawer
