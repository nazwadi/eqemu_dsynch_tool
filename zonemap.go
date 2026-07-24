package main

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// MapLineSegment is one L-line from a Brewall's Maps .txt file — world-space coordinates (the
// same X/Y/Z space spawn2/grid_entries already use), not screen pixels; the frontend owns the
// transform to an SVG viewBox (see lib/zoneMapHelpers.js — deliberately one shared transform, not
// computed independently for the background vs. the grid overlay, since a mismatch there would
// silently misalign the two).
type MapLineSegment struct {
	X1, Y1, Z1 float64
	X2, Y2, Z2 float64
	R, G, B    uint8
}

type ZoneMap struct {
	Segments []MapLineSegment // empty (not an error) if no map file exists for this zone — see GetZoneMap
}

// GetZoneMap reads <mapsDirectory>/<zoneShortName>.txt (Brewall's Maps' own naming convention —
// base file only, not the _1/_2 detail-overlay variants) and parses its line segments.
// mapsDirectory is passed explicitly by the frontend rather than stored on App — this isn't a
// "connection" needing lifecycle management the way sourceDB/sinkDB are, just a plain parameter.
//
// A missing file is deliberately NOT an error: most zones plausibly have no Brewall coverage, or
// their short_name doesn't match Brewall's own file naming exactly — returns ZoneMap{} with a nil
// error, and the frontend shows "no map available" rather than an error banner. Lines that aren't
// "L" records (comments, or "P" point/label lines in files that happen to have them even though
// the base files checked so far never do) are silently skipped, not treated as parse errors, so a
// file that turns out to have more than pure L-lines doesn't break the whole zone.
func (a *App) GetZoneMap(mapsDirectory, zoneShortName string) (ZoneMap, error) {
	result := ZoneMap{}
	if mapsDirectory == "" || zoneShortName == "" {
		return result, nil
	}

	path := filepath.Join(mapsDirectory, zoneShortName+".txt")
	f, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return result, nil
		}
		return result, fmt.Errorf("opening zone map %s: %w", path, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "L") {
			continue
		}
		fields := strings.Split(strings.TrimSpace(line[1:]), ",")
		if len(fields) != 9 {
			continue
		}
		values := make([]float64, 9)
		valid := true
		for i, field := range fields {
			v, err := strconv.ParseFloat(strings.TrimSpace(field), 64)
			if err != nil {
				valid = false
				break
			}
			values[i] = v
		}
		if !valid {
			continue
		}
		result.Segments = append(result.Segments, MapLineSegment{
			X1: values[0], Y1: values[1], Z1: values[2],
			X2: values[3], Y2: values[4], Z2: values[5],
			R: uint8(values[6]), G: uint8(values[7]), B: uint8(values[8]),
		})
	}
	if err := scanner.Err(); err != nil {
		return result, fmt.Errorf("reading zone map %s: %w", path, err)
	}
	return result, nil
}
