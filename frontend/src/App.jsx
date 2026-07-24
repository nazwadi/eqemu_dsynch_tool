import {useState} from 'react';
import './App.css';
import ConnectModal from './components/ConnectModal';
import ConfirmSyncModal from './components/ConfirmSyncModal';
import ConfirmSpawnSyncModal from './components/ConfirmSpawnSyncModal';
import SpawnHelpDrawer from './components/SpawnHelpDrawer';
import ReferenceDrawer from './components/ReferenceDrawer';
import FactionComparison from './components/FactionComparison';
import SpellsComparison from './components/SpellsComparison';
import MerchantComparison from './components/MerchantComparison';
import ConfirmSpawnGroupSyncModal from './components/ConfirmSpawnGroupSyncModal';
import ConfirmRelocateSpawnGroupModal from './components/ConfirmRelocateSpawnGroupModal';
import ConfirmGridSyncModal from './components/ConfirmGridSyncModal';
import ConfirmAlignIdModal from './components/ConfirmAlignIdModal';
import Sidebar from './components/Sidebar';
import NpcsTab from './components/NpcsTab';
import SpawnsTab from './components/SpawnsTab';
import TodoTab from './components/TodoTab';
import GridsTab from './components/GridsTab';
import SpawngroupsTab from './components/SpawngroupsTab';
import LootTab from './components/LootTab';
import DetailPanel from './components/DetailPanel';
import {spawnCoords, spawnRowSelectable} from './lib/spawnHelpers';
import {gridRowSelectable} from './lib/gridHelpers';
import {useUIPrefs} from './hooks/useUIPrefs';
import {useConnections} from './hooks/useConnections';
import {useReferenceDrawer} from './hooks/useReferenceDrawer';
import {useNpcSync} from './hooks/useNpcSync';
import {useTodo} from './hooks/useTodo';
import {useSpawnSync} from './hooks/useSpawnSync';
import {useSpawnGroupsTab} from './hooks/useSpawnGroupsTab';
import {useSpawnGroupSync} from './hooks/useSpawnGroupSync';
import {useRelocateSpawnGroup} from './hooks/useRelocateSpawnGroup';
import {useGridSync} from './hooks/useGridSync';
import {useLoot} from './hooks/useLoot';
import {useAlignId} from './hooks/useAlignId';

// Title shown in the shared ReferenceDrawer — one more entry per reference type as they're built,
// mirroring detailPanelTitles' shape in DetailPanel.jsx.
const referenceDrawerTitles = {
    faction: 'Faction Reference',
    spells: 'Spells Reference',
    merchant: 'Merchant Reference'
}

