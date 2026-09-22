#!/usr/bin/env bash
# ==============================================================================
# OmniFood NI — Android POS Automated Release Packaging Pipeline
# ==============================================================================
# Builds optimized Release Candidate APKs with ProGuard/R8, computes SHA-256
# checksums, verifies size constraints, and produces a structured release manifest.
# ==============================================================================

set -euo pipefail

# Script directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
POS_APP_DIR="${ROOT_DIR}/apps/pos_app"
DEFAULT_OUT_DIR="${ROOT_DIR}/dist/release_candidate"

# Configuration Flags
BUILD_MODE="both" # split, universal, both
RUN_TESTS=true
RUN_CODEGEN=false
OUT_DIR="${DEFAULT_OUT_DIR}"
DEVICE_ID=""
API_URL=""
PILOT_MODE=false
PLAN_ONLY=false

# Validate a --device-id candidate: trimmed, non-empty, no whitespace, max 64 chars.
validate_device_id() {
    local raw="$1"
    local id
    id="$(printf '%s' "${raw}" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//')"
    if [ -z "${id}" ]; then
        echo "Invalid --device-id: value is empty after trimming." >&2
        exit 1
    fi
    if printf '%s' "${id}" | grep -q '[[:space:]]'; then
        echo "Invalid --device-id: '${raw}' contains whitespace." >&2
        exit 1
    fi
    if [ "${#id}" -gt 64 ]; then
        echo "Invalid --device-id: value exceeds 64 characters (got ${#id})." >&2
        exit 1
    fi
    DEVICE_ID="${id}"
}

# Validate an --api-url candidate: absolute http:// or https:// URL with no
# whitespace and a non-empty host. Rejected before any side effect.
validate_api_url() {
    local raw="$1"
    if [ -z "${raw}" ]; then
        echo "Invalid --api-url: value is empty." >&2
        exit 1
    fi
    if printf '%s' "${raw}" | grep -q '[[:space:]]'; then
        echo "Invalid --api-url: '${raw}' contains whitespace." >&2
        exit 1
    fi
    local host
    host="$(printf '%s' "${raw}" | sed -n 's#^https\?://\([^/]*\).*#\1#p')"
    if [ -z "${host}" ]; then
        echo "Invalid --api-url: '${raw}' must be an absolute http:// or https:// URL with a non-empty host (e.g. https://api-staging.example.com/api)." >&2
        exit 1
    fi
    API_URL="${raw}"
}

# Parse Arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --split-per-abi)
            BUILD_MODE="split"
            shift
            ;;
        --universal)
            BUILD_MODE="universal"
            shift
            ;;
        --both)
            BUILD_MODE="both"
            shift
            ;;
        --skip-tests)
            RUN_TESTS=false
            shift
            ;;
        --with-codegen)
            RUN_CODEGEN=true
            shift
            ;;
        --out-dir)
            if [ "$#" -lt 2 ]; then
                echo "Invalid --out-dir: missing required value." >&2
                exit 1
            fi
            OUT_DIR="$2"
            shift 2
            ;;
        --device-id)
            if [ "$#" -lt 2 ]; then
                echo "Invalid --device-id: missing required value." >&2
                exit 1
            fi
            validate_device_id "$2"
            shift 2
            ;;
        --api-url)
            if [ "$#" -lt 2 ]; then
                echo "Invalid --api-url: missing required value." >&2
                exit 1
            fi
            validate_api_url "$2"
            shift 2
            ;;
        --pilot)
            PILOT_MODE=true
            shift
            ;;
        --plan)
            PLAN_ONLY=true
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --split-per-abi   Build separate APKs for armeabi-v7a, arm64-v8a, x86_64"
            echo "  --universal       Build a single universal APK"
            echo "  --both            Build both split APKs and universal APK (Default)"
            echo "  --device-id <id>  Canonical terminal id baked into the APK via"
            echo "                    --dart-define=DEVICE_ID (trimmed, no whitespace, max 64 chars)"
            echo "  --api-url <url>   Backend base URL baked into the APK via"
            echo "                    --dart-define=API_URL (absolute http:// or https:// URL,"
            echo "                    no whitespace, non-empty host). REQUIRED for --pilot;"
            echo "                    fleet builds omit it and provision the terminal at runtime"
            echo "  --pilot           Pilot/single-terminal build; REQUIRES --device-id and --api-url"
            echo "  --plan            Print resolved configuration and the exact flutter build apk"
            echo "                    command(s), then exit 0 without building (no Flutter/SDK needed)"
            echo "  --skip-tests      Skip running Flutter test suite"
            echo "  --with-codegen    Run build_runner code generation before building"
            echo "  --out-dir <path>  Specify output directory (default: dist/release_candidate)"
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Pilot builds fail closed without a baked terminal id: the installed app would
# resolve to pos-local-<uuid> and could never match its activation attempt.
if [ "${PILOT_MODE}" = true ] && [ -z "${DEVICE_ID}" ]; then
    echo "ERROR: --pilot requires --device-id (missing terminal id)." >&2
    echo "Without a baked terminal id the installed app resolves to 'pos-local-<uuid>' and cannot match its activation attempt." >&2
    exit 2
