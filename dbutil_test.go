package main

import "testing"

// toFloat64 backs every spawn2 coordinate match in the app (CompareSpawns, per-NPC spawn
// creation's conflict checks, SyncSpawnPoints). A missing float32 case here silently zeroed
// every coordinate, since go-sql-driver/mysql scans a SQL FLOAT column (spawn2.x/y/z in the
// standard EQEmu schema) as Go float32, not float64, when the destination is interface{} —
// only DOUBLE columns come back as float64. That collapsed every spawn2 row in a zone onto the
// same (0,0,0) match key, so every source row matched whichever sink row was last into the map.
func TestToFloat64(t *testing.T) {
	cases := []struct {
		name string
		in   interface{}
		want float64
	}{
		{"float64", float64(52.5), 52.5},
		{"float32", float32(52.5), 52.5},
		{"[]byte", []byte("52.5"), 52.5},
		{"string", "52.5", 52.5},
		{"negative float32", float32(-215.0), -215.0},
		{"nil", nil, 0},
		{"unsupported type", int64(52), 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := toFloat64(c.in); got != c.want {
				t.Errorf("toFloat64(%#v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

func TestToInt64(t *testing.T) {
	cases := []struct {
		name string
		in   interface{}
		want int64
	}{
		{"int64", int64(42), 42},
		{"[]byte", []byte("42"), 42},
		{"string", "42", 42},
		{"negative string", "-7", -7},
		{"nil", nil, 0},
		{"unsupported type", float64(42), 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := toInt64(c.in); got != c.want {
				t.Errorf("toInt64(%#v) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}

// mapsEqual is what turns a matched NPC/spawn2/spawngroup row into "match" vs "modified" — it
// deliberately skips the id column (a matched pair's ids can differ, e.g. two databases'
// spawn2.id are unrelated surrogates) and skips any column missing on the sink side (schema
// drift, e.g. npc_types' 136-vs-131 column difference), rather than treating either as a diff.
func TestMapsEqual(t *testing.T) {
	cases := []struct {
		name string
		a, b map[string]interface{}
		want bool
	}{
		{
			name: "identical",
			a:    map[string]interface{}{"name": "Guard", "hp": 100},
			b:    map[string]interface{}{"name": "Guard", "hp": 100},
			want: true,
		},
		{
			name: "differing value",
			a:    map[string]interface{}{"name": "Guard", "hp": 100},
			b:    map[string]interface{}{"name": "Guard", "hp": 200},
			want: false,
		},
		{
			name: "id column ignored even when different",
			a:    map[string]interface{}{"id": 1, "name": "Guard"},
			b:    map[string]interface{}{"id": 2, "name": "Guard"},
			want: true,
		},
		{
			name: "column missing on sink is skipped, not a diff",
			a:    map[string]interface{}{"name": "Guard", "extra_source_only_column": "x"},
			b:    map[string]interface{}{"name": "Guard"},
			want: true,
		},
		{
			name: "type mismatch stringifies to the same value",
			a:    map[string]interface{}{"hp": "100"},
			b:    map[string]interface{}{"hp": 100},
			want: true,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := mapsEqual(c.a, c.b); got != c.want {
				t.Errorf("mapsEqual(%#v, %#v) = %v, want %v", c.a, c.b, got, c.want)
			}
		})
	}
}

func TestInClausePlaceholders(t *testing.T) {
	cases := []struct {
		name             string
		ids              []int64
		wantPlaceholders string
		wantArgs         []interface{}
	}{
		{"empty", nil, "", []interface{}{}},
		{"single", []int64{7}, "?", []interface{}{int64(7)}},
		{"multiple", []int64{1, 2, 3}, "?,?,?", []interface{}{int64(1), int64(2), int64(3)}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gotPlaceholders, gotArgs := inClausePlaceholders(c.ids)
			if gotPlaceholders != c.wantPlaceholders {
				t.Errorf("placeholders = %q, want %q", gotPlaceholders, c.wantPlaceholders)
			}
			if len(gotArgs) != len(c.wantArgs) {
				t.Fatalf("args = %#v, want %#v", gotArgs, c.wantArgs)
			}
			for i := range gotArgs {
				if gotArgs[i] != c.wantArgs[i] {
					t.Errorf("args[%d] = %#v, want %#v", i, gotArgs[i], c.wantArgs[i])
				}
			}
		})
	}
}
