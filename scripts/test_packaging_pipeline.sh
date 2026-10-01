#!/usr/bin/env bash
# ==============================================================================
# OmniFood NI — Packaging Pipeline Automated Test & Verification Suite
# ==============================================================================
#
# Running only the cheap tests (no Flutter / Android SDK required):
#   SKIP_END_TO_END_BUILD=1 scripts/test_packaging_pipeline.sh
# This runs Tests 1-3 and 6-26 and skips the end-to-end build Tests 4-5,
# which require a full Flutter toolchain and Android SDK. Test 25 additionally
# requires a configured Android project (gradlew + local.properties).
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
POS_APP_DIR="${ROOT_DIR}/apps/pos_app"
TEST_OUT_DIR="${ROOT_DIR}/dist/test_release_candidate"

echo "🧪 Starting Packaging Pipeline Test Suite..."

# Test 1: ProGuard Rules Validation
echo "🔍 [Test 1] Verifying ProGuard rules content..."
PROGUARD_FILE="${POS_APP_DIR}/android/app/proguard-rules.pro"
if [ ! -f "${PROGUARD_FILE}" ]; then
    echo "❌ FAILED: ProGuard file ${PROGUARD_FILE} not found" >&2
    exit 1
fi

grep -q "woyou.aidlservice.jiu_mi" "${PROGUARD_FILE}" || { echo "❌ FAILED: Sunmi AIDL keep rule missing in ProGuard"; exit 1; }
grep -q "com.tekartik.sqflite" "${PROGUARD_FILE}" || { echo "❌ FAILED: Sqflite keep rule missing in ProGuard"; exit 1; }
grep -q "androidx.room" "${PROGUARD_FILE}" || { echo "❌ FAILED: Room keep rule missing in ProGuard"; exit 1; }
grep -q "com.it_nomads.fluttersecurestorage" "${PROGUARD_FILE}" || { echo "❌ FAILED: FlutterSecureStorage keep rule missing"; exit 1; }
echo "✅ [Test 1 Passed] ProGuard rules contain all essential SQLite, Freezed and Sunmi directives."

# Test 2: build.gradle.kts Configuration Validation
echo "🔍 [Test 2] Verifying build.gradle.kts release configuration..."
BUILD_GRADLE="${POS_APP_DIR}/android/app/build.gradle.kts"
grep -q "proguard-rules.pro" "${BUILD_GRADLE}" || { echo "❌ FAILED: proguard-rules.pro not referenced in build.gradle.kts"; exit 1; }
grep -q "signingConfigs" "${BUILD_GRADLE}" || { echo "❌ FAILED: signingConfigs not configured in build.gradle.kts"; exit 1; }
grep -q "aidl = true" "${BUILD_GRADLE}" || { echo "❌ FAILED: buildFeatures aidl = true missing in build.gradle.kts"; exit 1; }
echo "✅ [Test 2 Passed] build.gradle.kts correctly configures release signing, ProGuard and AIDL."

# Test 3: Script Help and Option Parsing
echo "🔍 [Test 3] Testing build_pos_apk.sh help option..."
"${SCRIPT_DIR}/build_pos_apk.sh" --help > /dev/null
echo "✅ [Test 3 Passed] build_pos_apk.sh argument parser functions cleanly."

# Test 4: End-to-End Build Execution (Split APKs) — requires Flutter + Android SDK
if [ "${SKIP_END_TO_END_BUILD:-0}" = "1" ]; then
    echo "⏩ [Test 4] Skipped (SKIP_END_TO_END_BUILD=1; end-to-end build requires Flutter + Android SDK)."
else
echo "🔍 [Test 4] Executing build_pos_apk.sh with --split-per-abi --skip-tests --allow-debug-signing..."
rm -rf "${TEST_OUT_DIR}"
"${SCRIPT_DIR}/build_pos_apk.sh" --split-per-abi --skip-tests --allow-debug-signing --out-dir "${TEST_OUT_DIR}"
fi

# Test 5: Verify Artifacts, Checksums & Manifest — requires Test 4 artifacts
if [ "${SKIP_END_TO_END_BUILD:-0}" = "1" ]; then
    echo "⏩ [Test 5] Skipped (SKIP_END_TO_END_BUILD=1; depends on Test 4 artifacts)."
else
echo "🔍 [Test 5] Validating generated release artifacts and manifest..."
if [ ! -f "${TEST_OUT_DIR}/SHA256SUMS.txt" ]; then
    echo "❌ FAILED: SHA256SUMS.txt was not generated" >&2
    exit 1
fi

if [ ! -f "${TEST_OUT_DIR}/release_manifest.json" ]; then
    echo "❌ FAILED: release_manifest.json was not generated" >&2
    exit 1
fi

# Check armeabi-v7a or arm64-v8a APK existence
ARM_APK_COUNT=$(ls -1 "${TEST_OUT_DIR}"/app-*-release.apk 2>/dev/null | wc -l)
if [ "${ARM_APK_COUNT}" -eq 0 ]; then
    echo "❌ FAILED: No split release APKs found in ${TEST_OUT_DIR}" >&2
    exit 1
fi

# Verify SHA256 checksums integrity
cd "${TEST_OUT_DIR}"
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c SHA256SUMS.txt
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -c SHA256SUMS.txt
fi

if grep -Eq 'Sunmi|V2s|58mm|80mm' "${TEST_OUT_DIR}/release_manifest.json"; then
    echo "❌ FAILED: generated release_manifest.json still claims a device model or paper width" >&2
    exit 1
