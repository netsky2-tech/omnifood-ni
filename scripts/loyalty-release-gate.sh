#!/usr/bin/env bash
# Loyalty V1 release-gate runner (T1b shared runner).
#
# Usage: scripts/loyalty-release-gate.sh <baseline|final>
#
# Runs ONLY the dedicated Loyalty release probes — the backend Jest probe
# config (apps/admin_backend/test/jest-loyalty-release.json) and the two POS
# Flutter probe files — no other suite. Both machine outputs are converted
# into loyalty-release-gate/v1 result documents by
# scripts/lib/loyalty-release-gate-collect.mjs and classified by
# scripts/loyalty-release-gate-classify.mjs, whose exit code is propagated:
#   0 gate_held, 1 gate_failed, 2 usage error, 3 input_invalid.
#
# Baseline-red gate (roadmap §10, untouched baseline): every blocker must be
# observed FAIL and every regression/control PASS, so the probes' own
# non-zero exit codes on the baseline are expected and are NOT runner
# failures — only missing/unconvertible output is.
set -u

usage() {
  cat >&2 <<'EOF'
Usage: scripts/loyalty-release-gate.sh <baseline|final>

Runs the dedicated Loyalty release probes (backend Jest + POS Flutter),
converts their machine-readable output into loyalty-release-gate/v1 result
documents, and classifies them for the requested mode.
Exit codes: 0 gate_held, 1 gate_failed, 2 usage error, 3 input_invalid.
EOF
}

if [ "$#" -ne 1 ]; then
  usage
  exit 2
fi
MODE="$1"
case "$MODE" in
  baseline|final) ;;
  *) usage; exit 2 ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

JEST_TIMEOUT_SECS="${JEST_TIMEOUT_SECS:-1800}"
FLUTTER_TIMEOUT_SECS="${FLUTTER_TIMEOUT_SECS:-1800}"
FLUTTER_BIN="${FLUTTER_BIN:-flutter}"
CONVERT_TIMEOUT_SECS="${CONVERT_TIMEOUT_SECS:-120}"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/loyalty-release-gate.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

die_invalid() {
  printf 'loyalty-release-gate (%s): input_invalid: %s\n' "$MODE" "$1" >&2
  exit 3
}

# 1) Backend dedicated probe config with Jest JSON output.
# Gate integrity: a probe child is evidence only when it exited 0 (all
# passed) or 1 (some tests failed — the expected baseline shape). Any other
# code (124 timeout kill, 127 command-not-found, crashes) is broken
# instrumentation and fails closed even when JSON output looks complete.
# Deterministic test seam: GATE_FORCE_PROBE_EXIT overrides the observed exit
# code so the abnormal-exit path is exercisable without fixture binaries
# (unset in production; 0/1 remain accepted, anything else fails closed).
assert_probe_exit() {
  local label="$1" rc="$2"
  rc="${GATE_FORCE_PROBE_EXIT:-$rc}"
  case "$rc" in
    0|1) ;;
    *)
      die_invalid "${label} probe run exited abnormally (exit ${rc}); a killed or crashed runner is broken instrumentation, not evidence"
      ;;
  esac
}

JEST_RC=0
(
  cd "$ROOT/apps/admin_backend" &&
    timeout "$JEST_TIMEOUT_SECS" pnpm exec jest \
      --config ./test/jest-loyalty-release.json --runInBand \
      --json --outputFile="$TMP_DIR/jest.json"
) || JEST_RC=$?
assert_probe_exit "backend Jest" "$JEST_RC"
if [ ! -s "$TMP_DIR/jest.json" ]; then
  die_invalid "backend Jest run produced no --json output (jest exit ${JEST_RC})"
fi

(
  cd "$ROOT" &&
    timeout "$CONVERT_TIMEOUT_SECS" node \
      scripts/lib/loyalty-release-gate-collect.mjs \
      --source jest-backend \
      --input "$TMP_DIR/jest.json" \
      --output "$TMP_DIR/backend-result.json"
) || die_invalid "backend Jest output conversion failed closed (see errors above)"

# 2) POS probe files with the Flutter JSON reporter. Dependencies are
# resolved first so `flutter pub get` banner output ("Resolving
# dependencies...", etc.) can never pollute the captured JSON event stream;
# the collector fails closed on any non-JSON line.
PUBGET_RC=0
(
  cd "$ROOT/apps/pos_app" &&
    timeout "$FLUTTER_TIMEOUT_SECS" "$FLUTTER_BIN" pub get
) > /dev/null || PUBGET_RC=$?
if [ "$PUBGET_RC" -ne 0 ]; then
  die_invalid "flutter pub get failed before the POS probe run (exit ${PUBGET_RC})"
fi

FLUTTER_RC=0
(
  cd "$ROOT/apps/pos_app" &&
    LOYALTY_RELEASE_GATE=1 timeout "$FLUTTER_TIMEOUT_SECS" "$FLUTTER_BIN" test \
      test/e2e/loyalty_release_isolation_e2e_test.dart \
      test/e2e/loyalty_release_void_e2e_test.dart \
      --reporter json --no-pub
) >"$TMP_DIR/flutter.json" || FLUTTER_RC=$?
assert_probe_exit "POS Flutter" "$FLUTTER_RC"
if [ ! -s "$TMP_DIR/flutter.json" ]; then
  die_invalid "POS Flutter run produced no --reporter json output (flutter exit ${FLUTTER_RC})"
fi

(
  cd "$ROOT" &&
    timeout "$CONVERT_TIMEOUT_SECS" node \
      scripts/lib/loyalty-release-gate-collect.mjs \
      --source flutter-pos \
      --input "$TMP_DIR/flutter.json" \
      --output "$TMP_DIR/pos-result.json"
) || die_invalid "POS Flutter output conversion failed closed (see errors above)"

# 3) Classify both documents for the requested mode and propagate the exit
# code (0 gate_held, 1 gate_failed, 3 input_invalid). The classifier runs
# with the temp dir as cwd so the `file` provenance in the summary stays
# relative (deterministic evidence, no machine-local paths).
CLASSIFY_RC=0
SUMMARY_JSON="$(
  cd "$TMP_DIR" &&
    timeout "$CONVERT_TIMEOUT_SECS" node \
      "$ROOT/scripts/loyalty-release-gate-classify.mjs" \
      --mode "$MODE" \
      backend-result.json \
      pos-result.json
)" || CLASSIFY_RC=$?

printf '%s\n' "$SUMMARY_JSON"

GATE_STATUS="$(printf '%s' "$SUMMARY_JSON" | node -e '
let data = "";
process.stdin.on("data", (chunk) => { data += chunk; });
process.stdin.on("end", () => {
  try { process.stdout.write(JSON.parse(data).status); } catch { process.stdout.write("unknown"); }
});')"

printf 'loyalty-release-gate (%s): %s\n' "$MODE" "$GATE_STATUS" >&2
exit "$CLASSIFY_RC"
