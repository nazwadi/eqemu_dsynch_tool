import NpcDetailPanel from './NpcDetailPanel';
import SpawnDetailPanel from './SpawnDetailPanel';
import GridDetailPanel from './GridDetailPanel';
import SpawnGroupDetailPanel from './SpawnGroupDetailPanel';

const detailPanelTitles = {
    spawns: 'Spawn Point Detail',
    grids: 'Grid Detail',
    spawngroups: 'Spawngroup Detail',
    npcs: 'NPC Detail'
}

// Right-hand detail panel, shared by all tabs — a thin dispatcher on activeView plus the chrome
// every tab shares (width, title bar, the spawn-help "?" button). Each tab's own content lives in
// its own component (NpcDetailPanel/SpawnDetailPanel/GridDetailPanel/SpawnGroupDetailPanel),
// mirroring the NpcsTab/SpawnsTab/GridsTab/SpawngroupsTab split those tabs already went through.
// expandedSections stays one shared state object passed down to whichever panel is active (see
// CLAUDE.md: NPC keys and spawn/grid/spawngroup keys never collide, so collapsed/expanded state
// persists per section across tab switches without extra plumbing — splitting it per panel would
// lose that).
function DetailPanel({
    activeView, setShowSpawnHelp, setShowNpcHelp, setShowSpawngroupHelp, detailWidth,
    selectedNpc, openReferenceComparison, onInspectLoot, excludedNpcFields, onToggleExcludedNpcField,
    selectedSpawnRow, selectAllSharingSpawngroup, openSyncSpawnGroupPreview, openRelocatePreview,
    onJumpToGrid,
    selectedGridRow, selectedWaypointNumber, onSelectWaypoint,
    selectedSpawnGroupRow, openSyncSpawnGroupPreviewFromSpawnGroup,
    expandedSections, setExpandedSections
}) {
    // One "?" help-drawer trigger per tab that has one — keyed the same way detailPanelTitles is,
    // so adding a tab's drawer later is a one-line addition here instead of another hand-copied
    // conditional block.
    const helpButtons = {
        npcs: {onClick: () => setShowNpcHelp(true), title: 'How references and sync scope work'},
        spawns: {onClick: () => setShowSpawnHelp(true), title: 'How spawn2, spawngroup, and spawn entries relate'},
        spawngroups: {onClick: () => setShowSpawngroupHelp(true), title: 'How this tab relates to Spawn Points, and what "ambiguous" means'}
    }
    const helpButton = helpButtons[activeView]
    return (
        <div style={{width: detailWidth, minWidth: detailWidth}} className="bg-gray-800 flex flex-col">
            <div className="flex flex-col overflow-hidden h-full">
                <div
                    className="px-3 py-2 text-xs font-medium text-gray-400 uppercase tracking-wider border-b border-gray-700 flex items-center justify-between">
                    <span>{detailPanelTitles[activeView] ?? 'Detail'}</span>
                    {helpButton && (
                        <button
                            onClick={helpButton.onClick}
                            title={helpButton.title}
                            className="w-4 h-4 flex items-center justify-center rounded-full border border-gray-600 text-gray-400 text-[10px] normal-case tracking-normal hover:border-gray-400 hover:text-white">
                            ?
                        </button>
                    )}
                </div>
                <div className="px-2 py-2 flex flex-col gap-1 text-xs overflow-y-auto flex-1">
                    {activeView === 'npcs' && (
                        <NpcDetailPanel
                            selectedNpc={selectedNpc} openReferenceComparison={openReferenceComparison}
                            onInspectLoot={onInspectLoot}
                            excludedFields={excludedNpcFields} onToggleExcludedField={onToggleExcludedNpcField}
                            expandedSections={expandedSections} setExpandedSections={setExpandedSections}
                        />
                    )}
                    {activeView === 'spawns' && (
                        <SpawnDetailPanel
                            selectedSpawnRow={selectedSpawnRow} selectAllSharingSpawngroup={selectAllSharingSpawngroup}
                            openSyncSpawnGroupPreview={openSyncSpawnGroupPreview} openRelocatePreview={openRelocatePreview}
                            onJumpToGrid={onJumpToGrid}
                            expandedSections={expandedSections} setExpandedSections={setExpandedSections}
                        />
                    )}
                    {activeView === 'grids' && (
                        <GridDetailPanel
                            selectedGridRow={selectedGridRow}
                            selectedWaypointNumber={selectedWaypointNumber} onSelectWaypoint={onSelectWaypoint}
                            expandedSections={expandedSections} setExpandedSections={setExpandedSections}
                        />
                    )}
                    {activeView === 'spawngroups' && (
                        <SpawnGroupDetailPanel
                            selectedSpawnGroupRow={selectedSpawnGroupRow}
                            openSyncSpawnGroupPreviewFromSpawnGroup={openSyncSpawnGroupPreviewFromSpawnGroup}
                            expandedSections={expandedSections} setExpandedSections={setExpandedSections}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

export default DetailPanel
