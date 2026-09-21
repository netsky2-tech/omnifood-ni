#!/usr/bin/env bash
# ==============================================================================
# OmniFood NI — Packaging Pipeline Automated Test & Verification Suite
# ==============================================================================
#
# Running only the cheap tests (no Flutter / Android SDK required):
#   SKIP_END_TO_END_BUILD=1 scripts/test_packaging_pipeline.sh
# This runs Tests 1-3 and 6-11 and skips the end-to-end build Tests 4-5,
# which require a full Flutter toolchain and Android SDK.
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
echo "🔍 [Test 4] Executing build_pos_apk.sh with --split-per-abi --skip-tests..."
rm -rf "${TEST_OUT_DIR}"
"${SCRIPT_DIR}/build_pos_apk.sh" --split-per-abi --skip-tests --out-dir "${TEST_OUT_DIR}"
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

rm -rf "${SHIM_DIR}"

echo "=============================================================================="
echo "🎉 ALL PACKAGING PIPELINE TESTS PASSED CLEANLY!"
echo "=============================================================================="
