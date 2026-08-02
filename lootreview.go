package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

// LootReviewMark is one "I've finished reviewing this NPC's loot" flag in the Loot tab — the
// user's own workflow: "as I update each one, I can determine that I think I'm 'done' working on
// that npc in the list." Persisted the same way TODOItem's dismiss state is (see todo.go), so a
// mark survives an app restart the same way a dismissed TODO does — working through a zone's full
// NPC list is realistically a multi-session task, not something to lose on relaunch.
//
// Identity is (ZoneShortName, ZoneVersion, NPCID) — the same zone-scoping TODOItem uses and for
// the same reason: the same npc_types.id could in principle turn up via a different zone's
// discovery pass (see the quest-spawned ID-range fallback in GetNPCsForZone), so "reviewed" means
// "reviewed in the context of this zone," not just "this NPC id, anywhere."
//
// Unlike TODOItem, there's no separate Dismissed bool — presence in the persisted list IS the
// mark. Toggling off removes the entry outright rather than leaving a Reviewed:false shell around;
// there's no equivalent of a TODO's own history worth keeping once un-marked, so nothing is lost
// by just deleting the entry.
type LootReviewMark struct {
	ZoneShortName string
	ZoneVersion   int8
	NPCID         int64
}

func lootReviewPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "eqemu-sync", "loot_review.json"), nil
}

// LoadLootReviewMarks returns every NPC currently marked complete, across every zone — the
// frontend filters down to the active zone itself, the same "load the whole small archive once,
// filter client-side" shape LoadTODOItems already uses. Empty (not an error) if the file doesn't
// exist yet, since "nothing marked yet" isn't a failure.
func (a *App) LoadLootReviewMarks() ([]LootReviewMark, error) {
	path, err := lootReviewPath()
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var marks []LootReviewMark
	if err := json.Unmarshal(data, &marks); err != nil {
		return nil, err
	}
	return marks, nil
}

// SetLootReviewMark toggles one NPC's "marked complete" flag on or off within one zone.
// reviewed=true adds the mark if it isn't already present (a no-op if it is); reviewed=false
// removes it if present. No separate item ID to manage the way SetTODOItemDismissed needs one —
// (zone, version, npcId) is already a unique key on its own.
func (a *App) SetLootReviewMark(zoneShortName string, zoneVersion int8, npcId int64, reviewed bool) error {
	path, err := lootReviewPath()
	if err != nil {
		return err
	}
	var marks []LootReviewMark
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &marks)
	}

	idx := -1
	for i, m := range marks {
		if m.ZoneShortName == zoneShortName && m.ZoneVersion == zoneVersion && m.NPCID == npcId {
			idx = i
			break
		}
	}

	if reviewed {
		if idx == -1 {
			marks = append(marks, LootReviewMark{ZoneShortName: zoneShortName, ZoneVersion: zoneVersion, NPCID: npcId})
		}
	} else if idx != -1 {
		marks = append(marks[:idx], marks[idx+1:]...)
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.Marshal(marks)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}
