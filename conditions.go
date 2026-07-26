package main

import (
	"context"
	"database/sql"
	"fmt"
)

// SpawnCondition is one spawn_conditions row — confirmed via SHOW CREATE TABLE (2026-07-25):
// PRIMARY KEY (zone, id), id NOT auto-increment, so it's zone-scoped and stable across a database
// the same way grid.id is trusted within a zone (see GridPoint's own comment) — unlike
// spawngroup.id/spawn2.id/lootdrop.id, which are all global auto-increment surrogates. That's what
// makes a real cross-database diff possible here, matched by Id.
type SpawnCondition struct {
	Id     int64
	Fields map[string]interface{} // spawn_conditions columns, minus zone/id
}

// SpawnConditionDiffRow mirrors GridDiffRow's match-by-Id shape, but simpler — spawn_conditions has
// no child/entries table of its own, so a single Status is enough (no FieldsDiffer/EntriesDiffer
// split needed).
type SpawnConditionDiffRow struct {
	Status string // "new" | "modified" | "removed" | "match"
	Source *SpawnCondition
	Sink   *SpawnCondition
}

// SpawnConditionValue is one spawn_condition_values row — note the real table name is singular
// "condition_values", not "conditions_values". Schema is (id, value, zone, instance_id), unique on
// (id, instance_id, zone) with no declared PRIMARY KEY. instance_id is assigned per running zone
// instance by the server (EQEmu's instanced-zone feature) — it has no meaning across two
// independently-run server processes, which is what makes this live/runtime state (a boss up/down
// flag, a quest-stage gate a script flips) rather than authored content. Deliberately never
// matched/diffed against the other database's rows for exactly that reason — see
// ZoneConditionsComparison's own comment.
type SpawnConditionValue struct {
	Id         int64
	InstanceId int64
	Value      int64 // the value column is nullable (DEFAULT NULL) — NULL collapses to 0 via toInt64, same convention used everywhere else in this app
}

// SpawnEvent is one spawn_events row. id is AUTO_INCREMENT (confirmed via SHOW CREATE TABLE) — a
// local surrogate, the same untrustworthy-across-databases category as spawngroup.id/lootdrop.id/
// spawn2.id — so source's and sink's events are never paired/matched, only listed independently,
// the same restraint NPCLootComparison already established for lootdrop trees (no anchor to pair
// them on). Its next_minute/next_hour/next_day/next_month/next_year columns are continuously
// updated by the server as each event reschedules itself, which would make even a same-id diff
// show "modified" almost constantly for otherwise-identical content — one more reason a real diff
// here wouldn't be meaningful.
type SpawnEvent struct {
	Id     int64
	Fields map[string]interface{} // spawn_events columns, minus id/zone
}

// ZoneConditionsComparison bundles all three zone-scoped spawn-condition-related tables for one
// zone (added 2026-07-25, direct response to "need to add visibility for spawn conditions and
// spawn_conditions_values and spawn_events"). Comparison-only, no sync/write action for any of the
// three — the user asked for read-only visibility specifically, sidestepping the question of
// whether spawn_condition_values is safe to write (it isn't, see that type's own comment) rather
// than resolving it. Conditions gets a real diff (Id is zone-scoped and stable); the Values/Events
// slices are read-only listings with no cross-database matching attempted, for the reasons each
// type's own comment explains.
//
// None of these three tables have a version column (confirmed via the same schema check) — unlike
// spawn2/grid, results here don't vary by zone version, only by short_name.
type ZoneConditionsComparison struct {
	Conditions   []SpawnConditionDiffRow
	SourceValues []SpawnConditionValue
	SinkValues   []SpawnConditionValue
	SourceEvents []SpawnEvent
	SinkEvents   []SpawnEvent
}

func fetchSpawnConditions(ctx context.Context, db *sql.DB, zoneShortName string) ([]SpawnCondition, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM spawn_conditions WHERE zone = ?", zoneShortName)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}
	conditions := make([]SpawnCondition, 0, len(result))
	for _, r := range result {
		conditions = append(conditions, SpawnCondition{
			Id:     toInt64(r["id"]),
			Fields: withoutFields(r, "zone", "id"),
		})
	}
	return conditions, nil
}