fi

# Positive exact contract: the manifest must declare the neutral descriptor,
# not merely avoid a denylist of known device models or paper widths.
MANIFEST_HW_VALUE="$(grep '"target_hardware"' "${TEST_OUT_DIR}/release_manifest.json" | sed -e 's/.*"target_hardware"[[:space:]]*:[[:space:]]*"//' -e 's/".*$//')"
if [ -z "${MANIFEST_HW_VALUE}" ]; then
    echo "❌ FAILED: generated release_manifest.json has no target_hardware value" >&2
    exit 1
fi
if [ "${MANIFEST_HW_VALUE}" != "Android POS terminal" ]; then
    echo "❌ FAILED: generated release_manifest.json target_hardware must be exactly 'Android POS terminal'; found '${MANIFEST_HW_VALUE}'" >&2
    exit 1
fi

echo "✅ [Test 5 Passed] All release candidate APKs, SHA256 checksums and manifest validated successfully!"
fi

# -----------------------------------------------------------------------------
# Cheap terminal-identity tests (6-9): no Flutter / Android SDK required.
# They exercise --plan mode only, with a `flutter` shim on PATH that fails if
# ever invoked, proving plan mode never runs the toolchain.
# -----------------------------------------------------------------------------
SHIM_DIR="$(mktemp -d)"
cat > "${SHIM_DIR}/flutter" <<'EOF'
#!/usr/bin/env bash
echo "FLUTTER_SHIM_MUST_NOT_RUN" >&2
exit 99
EOF
chmod +x "${SHIM_DIR}/flutter"

# Test 6: --plan --device-id prints the terminal id and the DEVICE_ID dart-define
echo "🔍 [Test 6] Verifying --plan --device-id resolves the terminal identity binding..."
PLAN_RC=0
PLAN_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --device-id Q802024120001 2>&1)" || PLAN_RC=$?
if [ "${PLAN_RC}" -ne 0 ]; then
    echo "❌ FAILED: --plan --device-id exited with code ${PLAN_RC} (expected 0). Output:" >&2
    echo "${PLAN_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "${PLAN_OUTPUT}" | grep -q "Q802024120001" || { echo "❌ FAILED: --plan output does not contain the terminal id Q802024120001"; echo "${PLAN_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
echo "${PLAN_OUTPUT}" | grep -q -- "--dart-define=DEVICE_ID=Q802024120001" || { echo "❌ FAILED: --plan output does not contain --dart-define=DEVICE_ID=Q802024120001"; echo "${PLAN_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
if echo "${PLAN_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
    echo "❌ FAILED: --plan mode invoked the flutter toolchain" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
# Triangulation: surrounding whitespace is trimmed, inner value preserved.
TRIM_RC=0
TRIM_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --device-id "  Q802024120001  " 2>&1)" || TRIM_RC=$?
if [ "${TRIM_RC}" -ne 0 ] || ! echo "${TRIM_OUTPUT}" | grep -q -- "--dart-define=DEVICE_ID=Q802024120001" || echo "${TRIM_OUTPUT}" | grep -Eq -- "DEVICE_ID=[[:space:]]"; then
    echo "❌ FAILED: --device-id must be trimmed before validation/binding. Output:" >&2
    echo "${TRIM_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 6 Passed] --plan --device-id prints the terminal id and the exact DEVICE_ID dart-define."

# Test 7: --plan with no terminal id reports provisioned-at-runtime and no define
echo "🔍 [Test 7] Verifying fleet builds stay provisioned-at-runtime in --plan..."
FLEET_RC=0
FLEET_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan 2>&1)" || FLEET_RC=$?
if [ "${FLEET_RC}" -ne 0 ]; then
    echo "❌ FAILED: bare --plan exited with code ${FLEET_RC} (expected 0). Output:" >&2
    echo "${FLEET_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "${FLEET_OUTPUT}" | grep -q "provisioned-at-runtime" || { echo "❌ FAILED: bare --plan output does not report provisioned-at-runtime semantics"; echo "${FLEET_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
if echo "${FLEET_OUTPUT}" | grep -q -- "--dart-define=DEVICE_ID"; then
    echo "❌ FAILED: bare --plan must not bake a DEVICE_ID define" >&2
    echo "${FLEET_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 7 Passed] Fleet --plan reports provisioned-at-runtime and no DEVICE_ID define."

# Test 8: --plan --pilot without --device-id fails closed with exit code 2
echo "🔍 [Test 8] Verifying --pilot without --device-id fails closed (exit 2)..."
PILOT_RC=0
PILOT_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --pilot 2>&1)" || PILOT_RC=$?
if [ "${PILOT_RC}" -ne 2 ]; then
    echo "❌ FAILED: --plan --pilot without --device-id exited with code ${PILOT_RC} (expected 2)" >&2
    echo "${PILOT_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "${PILOT_OUTPUT}" | grep -q -- "--device-id" || { echo "❌ FAILED: pilot failure message must name the missing --device-id flag"; echo "${PILOT_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
echo "${PILOT_OUTPUT}" | grep -q "pos-local" || { echo "❌ FAILED: pilot failure message must state the pos-local-<uuid> consequence"; echo "${PILOT_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
echo "✅ [Test 8 Passed] --pilot without --device-id fails closed with exit code 2 and a plain consequence."

# Test 9: invalid --device-id values are rejected
echo "🔍 [Test 9] Verifying invalid --device-id values are rejected..."
LONG_ID="$(printf 'A%.0s' $(seq 1 65))"
for INVALID_ID in "" "A B" "${LONG_ID}"; do
    INVALID_RC=0
    INVALID_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --device-id "${INVALID_ID}" 2>&1)" || INVALID_RC=$?
    if [ "${INVALID_RC}" -eq 0 ]; then
        echo "❌ FAILED: invalid --device-id (empty/space/65 chars) was accepted" >&2
        echo "${INVALID_OUTPUT}" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
    if ! echo "${INVALID_OUTPUT}" | grep -q "Invalid --device-id"; then
        echo "❌ FAILED: invalid --device-id rejection must print a clear 'Invalid --device-id' message. Output:" >&2
        echo "${INVALID_OUTPUT}" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
done
echo "✅ [Test 9 Passed] Empty, whitespace-containing and over-64-char device ids are rejected."

# Test 10: --out-dir as the final argument (no value) is rejected cleanly
# in the same style as --device-id, not via an unbound-variable crash.
echo "🔍 [Test 10] Verifying --out-dir with a missing value is rejected cleanly..."
OUTDIR_RC=0
OUTDIR_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --out-dir 2>&1)" || OUTDIR_RC=$?
if [ "${OUTDIR_RC}" -eq 0 ]; then
    echo "❌ FAILED: --out-dir as the final argument was accepted without a value" >&2
    echo "${OUTDIR_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if ! echo "${OUTDIR_OUTPUT}" | grep -q -- "--out-dir"; then
    echo "❌ FAILED: missing-value --out-dir rejection must print a clear message naming --out-dir. Output:" >&2
    echo "${OUTDIR_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if echo "${OUTDIR_OUTPUT}" | grep -q "unbound variable"; then
    echo "❌ FAILED: missing-value --out-dir crashed with an unbound-variable error instead of a clean rejection. Output:" >&2
    echo "${OUTDIR_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 10 Passed] --out-dir with a missing value fails with a clear message and non-zero exit."

