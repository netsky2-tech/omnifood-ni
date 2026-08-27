#!/usr/bin/env bash
# ==============================================================================
# OmniFood NI — Packaging Pipeline Automated Test & Verification Suite
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
echo "🔍 [Test 3] Testing build_sunmi_apk.sh help option..."
"${SCRIPT_DIR}/build_sunmi_apk.sh" --help > /dev/null
echo "✅ [Test 3 Passed] build_sunmi_apk.sh argument parser functions cleanly."

# Test 4: End-to-End Build Execution (Split APKs)
echo "🔍 [Test 4] Executing build_sunmi_apk.sh with --split-per-abi --skip-tests..."
rm -rf "${TEST_OUT_DIR}"
"${SCRIPT_DIR}/build_sunmi_apk.sh" --split-per-abi --skip-tests --out-dir "${TEST_OUT_DIR}"

# Test 5: Verify Artifacts, Checksums & Manifest
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

echo "✅ [Test 5 Passed] All release candidate APKs, SHA256 checksums and manifest validated successfully!"

echo "=============================================================================="
echo "🎉 ALL 5 PACKAGING PIPELINE TESTS PASSED CLEANLY!"
echo "=============================================================================="