// App.jsx is the coordinator: each tab's own state/handlers live in their own hook
// (frontend/src/hooks/), and this component composes them, owns the zone-identity state and
// activeView (both genuinely cross-tab), wires selectZone's "reset+reload every tab" fan-out, and
// renders the layout. See CLAUDE.md's "App.jsx component/lib split" and this pass's own Repo Meta
// entry for why the persistent zone header stays inline rather than becoming its own component —
// it's a coordinator reading state from every tab, not one tab's content.
function App() {
    const uiPrefs = useUIPrefs()
    const connections = useConnections(uiPrefs)
    const referenceDrawer = useReferenceDrawer()

    const [searchFilter, setSearchFilter] = useState('')
    const [selectedZoneShortName, setSelectedZoneShortName] = useState('')
    const [selectedZoneLongName, setSelectedZoneLongName] = useState('')
    const [selectedZoneId, setSelectedZoneId] = useState(null)
    const [selectedZoneVersion, setSelectedZoneVersion] = useState(0)
    const [selectedZoneIdNumber, setSelectedZoneIdNumber] = useState(null)
    const [activeView, setActiveView] = useState('npcs') // 'npcs' | 'todo' | 'spawns' | 'grids' | 'spawngroups' | 'loot'
    const [showSpawnHelp, setShowSpawnHelp] = useState(false) // right-edge drawer explaining spawn2→spawngroup→spawn entries; see the Spawn Point Detail panel's "?" button

    const zoneIdentity = {zoneShortName: selectedZoneShortName, zoneVersion: selectedZoneVersion, zoneIdNumber: selectedZoneIdNumber}

    const npcSync = useNpcSync(zoneIdentity)
    const todo = useTodo({
        diffRows: npcSync.diffRows,
        setSelectedNpc: npcSync.setSelectedNpc, setSelectedRowKey: npcSync.setSelectedRowKey,
        setActiveView, openReferenceComparison: referenceDrawer.openReferenceComparison
    })
    const spawnSync = useSpawnSync(zoneIdentity)
    const spawnGroupsTab = useSpawnGroupsTab(zoneIdentity)
    const spawnGroupSync = useSpawnGroupSync(zoneIdentity)
    const relocateSpawnGroup = useRelocateSpawnGroup({
        ...zoneIdentity,
        onRelocated: () => {
            spawnSync.setSelectedSpawnRow(null)
            spawnSync.loadDiffs()
        }
    })
    const gridSync = useGridSync(zoneIdentity)
    const loot = useLoot()
    const alignId = useAlignId()

    // Triggered from the Loot tab's loottable-level "Align loottable ID to source" button —
    // ids are already known (anchored via the same NPC on both sides), no pairing needed.
    function alignLoottable(sourceId, sinkId) {
        alignId.openAlignPreview({target: 'loottable', sourceId, sinkId, label: 'loottable'})
    }

    // Triggered once the user has armed one row in each Loot tab column (see LootTab.jsx's
    // two-step cross-column click) — lootdrop.id has no cross-database anchor, so the pairing
    // itself is the user's own judgment call, not something this app guesses at.
    function alignLootdrop(sourceId, sinkId) {
        alignId.openAlignPreview({target: 'lootdrop', sourceId, sinkId, label: 'lootdrop'})
    }

    // Refreshes the currently-loaded Loot tab comparison after a successful align — see
    // useLoot.js's refreshWithIds for why this can't just replay the NPC row that led here
    // (npc_types.loottable_id changes in the database on a loottable-level align, but the
    // NPCs tab's cached diffRows wouldn't reflect that). Source's own id is never touched by
    // either align target; sink's becomes source's id after a loottable align, or is unchanged
    // after a lootdrop-only align (the loottable itself wasn't touched).
    function refreshLootAfterAlign() {
        if (!loot.lootComparison) return
        const sourceId = loot.lootComparison.SourceId
        const sinkId = alignId.alignTarget?.target === 'loottable' ? sourceId : loot.lootComparison.SinkId
        loot.refreshWithIds(sourceId, sinkId)
    }

    // Triggered from the npc_faction/npc_spells reference drawer's own "Align ID to source"
    // button — unlike loot, these headers have no entry-level ID-alignment need at all: their
    // Entries are keyed by the portable faction_id/spellid, not a local surrogate, so only the
    // header's own npc_faction_id/npc_spells_id ever needs realigning, same single-button shape
    // as the Loot tab's loottable-level trigger.
    function alignReferenceId(target, sourceId, sinkId) {
        alignId.openAlignPreview({target, sourceId, sinkId, label: target})
    }

    // Refreshes the currently-open reference drawer after a successful align — reuses
    // openReferenceComparison itself as the refetch (it already does "set type + fetch by raw
    // ids"), rather than needing a new hook function the way useLoot.js's refreshWithIds was —
    // openReferenceComparison already takes ids directly, it never needed an NPC row to derive
    // them from in the first place.
    function refreshReferenceAfterAlign() {
        if (!referenceDrawer.referenceDrawerData) return
        const sourceId = referenceDrawer.referenceDrawerData.SourceId
        referenceDrawer.openReferenceComparison(referenceDrawer.referenceDrawerType, sourceId, sourceId)
    }

    // Single dispatch point for ConfirmAlignIdModal's executeAlign callback — which "currently
    // loaded view" needs refreshing depends entirely on which target was just aligned.
    function refreshAfterAlign() {
        const target = alignId.alignTarget?.target
        if (target === 'lootdrop' || target === 'loottable') {
            refreshLootAfterAlign()
        } else if (target === 'npc_faction' || target === 'npc_spells') {
            refreshReferenceAfterAlign()
        }
    }

    // Triggered from the NPC detail panel's References section — loottable_id is clickable like
    // the other three reference fields, but jumps to the Loot tab with this NPC's comparison
    // preloaded instead of opening the shared drawer (see referenceNavigationTypes in
    // lib/npcHelpers.js for why loot doesn't use the drawer). Reuses lookupLootByNpc as-is — it
    // already takes an NPC diff row directly, the same shape npcSync.selectedNpc already is.
    function jumpToLoot() {
        setActiveView('loot')
        loot.lookupLootByNpc(npcSync.selectedNpc)
    }

    // Triggered from the Spawn Points detail panel's per-row action — wraps the shared opener with
    // the coordinate/entries extraction specific to a SpawnDiffRow shape, and refreshes the Spawn
    // Points tab's own selection/diff-list on success.
    function openSyncSpawnGroupPreviewFromSpawn(row) {
        spawnGroupSync.openPreview(spawnCoords(row), {source: row.Source?.SpawnEntries, sink: row.Sink?.SpawnEntries}, () => {
            spawnSync.setSelectedSpawnRow(null)
            spawnSync.loadDiffs()
        })
    }

    // Triggered from the Spawngroups tab's own row action — same shared opener, extraction
    // specific to a SpawnGroupDiffRow shape (SampleCoord/SourceSpawnEntries/SinkSpawnEntries live
    // directly on it), refreshing that tab's own selection/diff-list on success instead.
    function openSyncSpawnGroupPreviewFromSpawnGroup(row) {
        spawnGroupSync.openPreview(row.SampleCoord, {source: row.SourceSpawnEntries, sink: row.SinkSpawnEntries}, () => {
            spawnGroupsTab.setSelectedSpawnGroupRow(null)
            spawnGroupsTab.loadDiffs()
        })
    }

    // Resets every tab's selection/preview state and kicks off every tab's diff — kept here (not
    // in Sidebar) since it's genuine cross-cutting business logic touching every tab's own hook,
    // not something a presentational sidebar component should own. Each hook owns what "reset for
    // a new zone" actually means for its own domain (see each hook's onZoneChange).
    function selectZone(zone) {
        setSelectedZoneShortName(zone.ShortName)
        setSelectedZoneLongName(zone.LongName)
        setSelectedZoneId(zone.Id)
        setSelectedZoneVersion(zone.Version)
        setSelectedZoneIdNumber(zone.ZoneIdNumber)
        npcSync.onZoneChange(zone)
        spawnSync.onZoneChange(zone)
        gridSync.onZoneChange(zone)
        spawnGroupsTab.onZoneChange(zone)
        loot.resetForZoneChange()
    }

    const newCount = npcSync.diffRows.filter(r => r.Status === 'new').length
    const removedCount = npcSync.diffRows.filter(r => r.Status === 'removed').length
    const modifiedCount = npcSync.diffRows.filter(r => r.Status === 'modified').length
    // Matches the Spawns tab badge's semantics (new+modified, i.e. "needs a look"), not
    // diffRows.length — otherwise this number would count "removed"/"match" rows too, which
    // aren't actionable and are already visible via the +/~/- badges when this tab is active.
    const npcActionableCount = newCount + modifiedCount
    const selectableRows = npcSync.diffRows.filter(row => npcSync.diffFilter === 'all' || row.Status !== 'match')
    const zoneTodoItems = todo.todoItems.filter(t => t.ZoneName === selectedZoneShortName && t.ZoneVersion === selectedZoneVersion)
    const openZoneTodoCount = zoneTodoItems.filter(t => !t.Dismissed).length
    const spawnNewCount = spawnSync.spawnDiffRows?.filter(r => r.Status === 'new').length
    const spawnModifiedCount = spawnSync.spawnDiffRows?.filter(r => r.Status === 'modified').length
    const spawnRemovedCount = spawnSync.spawnDiffRows?.filter(r => r.Status === 'removed').length
    const selectableSpawnRows = spawnSync.spawnDiffRows?.filter(spawnRowSelectable)
    // SpawnEntriesDiffer can be true on a "match"-status row (its own spawn2 fields match, only its spawn
    // entries differ) — invisible in the +/~/- badges above, which only count new/modified/removed.
    // Counted separately so a zone with only entry-level drift doesn't look clean at a glance.
    const spawnEntriesDifferCount = spawnSync.spawnDiffRows?.filter(r => r.SpawnEntriesDiffer).length
    // Mirrors npcActionableCount's semantics ("how much differs", not "how much is auto-syncable")
    // so the two tab badges answer the same kind of question — includes match-status rows whose
    // spawn entries differ, since those need a human's attention just as much as a "modified" row.
    const spawnNeedsAttentionCount = spawnSync.spawnDiffRows?.filter(r => (r.Status !== 'match' && r.Status !== 'removed') || r.SpawnEntriesDiffer).length
    const gridNewCount = gridSync.gridDiffRows.filter(r => r.Status === 'new').length
    const gridModifiedCount = gridSync.gridDiffRows.filter(r => r.Status === 'modified').length
    const gridRemovedCount = gridSync.gridDiffRows.filter(r => r.Status === 'removed').length
    const selectableGridRows = gridSync.gridDiffRows.filter(gridRowSelectable)
    const spawnGroupNewCount = spawnGroupsTab.spawnGroupDiffRows.filter(r => r.Status === 'new').length
    const spawnGroupModifiedCount = spawnGroupsTab.spawnGroupDiffRows.filter(r => r.Status === 'modified').length
    const spawnGroupRemovedCount = spawnGroupsTab.spawnGroupDiffRows.filter(r => r.Status === 'removed').length
    const spawnGroupAmbiguousCount = spawnGroupsTab.spawnGroupDiffRows.filter(r => r.Status === 'ambiguous').length
    // "new"/"removed" spawngroup rows are display-only (see spawnGroupRowSelectable — a "new"
    // spawngroup has no sink spawn2 location to attach to yet, same reason "new" spawn2 rows in
    // the Spawn Points tab work the other way instead), so this badge counts anything worth a
    // look (new/modified/ambiguous), not just what's currently syncable — same "actionable, not
    // auto-syncable" semantics as npcActionableCount/spawnNeedsAttentionCount above.
    const spawnGroupNeedsAttentionCount = spawnGroupsTab.spawnGroupDiffRows.filter(r => r.Status !== 'match' && r.Status !== 'removed').length

    // Variables for npc_types detail view — one shared object across NPC keys (identity, combat,
    // ...) and spawn/grid/spawngroup keys precisely because they never collide, so collapsed/
    // expanded state persists per section across tab switches without extra plumbing (see
    // DetailPanel.jsx's own comment).
    const [expandedSections, setExpandedSections] = useState({
        identity: true,
        combat: true,
        resistances: false,
        ability_scores: false,
        behavior: false,
        references: true,
        spawn_behavior: true,
        spawn_entries: true
    })
    return (
        <div id="App" className="h-screen bg-gray-900 text-white overflow-hidden flex flex-col">
            <ConnectModal
                activeModal={connections.activeModal} setActiveModal={connections.setActiveModal}
                connectError={connections.connectError} setConnectError={connections.setConnectError}
                connecting={connections.connecting} connect={connections.connect}
                sourceHost={connections.sourceHost} setSourceHost={connections.setSourceHost}
                sourcePort={connections.sourcePort} setSourcePort={connections.setSourcePort}
                sourceUsername={connections.sourceUsername} setSourceUsername={connections.setSourceUsername}
                sourcePassword={connections.sourcePassword} setSourcePassword={connections.setSourcePassword}
                dbSourceName={connections.dbSourceName} setDbSourceName={connections.setDbSourceName}
                sinkHost={connections.sinkHost} setSinkHost={connections.setSinkHost}
                sinkPort={connections.sinkPort} setSinkPort={connections.setSinkPort}
                sinkUsername={connections.sinkUsername} setSinkUsername={connections.setSinkUsername}
                sinkPassword={connections.sinkPassword} setSinkPassword={connections.setSinkPassword}
                dbSinkName={connections.dbSinkName} setDbSinkName={connections.setDbSinkName}
                ssh={connections.activeModal === 'source' ? connections.sourceSsh : connections.sinkSsh}
                setSsh={connections.activeModal === 'source' ? connections.setSourceSsh : connections.setSinkSsh}
            />
            <ConfirmSyncModal
                showSyncConfirm={npcSync.showSyncConfirm} setShowSyncConfirm={npcSync.setShowSyncConfirm}
                dbSinkName={connections.dbSinkName} syncPreview={npcSync.syncPreview}
                executeSync={() => npcSync.executeSync(todo.refreshTodoItems)}
            />
            <ConfirmSpawnSyncModal
                showSpawnSyncConfirm={spawnSync.showSpawnSyncConfirm} setShowSpawnSyncConfirm={spawnSync.setShowSpawnSyncConfirm}
                dbSinkName={connections.dbSinkName} spawnSyncPreview={spawnSync.spawnSyncPreview} executeSpawnSync={spawnSync.executeSpawnSync}
            />
            <SpawnHelpDrawer showSpawnHelp={showSpawnHelp} setShowSpawnHelp={setShowSpawnHelp}/>
            {/* Shared reference comparison drawer — title/content dispatch on referenceDrawerType. */}
            <ReferenceDrawer
                open={referenceDrawer.showReferenceDrawer}
                onClose={() => referenceDrawer.setShowReferenceDrawer(false)}
                title={referenceDrawerTitles[referenceDrawer.referenceDrawerType] ?? 'Reference'}>
                {referenceDrawer.referenceDrawerType === 'faction' && (
                    <FactionComparison comparison={referenceDrawer.referenceDrawerData}
                                       onAlign={(sourceId, sinkId) => alignReferenceId('npc_faction', sourceId, sinkId)}/>
                )}
                {referenceDrawer.referenceDrawerType === 'spells' && (
                    <SpellsComparison comparison={referenceDrawer.referenceDrawerData}
                                       onAlign={(sourceId, sinkId) => alignReferenceId('npc_spells', sourceId, sinkId)}/>
                )}
                {referenceDrawer.referenceDrawerType === 'merchant' && <MerchantComparison comparison={referenceDrawer.referenceDrawerData}/>}
            </ReferenceDrawer>
            <ConfirmSpawnGroupSyncModal
                showSpawnGroupSyncConfirm={spawnGroupSync.showSpawnGroupSyncConfirm}
                setShowSpawnGroupSyncConfirm={spawnGroupSync.setShowSpawnGroupSyncConfirm}
                spawnGroupSyncError={spawnGroupSync.spawnGroupSyncError}
                spawnGroupSyncPreview={spawnGroupSync.spawnGroupSyncPreview}
                sourceEntries={spawnGroupSync.spawnGroupSyncEntries.source} sinkEntries={spawnGroupSync.spawnGroupSyncEntries.sink}
                syncingSpawnGroup={spawnGroupSync.syncingSpawnGroup}
                executeSyncSpawnGroup={spawnGroupSync.executeSyncSpawnGroup}
                dbSinkName={connections.dbSinkName}
            />
            <ConfirmRelocateSpawnGroupModal
                showRelocateConfirm={relocateSpawnGroup.showRelocateConfirm} setShowRelocateConfirm={relocateSpawnGroup.setShowRelocateConfirm}
                relocateError={relocateSpawnGroup.relocateError} relocatePreview={relocateSpawnGroup.relocatePreview}
                relocating={relocateSpawnGroup.relocating} executeRelocate={relocateSpawnGroup.executeRelocate}
                dbSinkName={connections.dbSinkName}
            />
            <ConfirmGridSyncModal
                showGridSyncConfirm={gridSync.showGridSyncConfirm} setShowGridSyncConfirm={gridSync.setShowGridSyncConfirm}
                dbSinkName={connections.dbSinkName} gridSyncPreview={gridSync.gridSyncPreview} executeGridSync={gridSync.executeGridSync}
            />
            <ConfirmAlignIdModal
                showAlignConfirm={alignId.showAlignConfirm} setShowAlignConfirm={alignId.setShowAlignConfirm}
                alignError={alignId.alignError} alignPreview={alignId.alignPreview} alignTarget={alignId.alignTarget}
                aligning={alignId.aligning}
                executeAlign={() => alignId.executeAlign(refreshAfterAlign)}
                dbSinkName={connections.dbSinkName}
            />
            <div className="flex flex-1 min-h-0">
                {uiPrefs.sidebarCollapsed ? (
                    <button
                        onClick={() => {
                            uiPrefs.setSidebarCollapsed(false)
                            connections.persistUIPrefs({SidebarCollapsed: false})
                        }}
                        title="Show sidebar"
                        className="w-5 bg-gray-900 hover:bg-gray-800 border-r border-gray-700 flex items-center justify-center text-gray-500 hover:text-yellow-400 cursor-pointer flex-shrink-0 text-base leading-none">
                        ›
                    </button>
                ) : (
                    <>
                        <Sidebar
                            sourceConnected={connections.sourceConnected} sourceHost={connections.sourceHost}
                            sinkConnected={connections.sinkConnected} sinkHost={connections.sinkHost}
                            setActiveModal={connections.setActiveModal} setConnectError={connections.setConnectError}
                            searchFilter={searchFilter} setSearchFilter={setSearchFilter}
                            showSyncPreview={npcSync.showSyncPreview} showSpawnSyncPreview={spawnSync.showSpawnSyncPreview}
                            zones={connections.zones} selectedZoneId={selectedZoneId} onSelectZone={selectZone}
                            width={uiPrefs.sidebarWidth}
                        />
                        {/* Sidebar resize/collapse handle — mirrors the detail panel's drag handle, but
                            dragging right (not left) grows this one since it's on the opposite edge.
                            The toggle button is a normal (non-absolute) flex child, deliberately not
                            absolutely-positioned-and-centered over the thin bar — that approach clipped
                            unpredictably depending on the surrounding stacking context. As a flex child
                            wider than its 8px parent, it just overflows visibly on both sides instead. */}
                        <div
                            className="w-2 bg-gray-700 hover:bg-yellow-400 cursor-col-resize flex-shrink-0 flex items-center justify-center"
                            onMouseDown={(e) => {
                                e.preventDefault()
                                const startX = e.clientX
                                const startWidth = uiPrefs.sidebarWidth
                                // Tracked locally (not read back from state) because onMouseUp's
                                // closure captures whatever sidebarWidth was at drag-start — by the
                                // time the drag ends, several setSidebarWidth calls have happened
                                // but this closure was never re-created to see the latest one.
                                let finalWidth = startWidth
                                const onMouseMove = (e) => {
                                    const delta = e.clientX - startX
                                    finalWidth = Math.max(160, Math.min(500, startWidth + delta))
                                    uiPrefs.setSidebarWidth(finalWidth)
                                }
                                const onMouseUp = () => {
                                    window.removeEventListener('mousemove', onMouseMove)
                                    window.removeEventListener('mouseup', onMouseUp)
                                    connections.persistUIPrefs({SidebarWidth: finalWidth})
                                }
                                window.addEventListener('mousemove', onMouseMove)
                                window.addEventListener('mouseup', onMouseUp)
                            }}
                        >
                            <button
                                onClick={() => {
                                    uiPrefs.setSidebarCollapsed(true)
                                    connections.persistUIPrefs({SidebarCollapsed: true})
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                title="Hide sidebar"
                                className="w-5 h-8 flex items-center justify-center bg-gray-600 hover:bg-yellow-400 border border-gray-500 hover:border-yellow-400 rounded shadow-sm text-gray-200 hover:text-gray-900 text-sm leading-none cursor-pointer">
                                ‹
                            </button>
                        </div>
                    </>
                )}
                {/* Header + content row are wrapped together so the header's own width is
                    independent of whether the detail panel column is currently rendered below it —
                    otherwise switching to the TODO tab (which hides the detail panel to reclaim
                    space, see the conditional near the bottom of this row) would widen this whole
                    wrapper and visibly shift the tab-switcher buttons to the right on every switch,
                    even though nothing about the window itself changed size. */}
                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Persistent zone header - never slides, and its width never changes either */}
                    <div
                        className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 flex items-center gap-3">
                        {selectedZoneLongName} - {selectedZoneShortName}
                        {selectedZoneShortName && (
                            <span className="text-gray-500">(zone {selectedZoneIdNumber}, v{selectedZoneVersion})</span>
                        )}
                        {activeView === 'npcs' && npcSync.diffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{newCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{modifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{removedCount}</span>
                        </>}
                        {activeView === 'spawns' && spawnSync.spawnDiffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{spawnNewCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{spawnModifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{spawnRemovedCount}</span>
                            {spawnEntriesDifferCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400"
                                      title="Spawn entries differ from source, including locations whose own spawn2 fields otherwise match">
                                    ⚠{spawnEntriesDifferCount}
                                </span>
                            )}
                        </>}
                        {activeView === 'grids' && gridSync.gridDiffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{gridNewCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{gridModifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{gridRemovedCount}</span>
                        </>}
                        {activeView === 'spawngroups' && spawnGroupsTab.spawnGroupDiffRows.length > 0 && <>
                            <span className="px-2 py-0.5 rounded bg-green-950 text-green-400">+{spawnGroupNewCount}</span>
                            <span className="px-2 py-0.5 rounded bg-yellow-950 text-yellow-400">~{spawnGroupModifiedCount}</span>
                            <span className="px-2 py-0.5 rounded bg-red-950 text-red-400">-{spawnGroupRemovedCount}</span>
                            {spawnGroupAmbiguousCount > 0 && (
                                <span className="px-2 py-0.5 rounded bg-amber-950 text-amber-400"
                                      title="Source spawngroup's member locations resolved to more than one sink spawngroup — flagged for manual review, not guessed">
                                    ⚠{spawnGroupAmbiguousCount}
                                </span>
                            )}
                        </>}
                        {activeView === 'npcs' && (
                            <>
                                <button
                                    disabled={npcSync.selectedNPCs.size === 0 || npcSync.showSyncPreview}
                                    className={`px-3 py-1 rounded text-xs font-medium ${
                                        npcSync.selectedNPCs.size > 0 && !npcSync.showSyncPreview
                                            ? 'bg-yellow-400 text-gray-900 cursor-pointer hover:bg-yellow-300'
                                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                    }`}
                                    onClick={() => {
                                        npcSync.setShowSyncPreview(true)
                                        npcSync.setSyncPreview(null)
                                        npcSync.setSyncOutcome(null)
                                        npcSync.runSync(true).then(npcSync.setSyncPreview).catch(err => npcSync.setSyncPreview({Errors: [String(err)]}))
                                    }}
                                >
                                    {npcSync.selectedNPCs.size > 0 ? `Sync ${npcSync.selectedNPCs.size} NPCs` : 'Sync NPCs'}
                                </button>
                            </>
                        )}
                        {activeView === 'spawns' && (
                            <button
                                disabled={spawnSync.selectedSpawnKeys.size === 0 || spawnSync.showSpawnSyncPreview}
                                className={`px-3 py-1 rounded text-xs font-medium ${
                                    spawnSync.selectedSpawnKeys.size > 0 && !spawnSync.showSpawnSyncPreview
                                        ? 'bg-yellow-400 text-gray-900 cursor-pointer hover:bg-yellow-300'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                                onClick={() => {
                                    spawnSync.setShowSpawnSyncPreview(true)
                                    spawnSync.setSpawnSyncPreview(null)
                                    spawnSync.setSpawnSyncOutcome(null)
                                    spawnSync.runSpawnSync(true).then(spawnSync.setSpawnSyncPreview).catch(err => spawnSync.setSpawnSyncPreview({Errors: [String(err)]}))
                                }}
                            >
                                {spawnSync.selectedSpawnKeys.size > 0 ? `Sync ${spawnSync.selectedSpawnKeys.size} Spawn Points` : 'Sync Spawn Points'}
                            </button>
                        )}
                        {activeView === 'grids' && (
                            <button
                                disabled={gridSync.selectedGridIds.size === 0 || gridSync.showGridSyncPreview}
                                className={`px-3 py-1 rounded text-xs font-medium ${
                                    gridSync.selectedGridIds.size > 0 && !gridSync.showGridSyncPreview
                                        ? 'bg-yellow-400 text-gray-900 cursor-pointer hover:bg-yellow-300'
                                        : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                }`}
                                onClick={() => {
                                    gridSync.setShowGridSyncPreview(true)
                                    gridSync.setGridSyncPreview(null)
                                    gridSync.setGridSyncOutcome(null)
                                    gridSync.runGridSync(true).then(gridSync.setGridSyncPreview).catch(err => gridSync.setGridSyncPreview({Errors: [String(err)]}))
                                }}
                            >
                                {gridSync.selectedGridIds.size > 0 ? `Sync ${gridSync.selectedGridIds.size} Grids` : 'Sync Grids'}
                            </button>
                        )}
                        <div className="ml-auto flex items-center gap-2">
                            <button
                                onClick={() => setActiveView('npcs')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'npcs' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                NPCs{npcActionableCount > 0 && ` (${npcActionableCount})`}
                            </button>
                            <button
                                onClick={() => setActiveView('spawns')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'spawns' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                Spawn Points{spawnNeedsAttentionCount > 0 && ` (${spawnNeedsAttentionCount})`}
                            </button>
                            <button
                                onClick={() => setActiveView('spawngroups')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'spawngroups' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                Spawngroups{spawnGroupNeedsAttentionCount > 0 && ` (${spawnGroupNeedsAttentionCount})`}
                            </button>
                            <button
                                onClick={() => setActiveView('grids')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'grids' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                Grids{selectableGridRows.length > 0 && ` (${selectableGridRows.length})`}
                            </button>
                            <button
                                onClick={() => setActiveView('loot')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'loot' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                Loot
                            </button>
                            <button
                                onClick={() => setActiveView('todo')}
                                className={`px-2 py-1 rounded text-xs border ${activeView === 'todo' ? 'border-yellow-400 text-yellow-400' : 'border-gray-600 text-gray-400 hover:border-gray-400'}`}>
                                TODO{openZoneTodoCount > 0 && ` (${openZoneTodoCount})`}
                            </button>
                        </div>
                    </div>

                    {/* Tab content + detail panel share this row; the header above is a sibling of
                        this row (not a child of #input), so its width doesn't depend on whether
                        the detail panel is rendered inside this row. */}
                    <div className="flex flex-1 min-h-0">
                    <div id="input" className="w-1/2 flex flex-1 flex-col overflow-hidden">
                    {/* Sliding content area (NPCs tab) */}
                    {activeView === 'npcs' && (
                        <NpcsTab
                            diffRows={npcSync.diffRows} diffLoading={npcSync.diffLoading}
                            diffFilter={npcSync.diffFilter} setDiffFilter={npcSync.setDiffFilter}
                            npcSearchFilter={npcSync.npcSearchFilter} setNpcSearchFilter={npcSync.setNpcSearchFilter}
                            sortBy={npcSync.sortBy} setSortBy={npcSync.setSortBy} sortDir={npcSync.sortDir} setSortDir={npcSync.setSortDir}
                            selectableRows={selectableRows}
                            selectedNPCs={npcSync.selectedNPCs} setSelectedNPCs={npcSync.setSelectedNPCs}
                            selectedRowKey={npcSync.selectedRowKey} setSelectedRowKey={npcSync.setSelectedRowKey}
                            setSelectedNpc={npcSync.setSelectedNpc}
                            dbSourceName={connections.dbSourceName} dbSinkName={connections.dbSinkName}
                            selectedZoneShortName={selectedZoneShortName}
                            showSyncPreview={npcSync.showSyncPreview} setShowSyncPreview={npcSync.setShowSyncPreview}
                            syncPreview={npcSync.syncPreview} syncing={npcSync.syncing} syncOutcome={npcSync.syncOutcome}
                            setShowSyncConfirm={npcSync.setShowSyncConfirm}
                        />
                    )}

                    {/* TODO view */}
                    {activeView === 'todo' && (
                        <TodoTab
                            selectedZoneShortName={selectedZoneShortName}
                            zoneTodoItems={zoneTodoItems}
                            showDismissedTodos={todo.showDismissedTodos} setShowDismissedTodos={todo.setShowDismissedTodos}
                            openTodoItem={todo.openTodoItem} toggleTodoDismissed={todo.toggleTodoDismissed}
                        />
                    )}

                    {/* Spawns view */}
                    {activeView === 'spawns' && (
                        <SpawnsTab
                            spawnDiffRows={spawnSync.spawnDiffRows} spawnDiffLoading={spawnSync.spawnDiffLoading}
                            spawnDiffFilter={spawnSync.spawnDiffFilter} setSpawnDiffFilter={spawnSync.setSpawnDiffFilter}
                            spawnSearchFilter={spawnSync.spawnSearchFilter} setSpawnSearchFilter={spawnSync.setSpawnSearchFilter}
                            spawnSortBy={spawnSync.spawnSortBy} setSpawnSortBy={spawnSync.setSpawnSortBy}
                            spawnSortDir={spawnSync.spawnSortDir} setSpawnSortDir={spawnSync.setSpawnSortDir}
                            selectableSpawnRows={selectableSpawnRows}
                            selectedSpawnKeys={spawnSync.selectedSpawnKeys} setSelectedSpawnKeys={spawnSync.setSelectedSpawnKeys}
                            selectedSpawnRow={spawnSync.selectedSpawnRow} setSelectedSpawnRow={spawnSync.setSelectedSpawnRow}
                            dbSourceName={connections.dbSourceName} dbSinkName={connections.dbSinkName}
                            selectedZoneShortName={selectedZoneShortName}
                            showSpawnSyncPreview={spawnSync.showSpawnSyncPreview} setShowSpawnSyncPreview={spawnSync.setShowSpawnSyncPreview}
                            spawnSyncPreview={spawnSync.spawnSyncPreview} spawnSyncing={spawnSync.spawnSyncing} spawnSyncOutcome={spawnSync.spawnSyncOutcome}
                            setShowSpawnSyncConfirm={spawnSync.setShowSpawnSyncConfirm}
                        />
                    )}

                    {/* Grids view */}
                    {activeView === 'grids' && (
                        <GridsTab
                            gridDiffRows={gridSync.gridDiffRows} gridDiffLoading={gridSync.gridDiffLoading}
                            gridDiffFilter={gridSync.gridDiffFilter} setGridDiffFilter={gridSync.setGridDiffFilter}
                            selectedGridIds={gridSync.selectedGridIds} setSelectedGridIds={gridSync.setSelectedGridIds}
                            selectedGridRow={gridSync.selectedGridRow} setSelectedGridRow={gridSync.setSelectedGridRow}
                            selectedZoneShortName={selectedZoneShortName}
                            showGridSyncPreview={gridSync.showGridSyncPreview} setShowGridSyncPreview={gridSync.setShowGridSyncPreview}
                            gridSyncPreview={gridSync.gridSyncPreview} gridSyncing={gridSync.gridSyncing} gridSyncOutcome={gridSync.gridSyncOutcome}
                            setShowGridSyncConfirm={gridSync.setShowGridSyncConfirm}
                        />
                    )}

                    {/* Spawngroups view */}
                    {activeView === 'spawngroups' && (
                        <SpawngroupsTab
                            spawnGroupDiffRows={spawnGroupsTab.spawnGroupDiffRows} spawnGroupDiffLoading={spawnGroupsTab.spawnGroupDiffLoading}
                            spawnGroupDiffFilter={spawnGroupsTab.spawnGroupDiffFilter} setSpawnGroupDiffFilter={spawnGroupsTab.setSpawnGroupDiffFilter}
                            selectedSpawnGroupRow={spawnGroupsTab.selectedSpawnGroupRow} setSelectedSpawnGroupRow={spawnGroupsTab.setSelectedSpawnGroupRow}
                            selectedZoneShortName={selectedZoneShortName}
                        />
                    )}

                    {/* Loot view */}
                    {activeView === 'loot' && (
                        <LootTab
                            diffRows={npcSync.diffRows}
                            lootSearchFilter={loot.lootSearchFilter} setLootSearchFilter={loot.setLootSearchFilter}
                            lootRawSide={loot.lootRawSide} setLootRawSide={loot.setLootRawSide}
                            lootRawId={loot.lootRawId} setLootRawId={loot.setLootRawId}
                            lootComparison={loot.lootComparison} lootLoading={loot.lootLoading} lootError={loot.lootError}
                            onSelectNpc={loot.lookupLootByNpc} onLookupRawId={loot.lookupLootByRawId}
                            dbSourceName={connections.dbSourceName} dbSinkName={connections.dbSinkName}
                            selectedZoneShortName={selectedZoneShortName}
                            onAlignLoottable={alignLoottable} onAlignLootdrop={alignLootdrop}
                        />
                    )}
                    </div>
                    {/* Drag handle + detail panel are omitted entirely on the TODO and Loot tabs —
                        neither has corresponding detail-panel content (Loot's two-column tree
                        already shows everything inline), so hiding both lets the center panel
                        reclaim that width instead of it sitting idle. This only affects the
                        content row's width, not the header's — see the wrapper comment above. */}
                    {activeView !== 'todo' && activeView !== 'loot' && (
                        <>
                            <div
                                className="w-1 bg-gray-700 hover:bg-yellow-400 cursor-col-resize"
                                onMouseDown={(e) => {
                                    e.preventDefault()
                                    const startX = e.clientX
                                    const startWidth = uiPrefs.detailWidth
                                    let finalWidth = startWidth
                                    const onMouseMove = (e) => {
                                        const delta = startX - e.clientX
                                        finalWidth = Math.max(180, Math.min(600, startWidth + delta))
                                        uiPrefs.setDetailWidth(finalWidth)
                                    }
                                    const onMouseUp = () => {
                                        window.removeEventListener('mousemove', onMouseMove)
                                        window.removeEventListener('mouseup', onMouseUp)
                                        connections.persistUIPrefs({DetailWidth: finalWidth})
                                    }
                                    window.addEventListener('mousemove', onMouseMove)
                                    window.addEventListener('mouseup', onMouseUp)
                                }}
                            />
                            {/* Detail panel (NPC / Spawn Point / Grid, depending on active tab) */}
                            <DetailPanel
                                activeView={activeView} setShowSpawnHelp={setShowSpawnHelp} detailWidth={uiPrefs.detailWidth}
                                selectedNpc={npcSync.selectedNpc}
                                selectedSpawnRow={spawnSync.selectedSpawnRow}
                                selectAllSharingSpawngroup={spawnSync.selectAllSharingSpawngroup}
                                openSyncSpawnGroupPreview={openSyncSpawnGroupPreviewFromSpawn}
                                openRelocatePreview={relocateSpawnGroup.openRelocatePreview}
                                selectedGridRow={gridSync.selectedGridRow}
                                selectedSpawnGroupRow={spawnGroupsTab.selectedSpawnGroupRow}
                                openSyncSpawnGroupPreviewFromSpawnGroup={openSyncSpawnGroupPreviewFromSpawnGroup}
                                openReferenceComparison={referenceDrawer.openReferenceComparison}
                                onInspectLoot={jumpToLoot}
                                expandedSections={expandedSections} setExpandedSections={setExpandedSections}
                            />
                        </>
                    )}
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