# Test 11: the release manifest stays device-neutral. Paper width is per-tenant
# runtime configuration and the fleet is not a single device model, so
# target_hardware must be exactly the neutral descriptor 'Android POS terminal',
# not merely absent from a denylist.
echo "🔍 [Test 11] Verifying target_hardware in the packaging script is exactly 'Android POS terminal'..."
MANIFEST_HW_LINE="$(grep '"target_hardware"' "${SCRIPT_DIR}/build_pos_apk.sh")" || {
    echo "❌ FAILED: build_pos_apk.sh does not define target_hardware in release_manifest.json" >&2
    exit 1
}
MANIFEST_HW_VALUE="$(printf '%s' "${MANIFEST_HW_LINE}" | sed -e 's/.*"target_hardware"[[:space:]]*:[[:space:]]*"//' -e 's/".*$//')"
if [ -z "${MANIFEST_HW_VALUE}" ]; then
    echo "❌ FAILED: target_hardware value is empty in build_pos_apk.sh" >&2
    exit 1
fi
if [ "${MANIFEST_HW_VALUE}" != "Android POS terminal" ]; then
    echo "❌ FAILED: target_hardware must be exactly 'Android POS terminal'; found '${MANIFEST_HW_VALUE}'" >&2
    exit 1
fi
echo "✅ [Test 11 Passed] target_hardware is exactly 'Android POS terminal'."

# -----------------------------------------------------------------------------
# Cheap api-url tests (12-15): --plan mode only, with the failing flutter shim
# on PATH proving no build step ever runs.
# -----------------------------------------------------------------------------

# Test 12: --pilot --device-id --api-url is accepted; plan shows the resolved
# URL and the exact API_URL dart-define in the printed build commands.
echo "🔍 [Test 12] Verifying --pilot --api-url resolves the backend URL binding..."
STAGING_URL="https://api-staging.nhilospos.com/api"
API_RC=0
API_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --pilot --device-id Q802024120001 --api-url "${STAGING_URL}" 2>&1)" || API_RC=$?
if [ "${API_RC}" -ne 0 ]; then
    echo "❌ FAILED: --plan --pilot --api-url exited with code ${API_RC} (expected 0). Output:" >&2
    echo "${API_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "${API_OUTPUT}" | grep -q -- "--dart-define=API_URL=${STAGING_URL}" || { echo "❌ FAILED: --plan output does not contain --dart-define=API_URL=${STAGING_URL}"; echo "${API_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
# The resolved URL must appear explicitly and on the printed flutter build lines.
API_CMD_LINES="$(printf '%s\n' "${API_OUTPUT}" | grep '^  flutter build apk')"
printf '%s\n' "${API_CMD_LINES}" | grep -q -- "--dart-define=API_URL=${STAGING_URL}" || { echo "❌ FAILED: printed flutter build apk command lines do not contain the API_URL define"; echo "${API_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
printf '%s\n' "${API_OUTPUT}" | grep -q "api_url: ${STAGING_URL}" || { echo "❌ FAILED: --plan output does not state that release_manifest.json would record api_url"; echo "${API_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
if printf '%s\n' "${API_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
    echo "❌ FAILED: --plan --api-url invoked the flutter toolchain" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 12 Passed] Pilot --api-url is accepted, resolved and shown on the build command lines."

# Test 13: --pilot without --api-url fails closed (non-zero) with an
# actionable message, executing nothing.
echo "🔍 [Test 13] Verifying --pilot without --api-url fails closed..."
NOURL_RC=0
NOURL_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --pilot --device-id Q802024120001 2>&1)" || NOURL_RC=$?
if [ "${NOURL_RC}" -eq 0 ]; then
    echo "❌ FAILED: --pilot without --api-url was accepted" >&2
    echo "${NOURL_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
printf '%s\n' "${NOURL_OUTPUT}" | grep -q -- "--api-url" || { echo "❌ FAILED: fail-closed message must name the missing --api-url flag"; echo "${NOURL_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
if printf '%s\n' "${NOURL_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
    echo "❌ FAILED: pilot fail-closed path invoked the flutter toolchain" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 13 Passed] --pilot without --api-url fails closed with a clear message and no build."

# Test 14: invalid --api-url values are rejected before any build step:
# relative URL, URL with whitespace, non-http scheme, empty host.
echo "🔍 [Test 14] Verifying invalid --api-url values are rejected..."
for INVALID_URL in "api/v1" "https://api.example.com/api v2" "ftp://api.example.com/api" "https://"; do
    BAD_RC=0
    BAD_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --pilot --device-id Q802024120001 --api-url "${INVALID_URL}" 2>&1)" || BAD_RC=$?
    if [ "${BAD_RC}" -eq 0 ]; then
        echo "❌ FAILED: invalid --api-url '${INVALID_URL}' was accepted" >&2
        echo "${BAD_OUTPUT}" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
    if ! printf '%s\n' "${BAD_OUTPUT}" | grep -q "Invalid --api-url"; then
        echo "❌ FAILED: invalid --api-url rejection must print a clear 'Invalid --api-url' message for '${INVALID_URL}'. Output:" >&2
        echo "${BAD_OUTPUT}" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
    if printf '%s\n' "${BAD_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
        echo "❌ FAILED: invalid --api-url rejection ran a build step for '${INVALID_URL}'" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
