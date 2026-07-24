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
