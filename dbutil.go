package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/go-sql-driver/mysql"
)

func toInt64(v interface{}) int64 {
	switch val := v.(type) {
	case int64:
		return val
	case []byte:
		n, _ := strconv.ParseInt(string(val), 10, 64)
		return n
	case string:
		n, _ := strconv.ParseInt(val, 10, 64)
		return n
	}
	return 0
}

func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		// go-sql-driver/mysql scans a SQL FLOAT column (spawn2.x/y/z in the standard EQEmu
		// schema) as Go float32, not float64, when the destination is interface{} — DOUBLE
		// columns come back as float64. Without this case, every spawn2 coordinate silently
		// zeroed out here, which is what coordKey() is built from: x/y/z all resolving to 0
		// on both databases collapses every spawn2 row onto the same map key, so CompareSpawns
		// matched every source row to whatever one sink row happened to be last into the map.
		return float64(val)
	case []byte:
		n, _ := strconv.ParseFloat(string(val), 64)
		return n
	case string:
		n, _ := strconv.ParseFloat(val, 64)
		return n
	}
	return 0
}

func mapsEqual(a, b map[string]interface{}) bool {
	for k, av := range a {
		if k == "id" {
			continue
		}
		bv, ok := b[k]
		if !ok {
			continue // skip columns that don't exist in the sink
		}
		if fmt.Sprintf("%v", av) != fmt.Sprintf("%v", bv) {
			return false
		}
	}
	return true
}

// existingIds returns the subset of ids that actually exist as `column` values in `table` — used
// to batch-check FK existence for every NPC in a zone with one query per reference type, instead
// of one query per NPC. table/column are always one of the hardcoded pairs in referenceFKColumns,
// never derived from user input.
func existingIds(ctx context.Context, db *sql.DB, table, column string, ids map[int64]bool) (map[int64]bool, error) {
	result := make(map[int64]bool, len(ids))
	if len(ids) == 0 {
		return result, nil
	}
	idList := make([]int64, 0, len(ids))
	for id := range ids {
		idList = append(idList, id)
	}
	placeholders, args := inClausePlaceholders(idList)
	rows, err := db.QueryContext(ctx,
		fmt.Sprintf("SELECT DISTINCT %s FROM %s WHERE %s IN (%s)", column, table, column, placeholders), args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		result[id] = true
	}
	return result, rows.Err()
}

// withoutFields returns a shallow copy of m with the given keys removed — used to exclude "name"
// from spawngroup field comparisons/updates without touching mapsEqual itself (since "name" is
// meaningfully comparable content on other tables mapsEqual is used for, e.g. npc_types.name, and
// only cosmetic/local on spawngroup specifically — see EQEmu Schema Notes), and to strip
// id/npc_spells_id/spellid from npc_spells_entries rows before diffing them (see
// NPCSpellsEntryDiff). Variadic rather than one-field-at-a-time since that second case needs three
// keys stripped, not one.
func withoutFields(m map[string]interface{}, fields ...string) map[string]interface{} {
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		out[k] = v
	}
	for _, f := range fields {
		delete(out, f)
	}
	return out
}

func getSinkColumns(ctx context.Context, db *sql.DB, table string) (map[string]bool, error) {
	rows, err := db.QueryContext(ctx, "SHOW COLUMNS FROM "+table)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	columns := make(map[string]bool)
	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}
		if name, ok := values[0].([]byte); ok {
			columns[string(name)] = true
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return columns, nil
}

// scanDynamicRows reads every row of an already-executed query into a slice of column-name-keyed
// maps. Used for spawn2/spawngroup queries the same way GetNPCsForZone does it inline for
// npc_types — kept separate here rather than refactoring GetNPCsForZone to share it, since that
// function's loop is already intertwined with npc_types-specific extraction (has_spawn_point).
func scanDynamicRows(rows *sql.Rows) ([]map[string]interface{}, error) {
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	var result []map[string]interface{}
	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}
		if err := rows.Scan(valuePtrs...); err != nil {
			return nil, err
		}
		fields := make(map[string]interface{}, len(cols))
		for i, col := range cols {
			switch v := values[i].(type) {
			case []byte:
				fields[col] = string(v)
			case float32:
				// Widen to float64 here, once, rather than leaving the raw float32 in place.
				// A float32 round-trips through JSON to the frontend using *32-bit* shortest-
				// round-trip formatting (Go's encoding/json knows the static type), but the
				// frontend only ever produces float64s — so parsing that JSON text back gives
				// the closest float64 to that decimal string, which isn't always bit-identical
				// to float64(v) computed directly. That mismatch is invisible until something
				// compares the two for exact equality, which is exactly what spawnCoordKey does
				// when a value sent back by the frontend (e.g. SyncSpawnPoints' NewSpawnCoords)
				// needs to match a coordinate this function scanned moments earlier.
				fields[col] = float64(v)
			default:
				fields[col] = v
			}
		}
		result = append(result, fields)
	}
	return result, rows.Err()
}

// inClausePlaceholders builds the "?,?,?" placeholder string and the matching []interface{}
// args slice for a dynamic-length SQL IN (...) clause.
func inClausePlaceholders(ids []int64) (string, []interface{}) {
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(ids)), ",")
	args := make([]interface{}, len(ids))
	for i, id := range ids {
		args[i] = id
	}
	return placeholders, args
}

const mysqlErrDupEntry = 1062

// isDuplicateEntryError reports whether err is MySQL's "Duplicate entry ... for key" error —
// used to detect a UNIQUE constraint collision (e.g. spawngroup.name) specifically, as opposed
// to any other reason an INSERT might fail.
func isDuplicateEntryError(err error) bool {
	var mysqlErr *mysql.MySQLError
	return errors.As(err, &mysqlErr) && mysqlErr.Number == mysqlErrDupEntry
}

// insertRow builds a plain INSERT (never ON DUPLICATE KEY UPDATE — callers only use this for
// rows they've already established are brand new) from a dynamic field map filtered to columns
// that actually exist on the sink, with overrides taking precedence over copied source values.
// Returns the new row's auto-increment id.
func insertRow(ctx context.Context, tx *sql.Tx, table string, fields map[string]interface{}, sinkColumns map[string]bool, overrides map[string]interface{}) (int64, error) {
	merged := make(map[string]interface{}, len(fields)+len(overrides))
	for k, v := range fields {
		merged[k] = v
	}
	for k, v := range overrides {
		merged[k] = v
	}

	var columns []string
	for col := range merged {
		if sinkColumns[col] {
			columns = append(columns, col)
		}
	}
	sort.Strings(columns)

	placeholders := make([]string, len(columns))
	values := make([]interface{}, len(columns))
	for i, col := range columns {
		placeholders[i] = "?"
		values[i] = merged[col]
	}

	query := fmt.Sprintf(
		"INSERT INTO %s (%s) VALUES (%s)",
		table,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)
	result, err := tx.ExecContext(ctx, query, values...)
	if err != nil {
		return 0, err
	}
	return result.LastInsertId()
}