fi

# Pilot builds fail closed without a baked backend URL: the pilot artifact must
# state which backend it targets, otherwise the installed app would silently
# fall back to the app's localhost default and never reach a deployed backend.
if [ "${PILOT_MODE}" = true ] && [ -z "${API_URL}" ]; then
    echo "ERROR: --pilot requires --api-url (missing backend URL)." >&2
    echo "The pilot artifact must state which backend it targets; without a baked API_URL the installed app silently uses its localhost default." >&2
    exit 2
fi

# Terminal identity binding
DART_DEFINE_ARGS=()
TERMINAL_ID_BINDING="provisioned-at-runtime"
if [ -n "${DEVICE_ID}" ]; then
    DART_DEFINE_ARGS+=("--dart-define=DEVICE_ID=${DEVICE_ID}")
    TERMINAL_ID_BINDING="${DEVICE_ID}"
fi

# Backend URL binding: only baked when explicitly provided. Fleet builds keep
# 'provisioned-at-runtime' and must NOT bake an API_URL define.
API_URL_BINDING="provisioned-at-runtime"
if [ -n "${API_URL}" ]; then
    DART_DEFINE_ARGS+=("--dart-define=API_URL=${API_URL}")
    API_URL_BINDING="${API_URL}"
fi

# Plan mode: print resolved configuration and exact build commands, then stop.
# Must run before any side effect and must not require Flutter or the Android SDK.
if [ "${PLAN_ONLY}" = true ]; then
    echo "=============================================================================="
    echo "📋 Plan — OmniFood POS Release Candidate Packaging"
    echo "=============================================================================="
    echo "📁 Root Directory:      ${ROOT_DIR}"
    echo "📱 App Directory:       ${POS_APP_DIR}"
    echo "📦 Output Directory:    ${OUT_DIR}"
    echo "⚙️  Build Mode:          ${BUILD_MODE}"
    echo "🧪 Run Tests:           ${RUN_TESTS}"
    echo "🔨 Run Codegen:         ${RUN_CODEGEN}"
    echo "🆔 Terminal identity:   ${TERMINAL_ID_BINDING}"
    if [ -z "${DEVICE_ID}" ]; then
        echo "   (fleet build: no DEVICE_ID dart-define is baked; terminal is provisioned at runtime)"
    fi
    echo "🌐 API URL:             ${API_URL_BINDING}"
    if [ -z "${API_URL}" ]; then
        echo "   (fleet build: no API_URL dart-define is baked; backend is provisioned at runtime)"
    fi
    echo "📋 release_manifest.json would record terminal_identity: ${TERMINAL_ID_BINDING}"
    echo "📋 release_manifest.json would record api_url: ${API_URL_BINDING}"
    echo "------------------------------------------------------------------------------"
    echo "flutter build apk command(s) that would run:"
    if [ "${BUILD_MODE}" = "split" ] || [ "${BUILD_MODE}" = "both" ]; then
        echo "  flutter build apk --release --split-per-abi ${DART_DEFINE_ARGS[*]:-}"
    fi
    if [ "${BUILD_MODE}" = "universal" ] || [ "${BUILD_MODE}" = "both" ]; then
        echo "  flutter build apk --release ${DART_DEFINE_ARGS[*]:-}"
    fi
    echo "=============================================================================="
    echo "Plan mode: no dependencies resolved, no tests, no codegen, no build executed."
    exit 0
fi

echo "=============================================================================="
echo "🚀 OmniFood POS — Release Candidate Packaging Pipeline"
echo "=============================================================================="
echo "📁 Root Directory:      ${ROOT_DIR}"
echo "📱 App Directory:       ${POS_APP_DIR}"
echo "📦 Output Directory:    ${OUT_DIR}"
echo "⚙️  Build Mode:          ${BUILD_MODE}"
echo "🧪 Run Tests:           ${RUN_TESTS}"
echo "🔨 Run Codegen:         ${RUN_CODEGEN}"
echo "🆔 Terminal Identity:   ${TERMINAL_ID_BINDING}"
echo "=============================================================================="