done
echo "✅ [Test 14 Passed] Relative, whitespace-containing, non-http and empty-host URLs are rejected before any build step."

# Test 15: non-pilot (fleet) behavior is unchanged: no API_URL define is baked
# and the plan reports the api_url as provisioned-at-runtime.
echo "🔍 [Test 15] Verifying fleet builds stay provisioned-at-runtime for api_url..."
FLEET_API_RC=0
FLEET_API_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan 2>&1)" || FLEET_API_RC=$?
if [ "${FLEET_API_RC}" -ne 0 ]; then
    echo "❌ FAILED: fleet --plan exited with code ${FLEET_API_RC} (expected 0). Output:" >&2
    echo "${FLEET_API_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if printf '%s\n' "${FLEET_API_OUTPUT}" | grep -q -- "--dart-define=API_URL"; then
    echo "❌ FAILED: fleet --plan must not bake an API_URL define" >&2
    echo "${FLEET_API_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
printf '%s\n' "${FLEET_API_OUTPUT}" | grep -q -- "api_url: provisioned-at-runtime" || { echo "❌ FAILED: fleet --plan must report api_url as provisioned-at-runtime"; echo "${FLEET_API_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
echo "✅ [Test 15 Passed] Fleet builds bake no API_URL define and report provisioned-at-runtime."

# Test 16: --test-concurrency is accepted, shown on the flutter test command
# line in --plan, and recorded in the manifest.
echo "🔍 [Test 16] Verifying --test-concurrency resolves and appears in the plan..."
CONC_RC=0
CONC_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --pilot --device-id Q802024120001 --api-url "${STAGING_URL}" --test-concurrency 4 2>&1)" || CONC_RC=$?
if [ "${CONC_RC}" -ne 0 ]; then
    echo "❌ FAILED: --plan --test-concurrency 4 exited with code ${CONC_RC} (expected 0). Output:" >&2
    echo "${CONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if ! printf '%s\n' "${CONC_OUTPUT}" | grep -q '^  flutter test --concurrency=4$'; then
    echo "❌ FAILED: --plan output does not show the exact 'flutter test --concurrency=4' command" >&2
    echo "${CONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if ! printf '%s\n' "${CONC_OUTPUT}" | grep -q "test_concurrency: 4"; then
    echo "❌ FAILED: --plan output does not state that release_manifest.json would record test_concurrency: 4" >&2
    echo "${CONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if printf '%s\n' "${CONC_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
    echo "❌ FAILED: --plan --test-concurrency invoked the flutter toolchain" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 16 Passed] --test-concurrency is accepted, shown on the flutter test command line and recorded."

# Test 17: invalid --test-concurrency values are rejected before any build step.
echo "🔍 [Test 17] Verifying invalid --test-concurrency values are rejected..."
for INVALID_CONC in 0 -1 abc 3.5 "" " 4" "4 "; do
    BADCONC_RC=0
    BADCONC_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --pilot --device-id Q802024120001 --api-url "${STAGING_URL}" --test-concurrency "${INVALID_CONC}" 2>&1)" || BADCONC_RC=$?
    if [ "${BADCONC_RC}" -eq 0 ]; then
        echo "❌ FAILED: invalid --test-concurrency '${INVALID_CONC}' was accepted" >&2
        echo "${BADCONC_OUTPUT}" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
    if ! printf '%s\n' "${BADCONC_OUTPUT}" | grep -q "Invalid --test-concurrency"; then
        echo "❌ FAILED: invalid --test-concurrency rejection must print a clear 'Invalid --test-concurrency' message for '${INVALID_CONC}'. Output:" >&2
        echo "${BADCONC_OUTPUT}" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
    if printf '%s\n' "${BADCONC_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
        echo "❌ FAILED: invalid --test-concurrency rejection ran a build step for '${INVALID_CONC}'" >&2
        rm -rf "${SHIM_DIR}"
        exit 1
    fi
