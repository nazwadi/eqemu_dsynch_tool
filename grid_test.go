package main

import "testing"

// gridEntriesEqual drives GridDiffRow.EntriesDiffer — order-independent (matched by waypoint
// Number, not position in the slice), but sensitive to a waypoint's own fields changing.
func TestGridEntriesEqual(t *testing.T) {
	cases := []struct {
		name string
		a, b []GridEntry
		want bool
	}{
		{
			name: "identical",
			a:    []GridEntry{{Number: 1, X: 10, Y: 20, Z: 0}, {Number: 2, X: 30, Y: 40, Z: 0}},
			b:    []GridEntry{{Number: 1, X: 10, Y: 20, Z: 0}, {Number: 2, X: 30, Y: 40, Z: 0}},
			want: true,
		},
		{
			name: "same waypoints, different order",
			a:    []GridEntry{{Number: 1, X: 10, Y: 20, Z: 0}, {Number: 2, X: 30, Y: 40, Z: 0}},
			b:    []GridEntry{{Number: 2, X: 30, Y: 40, Z: 0}, {Number: 1, X: 10, Y: 20, Z: 0}},
			want: true,
		},
		{
			name: "differing coordinate at same waypoint number",
			a:    []GridEntry{{Number: 1, X: 10, Y: 20, Z: 0}},
			b:    []GridEntry{{Number: 1, X: 99, Y: 20, Z: 0}},
			want: false,
		},
		{
			name: "different waypoint numbers",
			a:    []GridEntry{{Number: 1, X: 10, Y: 20, Z: 0}},
			b:    []GridEntry{{Number: 2, X: 10, Y: 20, Z: 0}},
			want: false,
		},
		{
			name: "different length",
			a:    []GridEntry{{Number: 1}, {Number: 2}},
			b:    []GridEntry{{Number: 1}},
			want: false,
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := gridEntriesEqual(c.a, c.b); got != c.want {
				t.Errorf("gridEntriesEqual(%#v, %#v) = %v, want %v", c.a, c.b, got, c.want)
			}
		})
	}
}
