import {useState} from 'react';
import HelpDrawer from './HelpDrawer';

// Configures which npc_types columns Sync should never overwrite on an EXISTING sink row (see
// SyncOptions.ExcludedFields / NPCDiffRow.FieldsDiffer) — a settings panel, not passive reference
// content, but built on the same shared drawer shell as the "?" help drawers rather than
// introducing a second slide-over chrome; HelpDrawer's own doc comment already says its content is
// entirely up to the caller. Persists immediately on every add/remove (setExcludedNpcFields is
// already a save-on-change setter, see useConnections.js), the same "no confirm step needed" shape
// as the Maps folder setting — there's nothing destructive here to gate behind a confirm. Every
// npc_types column is a valid candidate, References FK ids included (see NpcDetailPanel.jsx's own
// comment for why an earlier version blocked those, and why that turned out wrong).
function ExcludedFieldsDrawer({open, onClose, excludedFields, setExcludedFields, candidateFields}) {
    const [search, setSearch] = useState('')

    function addField(field) {
        setExcludedFields([...excludedFields, field].sort())
        setSearch('')
    }

    function removeField(field) {
        setExcludedFields(excludedFields.filter(f => f !== field))
    }

    const q = search.trim().toLowerCase()
    const matches = q
        ? candidateFields.filter(f => !excludedFields.includes(f) && f.toLowerCase().includes(q)).slice(0, 20)
        : []

    return (
        <HelpDrawer open={open} onClose={onClose} title="Fields excluded from NPC sync">
            <p>
                These <span className="text-gray-300">npc_types</span> columns are never overwritten by Sync on an
                <span className="text-gray-300"> existing</span> sink row, even when that NPC is selected and synced.
                A brand-new NPC being created for the first time still gets these columns set from source — there's
                no existing sink value to protect yet, so leaving them out would just start the new row half-initialized.
            </p>
            <p className="text-gray-500">
                Reference fields (<span className="text-gray-300">loottable_id</span>, <span className="text-gray-300">npc_faction_id</span>,
                <span className="text-gray-300"> npc_spells_id</span>, <span className="text-gray-300">merchant_id</span>,
                <span className="text-gray-300"> alt_currency_id</span>) can be excluded too — useful when you want most of an
                NPC's data to sync but aren't ready to touch its faction/loot table/spells yet, and don't want to lose track
                of what sink is currently pointing to in the meantime. Excluding one only protects the id column itself; the
                shared reference content it points at (faction values, spell lists, loot tables) is never written by Sync
                regardless of exclusion — see the References section's comparison drawers and the Loot tab for that.
            </p>
            <div className="flex flex-col gap-1">
                <input
                    className="text-xs border border-gray-600 bg-gray-700 rounded px-2 py-1"
                    placeholder="Search npc_types columns to exclude..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    autoCapitalize="off" autoCorrect="off" spellCheck={false}/>
                {q && (
                    <div className="flex flex-col gap-0.5 max-h-48 overflow-y-auto rounded border border-gray-700 bg-gray-900/40 p-1">
                        {matches.length === 0 ? (
                            <div className="text-xs text-gray-600 px-2 py-1">No matching columns.</div>
                        ) : matches.map(field => (
                            <div key={field}
                                 onClick={() => addField(field)}
                                 className="text-xs text-gray-300 px-2 py-1 rounded cursor-pointer hover:bg-gray-700">
                                {field}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex flex-col gap-1">
                <div className="text-xs text-gray-400 uppercase tracking-wider">
                    Excluded ({excludedFields.length})
                </div>
                {excludedFields.length === 0 ? (
                    <div className="text-xs text-gray-600">None — every differing column syncs.</div>
                ) : (
                    <div className="flex flex-col gap-0.5">
                        {excludedFields.map(field => (
                            <div key={field} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-gray-850 border border-gray-700">
                                <span className="text-gray-300">{field}</span>
                                <button onClick={() => removeField(field)}
                                        title="Stop excluding this field"
                                        className="text-gray-500 hover:text-white">✕</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </HelpDrawer>
    )
}

export default ExcludedFieldsDrawer
