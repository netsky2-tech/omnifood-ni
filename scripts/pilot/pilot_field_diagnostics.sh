#!/usr/bin/env bash
set -euo pipefail

# Read-only Pilot Field Diagnostics CLI (#534)
# Runs Q-A1..Q-A6 against Floor SQLite (local file or ADB pull) and/or
# Q-B1..Q-B2 against PostgreSQL in a READ ONLY transaction.

SQLITE_PATH=""
ADB_SERIAL=""
ADB_PACKAGE="com.nhilos.pos_app"
ADB_DB_NAME="app_database.db"
PG_TENANT=""
JSON_OUTPUT=0
TMP_DB=""

cleanup() {
  if [[ -n "${TMP_DB}" && -f "${TMP_DB}" ]]; then
    rm -f "${TMP_DB}"
  fi
}
trap cleanup EXIT

usage() {
  cat <<'EOF'
Usage: pilot_field_diagnostics.sh [OPTIONS]

Read-only diagnostic queries for OmniFood NI pilot terminals and cloud DB (#534).

Options:
  --sqlite <db_path>         Path to local Floor SQLite database file (Q-A1..Q-A6)
  --adb <serial>             Pull a read-only copy from Android device via adb run-as (Q-A1..Q-A6)
  --package <pkg>            Android package name for --adb (default: com.nhilos.pos_app)
  --db-name <name>           SQLite filename inside app databases/ for --adb (default: app_database.db)
  --pg-tenant <tenant_uuid>  Run PostgreSQL Q-B1 & Q-B2 for tenant UUID (READ ONLY tx)
  --json                     Emit machine-readable JSON output
  -h, --help                 Show this help message and exit

Exit codes:
  0  Healthy (no Q-A2 un-deducted invoices and no Q-B1 duplicate invoice numbers)
  1  Invalid arguments or missing prerequisite tool/file
  2  Anomalies detected (Q-A2 > 0 or Q-B1 duplicates > 0)

PostgreSQL environment variables (DB_* takes precedence over PG*):
  DB_HOST / PGHOST         (default: 127.0.0.1)
  DB_PORT / PGPORT         (default: 5432)
  DB_USERNAME / PGUSER     (default: postgres)
  DB_PASSWORD / PGPASSWORD (default: postgres)
  DB_DATABASE / PGDATABASE (default: omnifood)
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --sqlite)
      [[ $# -ge 2 ]] || { echo "Error: --sqlite requires a path" >&2; exit 1; }
      SQLITE_PATH="$2"
      shift 2
      ;;
    --adb)
      [[ $# -ge 2 ]] || { echo "Error: --adb requires a device serial" >&2; exit 1; }
      ADB_SERIAL="$2"
      shift 2
      ;;
    --package)
      [[ $# -ge 2 ]] || { echo "Error: --package requires a package name" >&2; exit 1; }
      ADB_PACKAGE="$2"
      shift 2
      ;;
    --db-name)
      [[ $# -ge 2 ]] || { echo "Error: --db-name requires a filename" >&2; exit 1; }
      ADB_DB_NAME="$2"
      shift 2
      ;;
    --pg-tenant)
      [[ $# -ge 2 ]] || { echo "Error: --pg-tenant requires a tenant UUID" >&2; exit 1; }
      PG_TENANT="$2"
      shift 2
      ;;
    --json)
      JSON_OUTPUT=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Error: unknown option '$1'" >&2
      usage >&2
      exit 1
      ;;
  esac
done

if [[ -z "${SQLITE_PATH}" && -z "${ADB_SERIAL}" && -z "${PG_TENANT}" ]]; then
  echo "Error: specify at least one of --sqlite, --adb, or --pg-tenant" >&2
  usage >&2
  exit 1
fi

if [[ -n "${SQLITE_PATH}" && -n "${ADB_SERIAL}" ]]; then
  echo "Error: --sqlite and --adb are mutually exclusive" >&2
  exit 1
fi

json_escape() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  s="${s//$'\r'/}"
  s="${s//$'\t'/\\t}"
  printf '%s' "${s}"
}

ANOMALY_COUNT=0
SQLITE_RAN=0
PG_RAN=0

# SQLite diagnostic state
QA1_ROWS=""
QA2_MISSING_COUNT=0
QA2_SAMPLE_ROWS=""
QA3_CURRENT_NUMBER=""
QA3_PREFIX=""
QA3_LAST5_ROWS=""
QA4_UNSYNCED_INVOICES=0
QA4_UNSYNCED_AUDIT_LOGS=0
QA5_DAILY_ROWS=""
QA6_SIZE_BYTES=0
QA6_SIZE_KB=0

# PostgreSQL diagnostic state
QB1_DUP_COUNT=0
QB1_DUP_ROWS=""
QB2_GAP_COUNT=0
QB2_GAP_ROWS=""

if [[ -n "${ADB_SERIAL}" ]]; then
  command -v adb >/dev/null 2>&1 || { echo "Error: adb not found in PATH" >&2; exit 1; }
  TMP_DB="$(mktemp /tmp/pilot_diag_adb_XXXXXX.db)"
  if ! adb -s "${ADB_SERIAL}" exec-out run-as "${ADB_PACKAGE}" cat "databases/${ADB_DB_NAME}" > "${TMP_DB}"; then
    echo "Error: failed to pull databases/${ADB_DB_NAME} from ${ADB_SERIAL} (${ADB_PACKAGE})" >&2
    exit 1
  fi
  if [[ ! -s "${TMP_DB}" ]]; then
    echo "Error: pulled SQLite copy from ${ADB_SERIAL} is empty" >&2
    exit 1
  fi
  SQLITE_PATH="${TMP_DB}"
fi

if [[ -n "${SQLITE_PATH}" ]]; then
  command -v sqlite3 >/dev/null 2>&1 || { echo "Error: sqlite3 not found in PATH" >&2; exit 1; }
  [[ -f "${SQLITE_PATH}" ]] || { echo "Error: SQLite file not found: ${SQLITE_PATH}" >&2; exit 1; }

  SQLITE_RAN=1

  # Q-A6: DB file size in bytes and KB
  QA6_SIZE_BYTES="$(wc -c < "${SQLITE_PATH}" | tr -d '[:space:]')"
  QA6_SIZE_KB="$(( (QA6_SIZE_BYTES + 1023) / 1024 ))"

  # Q-A1: inventory_outcome distribution on non-canceled invoices
  QA1_ROWS="$(sqlite3 -readonly -separator '|' "${SQLITE_PATH}" "
    SELECT COALESCE(inventory_outcome, 'NULL') AS outcome, COUNT(*) AS cnt
    FROM invoices
    WHERE is_canceled = 0
    GROUP BY COALESCE(inventory_outcome, 'NULL')
    ORDER BY cnt DESC, outcome ASC;
  ")"

  # Q-A2: non-canceled regular invoices with no inventory movement
  QA2_MISSING_COUNT="$(sqlite3 -readonly "${SQLITE_PATH}" "
    SELECT COUNT(*)
    FROM invoices i
    WHERE i.is_canceled = 0
      AND (i.type IS NULL OR i.type = 'regular')
      AND NOT EXISTS (
        SELECT 1
        FROM inventory_movements m
        WHERE m.sale_id = i.id
           OR m.source_document_id = i.id
           OR m.source_document_id = 'invoice:' || i.id
      );
  " | tr -d '[:space:]')"

  if [[ "${QA2_MISSING_COUNT}" -gt 0 ]]; then
    ANOMALY_COUNT="$((ANOMALY_COUNT + QA2_MISSING_COUNT))"
    QA2_SAMPLE_ROWS="$(sqlite3 -readonly -separator '|' "${SQLITE_PATH}" "
      SELECT i.id, i.invoice_number, i.created_at, COALESCE(i.inventory_outcome, 'NULL')
      FROM invoices i
      WHERE i.is_canceled = 0
        AND (i.type IS NULL OR i.type = 'regular')
        AND NOT EXISTS (
          SELECT 1
          FROM inventory_movements m
          WHERE m.sale_id = i.id
             OR m.source_document_id = i.id
             OR m.source_document_id = 'invoice:' || i.id
        )
      ORDER BY i.created_at DESC
      LIMIT 10;
    ")"
  fi

  # Q-A3: dgi_current_number / dgi_prefix from local_configs + last 5 invoice_numbers
  QA3_CURRENT_NUMBER="$(sqlite3 -readonly "${SQLITE_PATH}" "
    SELECT COALESCE((SELECT value FROM local_configs WHERE key = 'dgi_current_number' LIMIT 1), 'UNSET');
  ")"
  QA3_PREFIX="$(sqlite3 -readonly "${SQLITE_PATH}" "
    SELECT COALESCE((SELECT value FROM local_configs WHERE key = 'dgi_prefix' LIMIT 1), 'UNSET');
  ")"
  QA3_LAST5_ROWS="$(sqlite3 -readonly -separator '|' "${SQLITE_PATH}" "
    SELECT invoice_number, created_at, sync_status
    FROM invoices
    ORDER BY created_at DESC
    LIMIT 5;
  ")"

  # Q-A4: unsynced depth on invoices & audit_logs
  QA4_UNSYNCED_INVOICES="$(sqlite3 -readonly "${SQLITE_PATH}" "
    SELECT COUNT(*) FROM invoices WHERE sync_status != 'synced';
  " | tr -d '[:space:]')"
  QA4_UNSYNCED_AUDIT_LOGS="$(sqlite3 -readonly "${SQLITE_PATH}" "
    SELECT COUNT(*) FROM audit_logs WHERE is_synced = 0;
  " | tr -d '[:space:]')"

  # Q-A5: daily invoice counts last 30 days (UTC-6 Managua local day)
  QA5_DAILY_ROWS="$(sqlite3 -readonly -separator '|' "${SQLITE_PATH}" "
    SELECT date(created_at / 1000, 'unixepoch', '-6 hours') AS day, COUNT(*) AS cnt
    FROM invoices
    WHERE created_at >= (strftime('%s', 'now', '-30 days') * 1000)
    GROUP BY day
    ORDER BY day DESC;
  ")"
fi

if [[ -n "${PG_TENANT}" ]]; then
  command -v psql >/dev/null 2>&1 || { echo "Error: psql not found in PATH" >&2; exit 1; }
  if [[ ! "${PG_TENANT}" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then
    echo "Error: --pg-tenant must be a valid UUID (got: ${PG_TENANT})" >&2
    exit 1
  fi

  PG_RAN=1
  PG_HOST="${DB_HOST:-${PGHOST:-127.0.0.1}}"
  PG_PORT="${DB_PORT:-${PGPORT:-5432}}"
  PG_USER="${DB_USERNAME:-${PGUSER:-postgres}}"
  PG_PASS="${DB_PASSWORD:-${PGPASSWORD:-postgres}}"
  PG_DB="${DB_DATABASE:-${PGDATABASE:-omnifood}}"

  export PGPASSWORD="${PG_PASS}"
  PSQL_BASE=(psql -h "${PG_HOST}" -p "${PG_PORT}" -U "${PG_USER}" -d "${PG_DB}" -X -q -t -A -v ON_ERROR_STOP=1 -v "tenant_id=${PG_TENANT}")

  # Q-B1: duplicate invoice_number detection for tenant (READ ONLY transaction)
  QB1_DUP_ROWS="$("${PSQL_BASE[@]}" <<'SQL'
BEGIN TRANSACTION READ ONLY;
SELECT invoice_number || '|' || COUNT(*)::text
FROM invoices
WHERE tenant_id = :'tenant_id'
GROUP BY invoice_number
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, invoice_number ASC;
ROLLBACK;
SQL
)"
  if [[ -n "${QB1_DUP_ROWS}" ]]; then
    QB1_DUP_COUNT="$(printf '%s\n' "${QB1_DUP_ROWS}" | wc -l | tr -d '[:space:]')"
    ANOMALY_COUNT="$((ANOMALY_COUNT + QB1_DUP_COUNT))"
  fi

  # Q-B2: sequence gap detection on invoice_number / created_at for tenant (READ ONLY transaction)
  QB2_GAP_ROWS="$("${PSQL_BASE[@]}" <<'SQL'
BEGIN TRANSACTION READ ONLY;
WITH parsed AS (
  SELECT
    invoice_number,
    created_at,
    regexp_replace(invoice_number, '\d+$', '') AS series_prefix,
    substring(invoice_number from '(\d+)$')::bigint AS seq_num
  FROM invoices
  WHERE tenant_id = :'tenant_id'
    AND invoice_number ~ '\d+$'
),
ordered AS (
  SELECT
    series_prefix,
    seq_num,
    LAG(seq_num) OVER (PARTITION BY series_prefix ORDER BY seq_num, created_at) AS prev_seq
  FROM parsed
)
SELECT
  series_prefix || '|' || (prev_seq + 1)::text || '|' || (seq_num - 1)::text || '|' || (seq_num - prev_seq - 1)::text
FROM ordered
WHERE prev_seq IS NOT NULL AND seq_num - prev_seq > 1
ORDER BY series_prefix, prev_seq + 1;
ROLLBACK;
SQL
)"
  if [[ -n "${QB2_GAP_ROWS}" ]]; then
    QB2_GAP_COUNT="$(printf '%s\n' "${QB2_GAP_ROWS}" | wc -l | tr -d '[:space:]')"
  fi
fi

lines_to_json_array() {
  local raw="$1"
  if [[ -z "${raw}" ]]; then
    printf '[]'
    return
  fi
  printf '['
  local first=1
  while IFS= read -r line; do
    [[ -z "${line}" ]] && continue
    if [[ "${first}" -eq 0 ]]; then
      printf ','
    fi
    first=0
    printf '"%s"' "$(json_escape "${line}")"
  done <<< "${raw}"
  printf ']'
}

if [[ "${JSON_OUTPUT}" -eq 1 ]]; then
  STATUS="healthy"
  if [[ "${ANOMALY_COUNT}" -gt 0 ]]; then
    STATUS="anomaly_detected"
  fi
  printf '{'
  printf '"status":"%s","anomaly_count":%d' "${STATUS}" "${ANOMALY_COUNT}"
  if [[ "${SQLITE_RAN}" -eq 1 ]]; then
    printf ',"sqlite":{'
    printf '"path":"%s",' "$(json_escape "${SQLITE_PATH}")"
    printf '"q_a1_inventory_outcome":%s,' "$(lines_to_json_array "${QA1_ROWS}")"
    printf '"q_a2_missing_movement_count":%d,' "${QA2_MISSING_COUNT}"
    printf '"q_a2_missing_movement_samples":%s,' "$(lines_to_json_array "${QA2_SAMPLE_ROWS}")"
    printf '"q_a3_dgi_prefix":"%s",' "$(json_escape "${QA3_PREFIX}")"
    printf '"q_a3_dgi_current_number":"%s",' "$(json_escape "${QA3_CURRENT_NUMBER}")"
    printf '"q_a3_last5_invoices":%s,' "$(lines_to_json_array "${QA3_LAST5_ROWS}")"
    printf '"q_a4_unsynced_invoices":%d,' "${QA4_UNSYNCED_INVOICES}"
    printf '"q_a4_unsynced_audit_logs":%d,' "${QA4_UNSYNCED_AUDIT_LOGS}"
    printf '"q_a5_daily_counts_30d":%s,' "$(lines_to_json_array "${QA5_DAILY_ROWS}")"
    printf '"q_a6_db_size_bytes":%d,' "${QA6_SIZE_BYTES}"
    printf '"q_a6_db_size_kb":%d' "${QA6_SIZE_KB}"
    printf '}'
  fi
  if [[ "${PG_RAN}" -eq 1 ]]; then
    printf ',"postgres":{'
    printf '"tenant_id":"%s",' "$(json_escape "${PG_TENANT}")"
    printf '"q_b1_duplicate_count":%d,' "${QB1_DUP_COUNT}"
    printf '"q_b1_duplicates":%s,' "$(lines_to_json_array "${QB1_DUP_ROWS}")"
    printf '"q_b2_gap_count":%d,' "${QB2_GAP_COUNT}"
    printf '"q_b2_gaps":%s' "$(lines_to_json_array "${QB2_GAP_ROWS}")"
    printf '}'
  fi
  printf '}\n'
else
  echo "=== OmniFood NI Pilot Field Diagnostics (#534) ==="
  if [[ "${SQLITE_RAN}" -eq 1 ]]; then
    echo ""
    echo "[SQLite] ${SQLITE_PATH}"
    echo "  Q-A6 DB Size: ${QA6_SIZE_BYTES} bytes (${QA6_SIZE_KB} KB)"
    echo "  Q-A1 Inventory Outcome Distribution:"
    if [[ -z "${QA1_ROWS}" ]]; then
      echo "    (none)"
    else
      while IFS= read -r line; do echo "    ${line}"; done <<< "${QA1_ROWS}"
    fi
    echo "  Q-A2 Non-canceled regular invoices missing inventory movement: ${QA2_MISSING_COUNT}"
    if [[ -n "${QA2_SAMPLE_ROWS}" ]]; then
      while IFS= read -r line; do echo "    SAMPLE: ${line}"; done <<< "${QA2_SAMPLE_ROWS}"
    fi
    echo "  Q-A3 DGI Cursor: prefix='${QA3_PREFIX}' current_number='${QA3_CURRENT_NUMBER}'"
    echo "       Last 5 invoices:"
    if [[ -z "${QA3_LAST5_ROWS}" ]]; then
      echo "         (none)"
    else
      while IFS= read -r line; do echo "         ${line}"; done <<< "${QA3_LAST5_ROWS}"
    fi
    echo "  Q-A4 Unsynced Queue Depth: invoices=${QA4_UNSYNCED_INVOICES}, audit_logs=${QA4_UNSYNCED_AUDIT_LOGS}"
    echo "  Q-A5 Daily Invoice Counts (last 30d):"
    if [[ -z "${QA5_DAILY_ROWS}" ]]; then
      echo "    (none)"
    else
      while IFS= read -r line; do echo "    ${line}"; done <<< "${QA5_DAILY_ROWS}"
    fi
  fi

  if [[ "${PG_RAN}" -eq 1 ]]; then
    echo ""
    echo "[PostgreSQL READ ONLY] tenant=${PG_TENANT}"
    echo "  Q-B1 Duplicate invoice_number rows: ${QB1_DUP_COUNT}"
    if [[ -n "${QB1_DUP_ROWS}" ]]; then
      while IFS= read -r line; do echo "    DUP: ${line}"; done <<< "${QB1_DUP_ROWS}"
    fi
    echo "  Q-B2 Sequence gaps detected: ${QB2_GAP_COUNT}"
    if [[ -n "${QB2_GAP_ROWS}" ]]; then
      while IFS= read -r line; do echo "    GAP: ${line}"; done <<< "${QB2_GAP_ROWS}"
    fi
  fi

  echo ""
  if [[ "${ANOMALY_COUNT}" -gt 0 ]]; then
    echo "RESULT: ANOMALIES_DETECTED (count=${ANOMALY_COUNT})"
  else
    echo "RESULT: HEALTHY"
  fi
fi

if [[ "${ANOMALY_COUNT}" -gt 0 ]]; then
  exit 2
fi
exit 0
