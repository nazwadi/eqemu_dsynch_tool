package main

import "testing"

// spawnEntriesEqual drives SpawnDiffRow.SpawnEntriesDiffer — order-independent (spawnentry rows
// have no inherent order) but sensitive to both which NPCs are present and each one's chance.
func TestSpawnEntriesEqual(t *testing.T) {
	cases := []struct {
		name string
		a, b []SpawnEntry
		want bool
	}{
		{
			name: "identical",
			a:    []SpawnEntry{{NPCID: 1, Chance: 50}, {NPCID: 2, Chance: 50}},
			b:    []SpawnEntry{{NPCID: 1, Chance: 50}, {NPCID: 2, Chance: 50}},
			want: true,
		},
		{
			name: "same entries, different order",
			a:    []SpawnEntry{{NPCID: 1, Chance: 50}, {NPCID: 2, Chance: 50}},
			b:    []SpawnEntry{{NPCID: 2, Chance: 50}, {NPCID: 1, Chance: 50}},
			want: true,
		},
		{
			name: "differing chance",
			a:    []SpawnEntry{{NPCID: 1, Chance: 50}},
			b:    []SpawnEntry{{NPCID: 1, Chance: 75}},
			want: false,
		},
		{
			name: "different NPC composition",
			a:    []SpawnEntry{{NPCID: 1, Chance: 50}},
			b:    []SpawnEntry{{NPCID: 2, Chance: 50}},
			want: false,
		},
		{
			name: "different length",
			a:    []SpawnEntry{{NPCID: 1, Chance: 50}, {NPCID: 2, Chance: 50}},
			b:    []SpawnEntry{{NPCID: 1, Chance: 50}},
			want: false,
		},
		{
			name: "both empty",
			a:    nil,
			b:    []SpawnEntry{},
			want: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := spawnEntriesEqual(c.a, c.b); got != c.want {
				t.Errorf("spawnEntriesEqual(%#v, %#v) = %v, want %v", c.a, c.b, got, c.want)
			}
		})
	}
}

// spawnGroupContentMatches drives annotateSpawnGroupCollisionRisk's SpawnGroupCollisionRisk flag —
// pinning down the 2026-07-24 fix that made the flag content-aware instead of existence-only (see
// CLAUDE.md: without this, a "new" row sharing a spawngroupID that RelocateSpawnGroup had already
// fixed kept showing a collision warning forever, since the id legitimately existed on sink).
func TestSpawnGroupContentMatches(t *testing.T) {
	cases := []struct {
		name     string
		aFields  map[string]interface{}
		aEntries []SpawnEntry
		bFields  map[string]interface{}
		bEntries []SpawnEntry
		want     bool
	}{
		{
			name:     "identical fields and entries",
			aFields:  map[string]interface{}{"name": "gukbottom_1", "spawn_limit": "5"},
			aEntries: []SpawnEntry{{NPCID: 1, Chance: 100}},
			bFields:  map[string]interface{}{"name": "gukbottom_1", "spawn_limit": "5"},
			bEntries: []SpawnEntry{{NPCID: 1, Chance: 100}},
			want:     true,
		},
		{
			name:     "same content, different (disambiguated) name — still a match",
			aFields:  map[string]interface{}{"name": "gukbottom_1", "spawn_limit": "5"},
			aEntries: []SpawnEntry{{NPCID: 1, Chance: 100}},
			bFields:  map[string]interface{}{"name": "gukbottom_1_grp42", "spawn_limit": "5"},
			bEntries: []SpawnEntry{{NPCID: 1, Chance: 100}},
			want:     true,
		},
		{
			name:     "differing field — a genuine unrelated squatter",
			aFields:  map[string]interface{}{"name": "gukbottom_1", "spawn_limit": "5"},
			aEntries: []SpawnEntry{{NPCID: 1, Chance: 100}},
			bFields:  map[string]interface{}{"name": "gukbottom_1", "spawn_limit": "3"},
			bEntries: []SpawnEntry{{NPCID: 1, Chance: 100}},
			want:     false,
		},
		{
			name:     "differing entries — same fields, different roster",
			aFields:  map[string]interface{}{"name": "gukbottom_1", "spawn_limit": "5"},
			aEntries: []SpawnEntry{{NPCID: 1, Chance: 100}},
			bFields:  map[string]interface{}{"name": "gukbottom_1", "spawn_limit": "5"},
			bEntries: []SpawnEntry{{NPCID: 2, Chance: 100}},
			want:     false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := spawnGroupContentMatches(c.aFields, c.aEntries, c.bFields, c.bEntries); got != c.want {
				t.Errorf("spawnGroupContentMatches(...) = %v, want %v", got, c.want)
			}
		})
	}
}