func fetchSpawnConditionValues(ctx context.Context, db *sql.DB, zoneShortName string) ([]SpawnConditionValue, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM spawn_condition_values WHERE zone = ?", zoneShortName)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}
	values := make([]SpawnConditionValue, 0, len(result))
	for _, r := range result {
		values = append(values, SpawnConditionValue{
			Id:         toInt64(r["id"]),
			InstanceId: toInt64(r["instance_id"]),
			Value:      toInt64(r["value"]),
		})
	}
	return values, nil
}

func fetchSpawnEvents(ctx context.Context, db *sql.DB, zoneShortName string) ([]SpawnEvent, error) {
	rows, err := db.QueryContext(ctx, "SELECT * FROM spawn_events WHERE zone = ?", zoneShortName)
	if err != nil {
		return nil, err
	}
	result, err := scanDynamicRows(rows)
	_ = rows.Close()
	if err != nil {
		return nil, err
	}
	events := make([]SpawnEvent, 0, len(result))
	for _, r := range result {
		events = append(events, SpawnEvent{
			Id:     toInt64(r["id"]),
			Fields: withoutFields(r, "id", "zone"),
		})
	}
	return events, nil
}

// CompareZoneConditions fetches all three tables for both sides concurrently — one goroutine per
// side doing its own three sequential fetches, mirroring CompareSpawns'/CompareSpawnGroups' exact
// shape (see runParallel's own comment for why this is a real latency win over an SSH tunnel, not
// just a two-outer-call optimization). Only spawn_conditions gets diffed; the values/events slices
// are collected as-is.
func (a *App) CompareZoneConditions(zoneShortName string) (ZoneConditionsComparison, error) {
	result := ZoneConditionsComparison{}
	if a.sourceDB == nil {
		return result, fmt.Errorf("source database not connected")
	}
	if a.sinkDB == nil {
		return result, fmt.Errorf("sink database not connected")
	}

	var sourceConditions, sinkConditions []SpawnCondition
	err := runParallel(
		func() error {
			conditions, err := fetchSpawnConditions(a.ctx, a.sourceDB, zoneShortName)
			if err != nil {
				return err
			}
			values, err := fetchSpawnConditionValues(a.ctx, a.sourceDB, zoneShortName)
			if err != nil {
				return err
			}
			events, err := fetchSpawnEvents(a.ctx, a.sourceDB, zoneShortName)
			if err != nil {
				return err
			}
			sourceConditions = conditions
			result.SourceValues = values
			result.SourceEvents = events
			return nil
		},
		func() error {
			conditions, err := fetchSpawnConditions(a.ctx, a.sinkDB, zoneShortName)
			if err != nil {
				return err
			}
			values, err := fetchSpawnConditionValues(a.ctx, a.sinkDB, zoneShortName)
			if err != nil {
				return err
			}
			events, err := fetchSpawnEvents(a.ctx, a.sinkDB, zoneShortName)
			if err != nil {
				return err
			}
			sinkConditions = conditions
			result.SinkValues = values
			result.SinkEvents = events
			return nil
		},
	)
	if err != nil {
		return result, err
	}

	sinkById := make(map[int64]SpawnCondition, len(sinkConditions))
	for _, c := range sinkConditions {
		sinkById[c.Id] = c
	}
	seen := make(map[int64]bool, len(sourceConditions))
	for _, sc := range sourceConditions {
		sc := sc
		row := SpawnConditionDiffRow{Source: &sc}
		sinkC, exists := sinkById[sc.Id]
		if !exists {
			row.Status = "new"
			result.Conditions = append(result.Conditions, row)
			continue
		}
		seen[sc.Id] = true
		row.Sink = &sinkC
		if mapsEqual(sc.Fields, sinkC.Fields) {
			row.Status = "match"
		} else {
			row.Status = "modified"
		}
		result.Conditions = append(result.Conditions, row)
	}
	for _, sk := range sinkConditions {
		if !seen[sk.Id] {
			sk := sk
			result.Conditions = append(result.Conditions, SpawnConditionDiffRow{Status: "removed", Sink: &sk})
		}
	}

	return result, nil
}