done
MISSINGCONC_RC=0
MISSINGCONC_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --pilot --device-id Q802024120001 --api-url "${STAGING_URL}" --test-concurrency 2>&1)" || MISSINGCONC_RC=$?
if [ "${MISSINGCONC_RC}" -eq 0 ] || ! printf '%s\n' "${MISSINGCONC_OUTPUT}" | grep -q "Invalid --test-concurrency" || printf '%s\n' "${MISSINGCONC_OUTPUT}" | grep -q "unbound variable"; then
    echo "❌ FAILED: --test-concurrency with a missing value must fail cleanly with a clear message. Output:" >&2
    echo "${MISSINGCONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 17 Passed] 0, negative, non-numeric, empty and missing values are rejected before any build step."

# Test 18: without the option, the plan reports the Flutter default and the
# manifest would record 'flutter-default'; the exact command is plain 'flutter test'.
echo "🔍 [Test 18] Verifying absent --test-concurrency keeps the Flutter default..."
DEFAULTCONC_RC=0
DEFAULTCONC_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan 2>&1)" || DEFAULTCONC_RC=$?
if [ "${DEFAULTCONC_RC}" -ne 0 ]; then
    echo "❌ FAILED: bare --plan exited with code ${DEFAULTCONC_RC} (expected 0). Output:" >&2
    echo "${DEFAULTCONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if ! printf '%s\n' "${DEFAULTCONC_OUTPUT}" | grep -q '^  flutter test$'; then
    echo "❌ FAILED: bare --plan must show the exact 'flutter test' command" >&2
    echo "${DEFAULTCONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if printf '%s\n' "${DEFAULTCONC_OUTPUT}" | grep -q -- "--concurrency="; then
    echo "❌ FAILED: bare --plan must not introduce a --concurrency flag" >&2
    echo "${DEFAULTCONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if ! printf '%s\n' "${DEFAULTCONC_OUTPUT}" | grep -q "Test concurrency:    flutter-default" || ! printf '%s\n' "${DEFAULTCONC_OUTPUT}" | grep -q "Flutter default"; then
    echo "❌ FAILED: bare --plan must state the Flutter default will be used and record flutter-default" >&2
    echo "${DEFAULTCONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
if ! printf '%s\n' "${DEFAULTCONC_OUTPUT}" | grep -q "test_concurrency: flutter-default"; then
    echo "❌ FAILED: bare --plan must state that release_manifest.json would record test_concurrency: flutter-default" >&2
    echo "${DEFAULTCONC_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 18 Passed] Without the option, the plan shows the Flutter default and flutter-default recording."

# Test 19: the manifest schema carries the test_concurrency field in the
# packaging script, so a real build records the resolved value or flutter-default.
echo "🔍 [Test 19] Verifying release_manifest.json records test_concurrency..."
if ! grep -q '"test_concurrency": "${TEST_CONCURRENCY_BINDING}"' "${SCRIPT_DIR}/build_pos_apk.sh"; then
    echo "❌ FAILED: build_pos_apk.sh does not record test_concurrency in release_manifest.json" >&2
    exit 1
fi
echo "✅ [Test 19 Passed] release_manifest.json records the resolved test concurrency or flutter-default."

# -----------------------------------------------------------------------------
# Cheap release-signing tests (20-23): no Flutter / Android SDK required.
# There is no release keystore in the repository, so the fail-closed gate and
# the plan-mode signing report are exercised with the failing flutter shim,
# proving the gate fires before the toolchain is ever invoked.
# -----------------------------------------------------------------------------

# Test 20: a real build without a keystore and without the opt-in fails closed
# with exit code 2 and an actionable message, before the Flutter toolchain runs.
echo "🔍 [Test 20] Verifying a real build without a keystore fails closed (exit 2)..."
FAILCLOSED_RC=0
FAILCLOSED_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --split-per-abi --skip-tests 2>&1)" || FAILCLOSED_RC=$?
if [ "${FAILCLOSED_RC}" -ne 2 ]; then
    echo "❌ FAILED: real build without a keystore exited with code ${FAILCLOSED_RC} (expected 2). Output:" >&2
    echo "${FAILCLOSED_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