# Ensure output directory exists
mkdir -p "${OUT_DIR}"

cd "${POS_APP_DIR}"

# 1. Dependency Resolution
echo "📦 [1/5] Resolving Flutter dependencies..."
flutter pub get

# 2. Optional Code Generation
if [ "${RUN_CODEGEN}" = true ]; then
    echo "🔨 [2/5] Running code generation (build_runner)..."
    flutter pub run build_runner build --delete-conflicting-outputs
else
    echo "⏩ [2/5] Skipping code generation (pass --with-codegen if needed)."
fi

# 3. Test Suite Verification
if [ "${RUN_TESTS}" = true ]; then
    echo "🧪 [3/5] Running Flutter test suite..."
    flutter test
else
    echo "⏩ [3/5] Tests skipped (--skip-tests active)."
fi

# 4. Building APKs
echo "🏗️  [4/5] Building Release Candidate APK(s)..."

BUILD_OUTPUT_DIR="${POS_APP_DIR}/build/app/outputs/flutter-apk"

if [ "${BUILD_MODE}" = "split" ] || [ "${BUILD_MODE}" = "both" ]; then
    echo "  -> Compiling Split-per-ABI APKs (armeabi-v7a, arm64-v8a, x86_64)..."
    flutter build apk --release --split-per-abi ${DART_DEFINE_ARGS[@]+"${DART_DEFINE_ARGS[@]}"}
    cp "${BUILD_OUTPUT_DIR}"/app-*-release.apk "${OUT_DIR}/" 2>/dev/null || true
fi

if [ "${BUILD_MODE}" = "universal" ] || [ "${BUILD_MODE}" = "both" ]; then
    echo "  -> Compiling Universal Release APK..."
    flutter build apk --release ${DART_DEFINE_ARGS[@]+"${DART_DEFINE_ARGS[@]}"}
    cp "${BUILD_OUTPUT_DIR}/app-release.apk" "${OUT_DIR}/app-universal-release.apk" 2>/dev/null || true
fi

# 5. Checksum & Manifest Generation
echo "🔒 [5/5] Generating Checksums and Release Manifest..."

cd "${OUT_DIR}"

# Generate SHA256SUMS.txt
if command -v sha256sum >/dev/null 2>&1; then
    sha256sum *.apk > SHA256SUMS.txt
elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 *.apk > SHA256SUMS.txt
fi

GIT_COMMIT="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo "unknown")"
BUILD_TIMESTAMP="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
APP_VERSION="$(grep '^version:' "${POS_APP_DIR}/pubspec.yaml" | awk '{print $2}')"

# Build release manifest JSON
cat <<EOF > release_manifest.json
{
  "project": "OmniFood POS",
  "target_hardware": "Android POS terminal",
  "version": "${APP_VERSION}",
  "git_commit": "${GIT_COMMIT}",
  "build_timestamp": "${BUILD_TIMESTAMP}",
  "terminal_identity": "${TERMINAL_ID_BINDING}",
  "api_url": "${API_URL_BINDING}",
  "artifacts": [
EOF

FIRST=true
for apk in *.apk; do
    if [ -f "$apk" ]; then
        FILE_SIZE_BYTES="$(wc -c < "$apk" | tr -d ' ')"
        FILE_SIZE_HUMAN="$(ls -lh "$apk" | awk '{print $5}')"
        FILE_SHA256="$(grep "$apk" SHA256SUMS.txt | awk '{print $1}')"

        if [ "$FIRST" = true ]; then
            FIRST=false
        else
            echo "," >> release_manifest.json
        fi

        cat <<EOF >> release_manifest.json
    {
      "file": "${apk}",
      "size_bytes": ${FILE_SIZE_BYTES},
      "size_human": "${FILE_SIZE_HUMAN}",
      "sha256": "${FILE_SHA256}"
    }
EOF
    fi
done

cat <<EOF >> release_manifest.json
  ]
}
EOF

echo ""
echo "=============================================================================="
echo "✅ Release Candidate Artifacts Generated Successfully!"
echo "=============================================================================="
cat SHA256SUMS.txt
echo ""
echo "📋 Release Manifest:"
cat release_manifest.json
echo "=============================================================================="
