package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestGetZoneMapParsesLLines(t *testing.T) {
	dir := t.TempDir()
	content := "# a comment line, should be skipped\n" +
		"L 32.0000, -2557.0000, 15.0000, 32.0000, -2603.0000, 15.0000, 0, 0, 0\n" +
		"P 1243.4308, -807.9147, 159.6712, 240, 0, 0, 3, a_label\n" + // P-lines skipped in v1
		"L -595.0000, -232.0000, 74.0000, -604.0000, -224.0000, 74.0000, 100, 50, 0\n" +
		"garbage line with no prefix\n" +
		"L not, enough, fields\n"
	if err := os.WriteFile(filepath.Join(dir, "testzone.txt"), []byte(content), 0644); err != nil {
		t.Fatal(err)
	}

	a := &App{}
	got, err := a.GetZoneMap(dir, "testzone")
	if err != nil {
		t.Fatalf("GetZoneMap() error = %v", err)
	}
	if len(got.Segments) != 2 {
		t.Fatalf("got %d segments, want 2 (malformed/non-L lines should be skipped, not error)", len(got.Segments))
	}
	want := MapLineSegment{X1: 32, Y1: -2557, Z1: 15, X2: 32, Y2: -2603, Z2: 15, R: 0, G: 0, B: 0}
	if got.Segments[0] != want {
		t.Errorf("Segments[0] = %+v, want %+v", got.Segments[0], want)
	}
	want2 := MapLineSegment{X1: -595, Y1: -232, Z1: 74, X2: -604, Y2: -224, Z2: 74, R: 100, G: 50, B: 0}
	if got.Segments[1] != want2 {
		t.Errorf("Segments[1] = %+v, want %+v", got.Segments[1], want2)
	}
}

func TestGetZoneMapMissingFileReturnsEmptyNotError(t *testing.T) {
	dir := t.TempDir()
	a := &App{}
	got, err := a.GetZoneMap(dir, "nonexistentzone")
	if err != nil {
		t.Fatalf("GetZoneMap() error = %v, want nil (missing file is not an error)", err)
	}
	if len(got.Segments) != 0 {
		t.Fatalf("got %d segments, want 0", len(got.Segments))
	}
}

func TestGetZoneMapAgainstRealBrewallFile(t *testing.T) {
	// Sanity check against the actual Brewall's Maps data this feature was designed against —
	// skipped if that directory isn't present (e.g. CI, or a checkout without EQ-Maps/).
	dir := "EQ-Maps/Brewall"
	if _, err := os.Stat(filepath.Join(dir, "gfaydark.txt")); err != nil {
		t.Skip("EQ-Maps/Brewall/gfaydark.txt not present, skipping")
	}
	a := &App{}
	got, err := a.GetZoneMap(dir, "gfaydark")
	if err != nil {
		t.Fatalf("GetZoneMap() error = %v", err)
	}
	if len(got.Segments) != 2730 {
		t.Errorf("got %d segments, want 2730 (matches the Python prototype's count during planning)", len(got.Segments))
	}
}