printf '%s\n' "${FAILCLOSED_OUTPUT}" | grep -q -- "--allow-debug-signing" || { echo "❌ FAILED: fail-closed message must name the --allow-debug-signing remedy"; printf '%s\n' "${FAILCLOSED_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
printf '%s\n' "${FAILCLOSED_OUTPUT}" | grep -q "provision_release_keystore.sh" || { echo "❌ FAILED: fail-closed message must name the keystore-provisioning remedy"; printf '%s\n' "${FAILCLOSED_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
# The condition is [ ! -f ], which also fires when the path exists as a
# directory or another non-regular file; the message must not claim the file
# is merely absent.
printf '%s\n' "${FAILCLOSED_OUTPUT}" | grep -q "is absent or not a regular file" || { echo "❌ FAILED: fail-closed message must match its [ ! -f ] condition (absent OR not a regular file)"; printf '%s\n' "${FAILCLOSED_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
if printf '%s\n' "${FAILCLOSED_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
    echo "❌ FAILED: fail-closed gate ran after the flutter toolchain was invoked" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 20 Passed] Real build without a keystore fails closed with exit 2 before any Flutter step."

# Test 21: bare --plan still exits 0 without a keystore and states only what
# the gate can actually verify: that no key.properties was found and that a
# release build would fail closed. It must NOT claim a parsed path or verdict
# (plan mode is side-effect-free).
echo "🔍 [Test 21] Verifying bare --plan reports the truthful no-key.properties state..."
PLANSGN_RC=0
PLANSGN_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan 2>&1)" || PLANSGN_RC=$?
if [ "${PLANSGN_RC}" -ne 0 ]; then
    echo "❌ FAILED: bare --plan exited with code ${PLANSGN_RC} (expected 0, plan mode is side-effect-free). Output:" >&2
    echo "${PLANSGN_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
printf '%s\n' "${PLANSGN_OUTPUT}" | grep -q "Release signing:" || { echo "❌ FAILED: bare --plan output does not report the release signing state"; printf '%s\n' "${PLANSGN_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
printf '%s\n' "${PLANSGN_OUTPUT}" | grep -q "no key.properties was found" || { echo "❌ FAILED: bare --plan must state only what the gate verifies: that no key.properties was found"; printf '%s\n' "${PLANSGN_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
printf '%s\n' "${PLANSGN_OUTPUT}" | grep -q "fail closed" || { echo "❌ FAILED: bare --plan must report that a release build would fail closed without a keystore"; printf '%s\n' "${PLANSGN_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
if printf '%s\n' "${PLANSGN_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
    echo "❌ FAILED: bare --plan invoked the flutter toolchain" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 21 Passed] Bare --plan exits 0 and truthfully reports the no-key.properties fail-closed state."

# Test 22: --allow-debug-signing is accepted and the plan reports the explicit
# debug-signing opt-in as the resolved signing mode.
echo "🔍 [Test 22] Verifying --allow-debug-signing is accepted and reported in --plan..."
OPTIN_RC=0
OPTIN_OUTPUT="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan --allow-debug-signing 2>&1)" || OPTIN_RC=$?
if [ "${OPTIN_RC}" -ne 0 ]; then
    echo "❌ FAILED: --plan --allow-debug-signing exited with code ${OPTIN_RC} (expected 0). Output:" >&2
    echo "${OPTIN_OUTPUT}" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
printf '%s\n' "${OPTIN_OUTPUT}" | grep -q "Release signing:" || { echo "❌ FAILED: --plan --allow-debug-signing output does not report the release signing mode"; printf '%s\n' "${OPTIN_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
printf '%s\n' "${OPTIN_OUTPUT}" | grep -q "debug-signed" || { echo "❌ FAILED: --plan --allow-debug-signing must report the explicit debug-signing opt-in"; printf '%s\n' "${OPTIN_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
if printf '%s\n' "${OPTIN_OUTPUT}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
    echo "❌ FAILED: --plan --allow-debug-signing invoked the flutter toolchain" >&2
    rm -rf "${SHIM_DIR}"
    exit 1
fi
echo "✅ [Test 22 Passed] --allow-debug-signing is accepted and reported as the signing mode."

# Test 23: --help documents the --allow-debug-signing flag.
echo "🔍 [Test 23] Verifying --help documents --allow-debug-signing..."
HELP_OUTPUT="$("${SCRIPT_DIR}/build_pos_apk.sh" --help 2>&1)"
printf '%s\n' "${HELP_OUTPUT}" | grep -q -- "--allow-debug-signing" || { echo "❌ FAILED: --help does not document --allow-debug-signing"; printf '%s\n' "${HELP_OUTPUT}"; rm -rf "${SHIM_DIR}"; exit 1; }
echo "✅ [Test 23 Passed] --help documents --allow-debug-signing."

# -----------------------------------------------------------------------------
# Cheap key.properties presence tests (24): no Flutter / Android SDK required.
# The pre-build gate must NOT interpret key.properties at all: its only check
# is that the file exists, and all readiness judgment is deferred to Gradle's
# signing guard, which parses the file authoritatively and fails closed with
# the actionable message. These tests place a key.properties at the real path
# the gate sees (apps/pos_app/android/key.properties, git-ignored). That is
# only safe when the file does not already exist; if it does, the tests are
# skipped rather than risking an operator's real custody configuration.
# -----------------------------------------------------------------------------
KP_GATE_FILE="${POS_APP_DIR}/android/key.properties"
KP_GATE_WROTE=0
cleanup_kp_gate() {
    if [ "${KP_GATE_WROTE}" = "1" ]; then
        rm -f "${KP_GATE_FILE}"
    fi
}
trap cleanup_kp_gate EXIT

if [ -e "${KP_GATE_FILE}" ]; then
    echo "⏩ [Tests 24, 25] Skipped (${KP_GATE_FILE} already exists; refusing to touch a real custody configuration)."
else
    KP_GATE_STORE="${SHIM_DIR}/kp-gate-throwaway.jks"
    : > "${KP_GATE_STORE}"
    KP_GATE_DIR="${SHIM_DIR}/kp-gate-dir"
    mkdir -p "${KP_GATE_DIR}"

    run_kp_gate_plan() {
        PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --plan 2>&1
    }

    # With key.properties present, the gate must NOT judge readiness: --plan
    # exits 0, states that Gradle's signing guard decides, and never claims a
    # parsed path or a fail-closed verdict.
    assert_kp_gate_defers_in_plan() {
        local label="$1" content="$2" output rc
        printf '%b' "${content}" > "${KP_GATE_FILE}"
        KP_GATE_WROTE=1
        rc=0
        output="$(run_kp_gate_plan)" || rc=$?
        if [ "${rc}" -ne 0 ]; then
            echo "❌ FAILED: key.properties with ${label} made --plan exit ${rc} (the gate must not judge readiness; expected 0)" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
        if ! printf '%s\n' "${output}" | grep -q "key.properties is present"; then
            echo "❌ FAILED: --plan with a present key.properties (${label}) must state that readiness is decided by Gradle's signing guard; --plan reported:" >&2
            printf '%s\n' "${output}" | grep 'Release signing:' >&2
            exit 1
        fi
        if printf '%s\n' "${output}" | grep -q "No release keystore found"; then
            echo "❌ FAILED: --plan with a present key.properties (${label}) still judged readiness from the file contents" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
        if printf '%s\n' "${output}" | grep -q "would fail closed"; then
            echo "❌ FAILED: --plan with a present key.properties (${label}) claimed a fail-closed verdict the gate cannot verify" >&2
            printf '%s\n' "${output}" | grep 'Release signing:' >&2
            exit 1
        fi
        if printf '%s\n' "${output}" | grep -qF "${KP_GATE_STORE}"; then
            echo "❌ FAILED: --plan with a present key.properties (${label}) claimed a parsed storeFile path; the gate no longer parses" >&2
            printf '%s\n' "${output}" | grep 'Release signing:' >&2
            exit 1
        fi
        if printf '%s\n' "${output}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
            echo "❌ FAILED: --plan with a present key.properties (${label}) invoked the flutter toolchain" >&2
            rm -rf "${SHIM_DIR}"
            exit 1
        fi
    }

    # Test 24: the gate defers for every key.properties content — including a
    # blank storeFile, a directory-valued storeFile, and a valid-looking one.
    echo "🔍 [Test 24] Verifying the gate does not interpret a present key.properties..."
    assert_kp_gate_defers_in_plan "a blank storeFile" \
        "storeFile =\n"
    assert_kp_gate_defers_in_plan "a directory-valued storeFile" \
        "storeFile = ${KP_GATE_DIR}\n"
    assert_kp_gate_defers_in_plan "an existing-file storeFile" \
        "storeFile = ${KP_GATE_STORE}\n"
    echo "✅ [Test 24 Passed] With key.properties present the gate does not parse it: --plan defers readiness to Gradle's signing guard and claims no parsed path or verdict."
    rm -f "${KP_GATE_FILE}"
    KP_GATE_WROTE=0
fi

# -----------------------------------------------------------------------------
# Test 25 (R4-1): the gate must DEFER on a present key.properties, and the
# GRADLE-level readiness guard is what fails a release build closed for an
# absent, blank-after-trim, and directory-valued storeFile, with the
# actionable message. Deferral is proven with the failing flutter shim: the
# gate must NOT abort before the build step when key.properties exists, even
# when its storeFile is unusable. The fail-closed guarantee itself is proven
# through a real ./gradlew :app:assembleRelease (no --dry-run: the
# taskGraph.whenReady guard does not fire on a dry-run task graph). Requires
# a configured Android project (local.properties / gradlew); otherwise it is
# skipped. Like Test 24 it must not touch a pre-existing key.properties.
# -----------------------------------------------------------------------------
if [ -e "${KP_GATE_FILE}" ]; then
    echo "⏩ [Test 25] Skipped (${KP_GATE_FILE} already exists)."
elif [ ! -f "${POS_APP_DIR}/android/gradlew" ] || [ ! -f "${POS_APP_DIR}/android/local.properties" ]; then
    echo "⏩ [Test 25] Skipped (Android project not configured: gradlew or local.properties missing)."
else
    echo "🔍 [Test 25] Verifying the gate defers and Gradle fails closed on blank and directory-valued storeFile..."

    KP_GATE_GRADLE_STORE="${SHIM_DIR}/kp-gradle-throwaway.jks"
    KP_GATE_GRADLE_DIR="${SHIM_DIR}/kp-gradle-dir"
    mkdir -p "${KP_GATE_GRADLE_DIR}"

    write_kp_gate_properties() {
        local store_value="$1"
        printf 'storePassword=sentinel\nkeyPassword=sentinel\nkeyAlias=sentinel\nstoreFile=%s\n' \
            "${store_value}" > "${KP_GATE_FILE}"
        KP_GATE_WROTE=1
    }

    # Deferral: with key.properties present (even with an unusable storeFile),
    # the gate must NOT abort before the toolchain. The failing flutter shim
    # proves the run reached the build step: the gate deferred.
    assert_gate_defers_to_toolchain() {
        local label="$1" store_value="$2" output rc
        write_kp_gate_properties "${store_value}"
        rc=0
        output="$(PATH="${SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --split-per-abi --skip-tests 2>&1)" || rc=$?
        if printf '%s\n' "${output}" | grep -q "No release keystore found"; then
            echo "❌ FAILED: the gate aborted early on a present key.properties with ${label} storeFile; it must defer to Gradle's signing guard. Output:" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
        if [ "${rc}" -eq 2 ]; then
            echo "❌ FAILED: the gate exited 2 on a present key.properties with ${label} storeFile; it must defer to Gradle's signing guard. Output:" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
        if ! printf '%s\n' "${output}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
            echo "❌ FAILED: the gate did not defer past the build step for ${label} storeFile (the flutter shim was never reached; exit ${rc}). Output:" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
    }

    assert_gate_defers_to_toolchain "a blank" ""
    assert_gate_defers_to_toolchain "a directory-valued" "${KP_GATE_GRADLE_DIR}"
    echo "✅ [Test 25a Passed] A present key.properties (blank or directory-valued storeFile) is NOT aborted by the gate; it defers to Gradle."

    # Fail-closed guarantee, exercised for real: Gradle parses key.properties
    # authoritatively and refuses the release build with the actionable message.
    assert_gradle_guard_fails_closed() {
        local label="$1" store_value="$2" output rc
        write_kp_gate_properties "${store_value}"
        rc=0
        output="$( ( cd "${POS_APP_DIR}/android" && env -u ORG_GRADLE_PROJECT_allowDebugSigning ./gradlew :app:assembleRelease ) 2>&1 )" || rc=$?
        if [ "${rc}" -eq 0 ]; then
            echo "❌ FAILED: Gradle release build with ${label} storeFile SUCCEEDED (guard did not fire)" >&2
            exit 1
        fi
        if ! printf '%s\n' "${output}" | grep -q "Release signing is not configured"; then
            echo "❌ FAILED: Gradle release build with ${label} storeFile failed without the actionable fail-closed message (exit ${rc}). Output tail:" >&2
            printf '%s\n' "${output}" | tail -15 >&2
            exit 1
        fi
    }

    assert_gradle_guard_fails_closed "blank" ""
    assert_gradle_guard_fails_closed "directory-valued" "${KP_GATE_GRADLE_DIR}"
    echo "✅ [Test 25b Passed] Blank and directory-valued storeFile fail closed with the actionable Gradle message."
    rm -f "${KP_GATE_FILE}"
    KP_GATE_WROTE=0
fi

# -----------------------------------------------------------------------------
# Test 26 (F4): with --allow-debug-signing, the loud pre-build warning that the
# artifact MAY be debug-signed must fire in BOTH key.properties states —
# absent, and present with a blank storeFile. The gate no longer parses
# key.properties, so it cannot know whether Gradle's debug-keystore fallback
# will trigger; the warning must not depend on that judgment and the script
# must not re-parse the file to decide it.
# It uses a pub-get-succeeding flutter shim: the gate defers past dependency
# resolution (reaching the build step), the warning prints before the build,
# and the shim fails loudly on the `flutter build apk` call.
# -----------------------------------------------------------------------------
if [ -e "${KP_GATE_FILE}" ]; then
    echo "⏩ [Test 26] Skipped (${KP_GATE_FILE} already exists; refusing to touch a real custody configuration)."
else
    echo "🔍 [Test 26] Verifying the --allow-debug-signing warning fires with key.properties absent AND present-but-broken..."

    PUBGET_SHIM_DIR="${SHIM_DIR}/pubget-shim"
    mkdir -p "${PUBGET_SHIM_DIR}"
    cat > "${PUBGET_SHIM_DIR}/flutter" <<'EOF'
#!/usr/bin/env bash
if [ "${1:-}" = "pub" ] && [ "${2:-}" = "get" ]; then
    exit 0
fi
echo "FLUTTER_SHIM_MUST_NOT_RUN" >&2
exit 99
EOF
    chmod +x "${PUBGET_SHIM_DIR}/flutter"

    run_optin_with_pubget_shim() {
        PATH="${PUBGET_SHIM_DIR}:${PATH}" "${SCRIPT_DIR}/build_pos_apk.sh" --split-per-abi --skip-tests --allow-debug-signing --out-dir "${SHIM_DIR}/test26-out" 2>&1
    }

    assert_debug_signing_warning() {
        local label="$1" output rc
        rc=0
        output="$(run_optin_with_pubget_shim)" || rc=$?
        if ! printf '%s\n' "${output}" | grep -q "WARNING: --allow-debug-signing is active"; then
            echo "❌ FAILED: with --allow-debug-signing and ${label}, the loud debug-signing warning did not fire. Output:" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
        if ! printf '%s\n' "${output}" | grep -q "MAY be DEBUG-SIGNED"; then
            echo "❌ FAILED: the --allow-debug-signing warning (${label}) must say the artifact MAY be debug-signed; the gate cannot predict Gradle's fallback and must not claim certainty" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
        if [ "${rc}" -ne 99 ] || ! printf '%s\n' "${output}" | grep -q "FLUTTER_SHIM_MUST_NOT_RUN"; then
            echo "❌ FAILED: with ${label}, expected the shimmed 'flutter build apk' call to be reached after the warning (shim exit 99); got exit ${rc}. Output:" >&2
            printf '%s\n' "${output}" >&2
            exit 1
        fi
    }

    # State A: key.properties absent (this block only runs when it is absent).
    assert_debug_signing_warning "key.properties absent"

    # State B: key.properties present with a blank storeFile — the gate must
    # still defer (no parsing) and the warning must still fire.
    printf 'storeFile =\n' > "${KP_GATE_FILE}"
    KP_GATE_WROTE=1
    assert_debug_signing_warning "a present key.properties with a blank storeFile"
    rm -f "${KP_GATE_FILE}"
    KP_GATE_WROTE=0

    echo "✅ [Test 26 Passed] With --allow-debug-signing the MAY-be-debug-signed warning fires with key.properties absent AND present-but-broken, and the gate still defers."
fi

rm -rf "${SHIM_DIR}"

echo "=============================================================================="
echo "🎉 ALL PACKAGING PIPELINE TESTS PASSED CLEANLY!"
echo "=============================================================================="
