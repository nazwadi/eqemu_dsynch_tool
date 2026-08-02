import {useEffect, useState} from 'react';
import {GetNPCFactionDetail, ListNPCFactions} from "../../wailsjs/go/main/App";

// Factions tab state — a database-wide, zone-independent browse/align view over npc_faction, see
// ListNPCFactions' own comment for why source/sink are two independent lists here, never paired:
// npc_faction.id is a local surrogate, and even npc_types.id (which anchors every other
// cross-database match in this app) turned out not to be reliably portable either, so there is no
// signal left to auto-match by. The user recognizes a match by name/content and arms it manually.
//
// isActive (whether the Factions tab is the current activeView) drives the lazy first load — this
// data has no zone to key off, so unlike every other tab's eager per-zone load, this only fetches
// once, the first time the tab is actually opened, not on every app startup.
export function useFactionsTab({isActive}) {
    const [sourceList, setSourceList] = useState([])
    const [sinkList, setSinkList] = useState([])
    const [loaded, setLoaded] = useState(false)
    const [loading, setLoading] = useState(false)
    const [loadError, setLoadError] = useState(null)
    const [searchFilter, setSearchFilter] = useState('')
    const [searchExact, setSearchExact] = useState(false) // exact vs substring match, see lib/searchHelpers.js
    // Sort applies to both columns at once (one shared control, not one per column) so the two
    // lists stay in the same order for easy side-by-side eyeballing — 'name' | 'id'.
    const [sortBy, setSortBy] = useState('name')
    const [sortDir, setSortDir] = useState('asc')

    // Detail (fields + entries) for an expanded row, fetched lazily on first expand and cached by
    // id thereafter — id -> NPCFactionDetail | 'loading' | {error}. Two independent caches since
    // the same numeric id means something different on each side.
    const [sourceDetailById, setSourceDetailById] = useState({})
    const [sinkDetailById, setSinkDetailById] = useState({})
    const [expandedSourceIds, setExpandedSourceIds] = useState(new Set())
    const [expandedSinkIds, setExpandedSinkIds] = useState(new Set())

    // Align/sync-content pairing — the same two-step cross-column arm the Loot tab's lootdrop
    // alignment already uses, since npc_faction has the identical "no cross-database anchor"
    // problem lootdrop does. Both actions (align, sync content) share one armed pair once both
    // sides are picked, rather than needing two separate arming flows for the two actions.
    const [armedSource, setArmedSource] = useState(null) // {id, name} | null
    const [armedSink, setArmedSink] = useState(null)

    function loadLists() {
        setLoading(true)
        setLoadError(null)
        Promise.all([ListNPCFactions(true), ListNPCFactions(false)])
            .then(([source, sink]) => {
                setSourceList(source ?? [])
                setSinkList(sink ?? [])
                setLoaded(true)
            })
            .catch(err => setLoadError(String(err)))
            .finally(() => setLoading(false))
    }

    useEffect(() => {
        if (isActive && !loaded && !loading) {
            loadLists()
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isActive])

    function toggleExpand(isSource, id) {
        const expandedIds = isSource ? expandedSourceIds : expandedSinkIds
        const setExpandedIds = isSource ? setExpandedSourceIds : setExpandedSinkIds
        const detailById = isSource ? sourceDetailById : sinkDetailById
        const setDetailById = isSource ? setSourceDetailById : setSinkDetailById

        const next = new Set(expandedIds)
        if (next.has(id)) {
            next.delete(id)
            setExpandedIds(next)
            return
        }
        next.add(id)
        setExpandedIds(next)
        if (!(id in detailById)) {
            setDetailById(prev => ({...prev, [id]: 'loading'}))
            GetNPCFactionDetail(isSource, id)
                .then(detail => setDetailById(prev => ({...prev, [id]: detail})))
                .catch(err => setDetailById(prev => ({...prev, [id]: {error: String(err)}})))
        }
    }

    function armSource(id, name) {
        setArmedSource(prev => prev?.id === id ? null : {id, name})
    }

    function armSink(id, name) {
        setArmedSink(prev => prev?.id === id ? null : {id, name})
    }

    function clearArmed() {
        setArmedSource(null)
        setArmedSink(null)
    }

    // Full reload after a successful align/sync — an align renames a sink id (and can relocate a
    // squatter to yet another id), a content sync changes entry counts, so cached detail/expansion
    // state can't be trusted to still match reality. Reloading both lists and dropping every cache
    // is the simplest correct fix, mirroring how every other tab just re-runs its Compare* call
    // after a write rather than trying to patch cached state in place.
    function refresh() {
        setSourceDetailById({})
        setSinkDetailById({})
        setExpandedSourceIds(new Set())
        setExpandedSinkIds(new Set())
        clearArmed()
        loadLists()
    }

    return {
        sourceList, sinkList, loaded, loading, loadError,
        searchFilter, setSearchFilter, searchExact, setSearchExact,
        sortBy, setSortBy, sortDir, setSortDir,
        sourceDetailById, sinkDetailById,
        expandedSourceIds, expandedSinkIds, toggleExpand,
        armedSource, armedSink, armSource, armSink, clearArmed,
        loadLists, refresh
    }
}
