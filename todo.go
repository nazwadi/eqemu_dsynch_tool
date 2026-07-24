package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

type TODOItem struct {
	ID          int64  // stable identity, assigned/backfilled by appendTODOItems — needed to dismiss one specific item
	Dismissed   bool   // archived, not deleted — hidden from the default view, recoverable
	Type        string // "loottable", "faction", "spells"
	SourceID    int64
	SinkID      int64
	NPCID       int64
	NPCName     string
	ZoneName    string
	ZoneVersion int8 // zone.version — ZoneName alone isn't unique, same reason GetNPCsForZone needs it
}

func todoPath() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "eqemu-sync", "todo.json"), nil
}

// todoDedupKey identifies "the same underlying thing to review" — zone/version isn't part of
// it deliberately: a shared loot/faction/spells reference doesn't stop being the same review
// item just because it was discovered via a different zone's sync.
type todoDedupKey struct {
	Type     string
	NPCID    int64
	SourceID int64
}

// appendTODOItems merges newly-found items into the persisted archive rather than blindly
// appending. Two things it must not do: duplicate an item that's already there (re-syncing the
// same NPC would otherwise double up its TODOs forever), and never touch Dismissed on an
// existing item — a re-sync shouldn't silently un-archive something already reviewed. It also
// backfills ID on any pre-existing entries written before ID existed, since without a stable ID
// there's nothing for SetTODOItemDismissed to target.
func appendTODOItems(items []TODOItem) error {
	if len(items) == 0 {
		return nil
	}
	path, err := todoPath()
	if err != nil {
		return err
	}
	var existing []TODOItem
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &existing)
	}

	var nextID int64 = 1
	seen := make(map[todoDedupKey]bool, len(existing))
	for _, item := range existing {
		if item.ID >= nextID {
			nextID = item.ID + 1
		}
		seen[todoDedupKey{item.Type, item.NPCID, item.SourceID}] = true
	}
	for i := range existing {
		if existing[i].ID == 0 {
			existing[i].ID = nextID
			nextID++
		}
	}

	for _, item := range items {
		key := todoDedupKey{item.Type, item.NPCID, item.SourceID}
		if seen[key] {
			continue
		}
		item.ID = nextID
		nextID++
		existing = append(existing, item)
		seen[key] = true
	}

	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}
	data, err := json.Marshal(existing)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0644)
}

// LoadTODOItems returns the full persisted TODO archive, dismissed items included — the
// frontend filters for display. Returns an empty (not nil-error) list if the file doesn't exist
// yet, since "no TODOs recorded" isn't a failure.
func (a *App) LoadTODOItems() ([]TODOItem, error) {
	path, err := todoPath()
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
	var items []TODOItem
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, err
	}
	return items, nil
}

// SetTODOItemDismissed archives or un-archives one TODO item by ID. Archiving never deletes —
// same "recoverable, not destructive" principle used everywhere else in this app.
func (a *App) SetTODOItemDismissed(id int64, dismissed bool) error {
	path, err := todoPath()
	if err != nil {
		return err
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	var items []TODOItem
	if err := json.Unmarshal(data, &items); err != nil {
		return err
	}
	found := false
	for i := range items {
		if items[i].ID == id {
			items[i].Dismissed = dismissed
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("TODO item %d not found", id)
	}
	updated, err := json.Marshal(items)
	if err != nil {
		return err
	}
	return os.WriteFile(path, updated, 0644)
}
