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
