#!/usr/bin/env bash
# ==============================================================================
# OmniFood NI — Release Keystore Provisioning Test Suite (S0-02)
# ==============================================================================
#
# Focused shell test for scripts/provision_release_keystore.sh, in the style of
# scripts/test_packaging_pipeline.sh: clear pass/fail lines, non-zero exit on
# failure, no heavy toolchain (requires only bash + the real `keytool`).
#
# Everything runs inside a temporary directory. The suite generates only short
# throwaway keys with a distinct alias, and deletes them on every exit path
# (including failures) via the EXIT trap below. It must leave behind:
#   - no keystore (no *.jks / *.keystore / *.p12),
#   - no key.properties,
#   - no secret of any kind,
# neither in the temporary area (removed) nor in the repository.
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROVISION="${SCRIPT_DIR}/provision_release_keystore.sh"

TMP_BASE="$(mktemp -d)"
cleanup() { rm -rf "${TMP_BASE}"; }
trap cleanup EXIT INT TERM

# Defined BEFORE the hash snapshot below: `fail` is invoked by the snapshot
# setup, so it must exist by then (otherwise a snapshot failure would surface
# as exit 127 instead of the intended message).
fail() { echo "❌ FAILED: $*" >&2; exit 1; }

# Content snapshot for the final hygiene test (Test 17): at suite start,
# record the content hashes of EVERY tracked file in the repository — the
# whole repo, because a suite writing anywhere into the repository is the
# risk being guarded, not just writes under scripts/. Tracked build
# artifacts (files under __pycache__/) are excluded: they are regenerated
# byte-for-byte by unrelated tooling, and a hash diff there would make the
# check fire for reasons unrelated to the suite. This snapshot captures the
# working tree AS IT IS, so a pre-existing uncommitted modification does not
# fail the hygiene check; only a change made BY the suite does. This replaces
# an old `git status --porcelain` assertion that could never pass while the
# scripts under test were being modified — a red signal unrelated to behavior.
HASH_SNAPSHOT="${TMP_BASE}/tracked-hashes-at-start.txt"
( cd "${ROOT_DIR}" && git ls-files -z \
    | grep -zv -e '/__pycache__/' -e '\.pyc$' \
    | xargs -0 -r sha256sum ) \
  > "${HASH_SNAPSHOT}" || fail "test setup: could not snapshot tracked-file hashes"

# Throwaway passwords: random per run, never reused, never printed. The
# provisioning tool now takes ONE password (used as both store and key
# password — PKCS12 cannot hold a distinct key password), so the suite has a
# single throwaway secret.
PW_STORE="St-$(head -c 16 /dev/urandom | base64 | tr -d '=+/')"
# Distinct alias for every throwaway key, so nothing can collide with a real
# upload alias on this machine.
THROWAWAY_ALIAS="throwaway-$RANDOM-$RANDOM"

# Runs the provisioning script with piped prompt answers:
# password, password confirm, alias, dname.
# Empty last two lines accept the defaults.
# PROVISION_BIN may override the script under test (used by the symlinked-
# invocation test); it defaults to the repository script.
run_provision() {
  local __bin="${PROVISION_BIN:-${PROVISION}}"
  printf '%s\n%s\n%s\n%s\n' "${PW_STORE}" "${PW_STORE}" "" "" \
    | "${__bin}" "$@"
}

echo "🧪 Starting Release Keystore Provisioning Test Suite..."
if [ ! -x "${PROVISION}" ]; then
  # RED expected on the first run: the provisioning script does not exist yet.
  fail "provisioning script not found or not executable: ${PROVISION}"
fi

REAL_KEYTOOL="$(command -v keytool)" || fail "real keytool is required by this suite"

# -----------------------------------------------------------------------------
# Test 1: --help documents the operator-facing flags.
# -----------------------------------------------------------------------------
echo "🔍 [Test 1] Verifying --help documents the flags..."
HELP_RC=0
HELP_OUT="$("$PROVISION" --help 2>&1)" || HELP_RC=$?
if [ "${HELP_RC}" -ne 0 ]; then
  fail "--help exited with code ${HELP_RC} (expected 0). Output: ${HELP_OUT}"
fi
for FLAG in --keystore-path --alias --validity-days --force --key-properties-path; do
  printf '%s\n' "${HELP_OUT}" | grep -q -- "${FLAG}" \
    || fail "--help does not document ${FLAG}"
done
echo "✅ [Test 1 Passed] --help documents keystore-path, alias, validity-days, force and key-properties-path."

# -----------------------------------------------------------------------------
# Test 2: fail closed when keytool is unavailable.
#   2a: a keytool shim that fails; 2b: keytool entirely absent from PATH.
# -----------------------------------------------------------------------------
echo "🔍 [Test 2] Verifying the fail-closed path when keytool is unavailable..."

SB2="${TMP_BASE}/t2"; mkdir -p "${SB2}/out"
BADSHIM="${TMP_BASE}/t2-shim"; mkdir "${BADSHIM}"
cat > "${BADSHIM}/keytool" <<EOF
#!/usr/bin/env bash
echo "SHIM_KEYTOOL_FAILS" >&2
exit 1
EOF
chmod +x "${BADSHIM}/keytool"

T2A_RC=0
T2A_OUT="$(PATH="${BADSHIM}:${PATH}" run_provision \
  --keystore-path "${SB2}/out/test.jks" \
  --key-properties-path "${SB2}/out/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T2A_RC=$?
if [ "${T2A_RC}" -eq 0 ]; then
  fail "failing keytool shim was not detected (exit 0)"
fi
printf '%s\n' "${T2A_OUT}" | grep -qi "keytool" \
  || fail "fail-closed message must mention keytool. Output: ${T2A_OUT}"
[ ! -e "${SB2}/out/test.jks" ] || fail "a keystore was created despite the failing keytool"

NOTOOL_DIR="${TMP_BASE}/t2-notool"; mkdir "${NOTOOL_DIR}"
for d in /usr/bin /bin; do
  for f in "${d}"/*; do
    b="$(basename "${f}")"
    [ "${b}" = "keytool" ] && continue
    [ -e "${NOTOOL_DIR}/${b}" ] || ln -s "${f}" "${NOTOOL_DIR}/${b}" 2>/dev/null || true
  done
done
T2B_RC=0
T2B_OUT="$(PATH="${NOTOOL_DIR}" run_provision \
  --keystore-path "${SB2}/out/test.jks" \
  --key-properties-path "${SB2}/out/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T2B_RC=$?
if [ "${T2B_RC}" -eq 0 ]; then
  fail "absent keytool was not detected (exit 0)"
fi
printf '%s\n' "${T2B_OUT}" | grep -qi "keytool" \
  || fail "absent-keytool failure message must mention keytool. Output: ${T2B_OUT}"
[ ! -e "${SB2}/out/test.jks" ] || fail "a keystore was created although keytool is absent"
echo "✅ [Test 2 Passed] Failing and absent keytool both fail closed with a clear message and no keystore."

# -----------------------------------------------------------------------------
# Test 3: refuses to overwrite an existing keystore without --force; the
# original keystore is left byte-identical.
# -----------------------------------------------------------------------------
echo "🔍 [Test 3] Verifying the keystore overwrite guard..."
SB3="${TMP_BASE}/t3"; mkdir -p "${SB3}"
KS3="${SB3}/upload-test.jks"
KP3="${SB3}/key.properties"

run_provision \
  --keystore-path "${KS3}" \
  --key-properties-path "${KP3}" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 > /dev/null 2>&1 \
  || fail "first provisioning run (setup) failed"
KS3_SUM1="$(sha256sum "${KS3}" | awk '{print $1}')"
KP3_SUM1="$(sha256sum "${KP3}" | awk '{print $1}')"

T3_RC=0
T3_OUT="$(run_provision \
  --keystore-path "${KS3}" \
  --key-properties-path "${KP3}" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T3_RC=$?
if [ "${T3_RC}" -eq 0 ]; then
  fail "overwrite without --force was accepted"
fi
printf '%s\n' "${T3_OUT}" | grep -q -- "--force" \
  || fail "overwrite refusal must name the --force flag. Output: ${T3_OUT}"
KS3_SUM2="$(sha256sum "${KS3}" | awk '{print $1}')"
KP3_SUM2="$(sha256sum "${KP3}" | awk '{print $1}')"
if [ "${KS3_SUM1}" != "${KS3_SUM2}" ]; then
  fail "existing keystore was modified by the refused overwrite"
fi
if [ "${KP3_SUM1}" != "${KP3_SUM2}" ]; then
  fail "existing key.properties was modified by the refused overwrite"
fi

# Triangulation: the explicit --force flag must actually allow the overwrite.
run_provision --force \
  --keystore-path "${KS3}" \
  --key-properties-path "${KP3}" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 > /dev/null 2>&1 \
  || fail "--force overwrite was refused"
echo "✅ [Test 3 Passed] Overwrite is refused without --force (file byte-identical) and allowed with --force."

# -----------------------------------------------------------------------------
# Test 4: refuses to overwrite an existing key.properties without --force,
# independently of the keystore guard.
# -----------------------------------------------------------------------------
echo "🔍 [Test 4] Verifying the key.properties overwrite guard..."
SB4="${TMP_BASE}/t4"; mkdir -p "${SB4}"
KP4="${SB4}/key.properties"
printf 'storePassword=SENTINEL\n' > "${KP4}"
KP4_SUM1="$(sha256sum "${KP4}" | awk '{print $1}')"
T4_RC=0
T4_OUT="$(run_provision \
  --keystore-path "${SB4}/fresh.jks" \
  --key-properties-path "${KP4}" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T4_RC=$?
if [ "${T4_RC}" -eq 0 ]; then
  fail "key.properties overwrite without --force was accepted"
fi
KP4_SUM2="$(sha256sum "${KP4}" | awk '{print $1}')"
if [ "${KP4_SUM1}" != "${KP4_SUM2}" ]; then
  fail "existing key.properties was modified by the refused overwrite"
fi
[ ! -e "${SB4}/fresh.jks" ] || fail "a keystore was created although key.properties existed"
echo "✅ [Test 4 Passed] Existing key.properties is protected independently and left byte-identical."

# -----------------------------------------------------------------------------
# Test 5: refuses a keystore path inside the repository, and creates nothing.
# -----------------------------------------------------------------------------
echo "🔍 [Test 5] Verifying the keystore-must-live-outside-the-repository guard..."
SB5="${TMP_BASE}/t5"; mkdir -p "${SB5}"
EVIL_KS="${ROOT_DIR}/dist/should-never-exist.jks"
T5_RC=0
T5_OUT="$(run_provision \
  --keystore-path "${EVIL_KS}" \
  --key-properties-path "${SB5}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T5_RC=$?
if [ "${T5_RC}" -eq 0 ]; then
  fail "a keystore path inside the repository was accepted"
fi
printf '%s\n' "${T5_OUT}" | grep -qi "outside the repository" \
  || fail "inside-repo refusal must explain the keystore must live outside the repository. Output: ${T5_OUT}"
[ ! -e "${EVIL_KS}" ] || fail "the refused in-repo keystore path was created anyway"
echo "✅ [Test 5 Passed] Keystore paths inside the repository are refused and nothing is created."

# -----------------------------------------------------------------------------
# Test 6: generated key.properties names an absolute storeFile, carries the
# four required keys with restrictive permissions, and — the F1 regression —
# the value written as keyPassword can ACTUALLY open the private key entry
# (proven by signing a jar with it, the same JCA operation Gradle performs at
# :app:packageRelease). A keyPassword that only looks right hid a real defect
# once: keytool 21 silently ignores a distinct -keypass for PKCS12, so the
# suite must exercise the key, not merely assert the property is present.
# Single-password design: keyPassword must equal storePassword.
# -----------------------------------------------------------------------------
echo "🔍 [Test 6] Verifying the generated key.properties contract..."
SB6="${TMP_BASE}/t6"; mkdir -p "${SB6}"
KS6="${SB6}/upload-test.jks"
KP6="${SB6}/key.properties"
run_provision \
  --keystore-path "${KS6}" \
  --key-properties-path "${KP6}" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 > /dev/null 2>&1 \
  || fail "provisioning run for key.properties contract failed"
[ -f "${KP6}" ] || fail "key.properties was not written"
[ -f "${KS6}" ] || fail "keystore was not written"

for KEYNAME in storePassword keyPassword keyAlias storeFile; do
  grep -q "^${KEYNAME}=" "${KP6}" || fail "key.properties is missing ${KEYNAME}"
done
STORE_FILE_VALUE="$(grep '^storeFile=' "${KP6}" | sed 's/^storeFile=//')"
case "${STORE_FILE_VALUE}" in
  /*) : ;;
  *) fail "storeFile must be an absolute path, found: ${STORE_FILE_VALUE}" ;;
esac
if [ "${STORE_FILE_VALUE}" != "${KS6}" ]; then
  fail "storeFile (${STORE_FILE_VALUE}) does not point at the generated keystore (${KS6})"
fi
grep -q "^keyAlias=${THROWAWAY_ALIAS}$" "${KP6}" || fail "key.properties does not carry the requested alias"
grep -q "^storePassword=${PW_STORE}$" "${KP6}" || fail "storePassword was not written as chosen"
grep -q "^keyPassword=${PW_STORE}$" "${KP6}" || fail "keyPassword was not written (single-password design: it must equal storePassword)"

KP6_PERMS="$(stat -c '%a' "${KP6}")"
if [ "${KP6_PERMS}" != "600" ]; then
  fail "key.properties permissions are ${KP6_PERMS}, expected 600"
fi
KS6_PERMS="$(stat -c '%a' "${KS6}")"
if [ "${KS6_PERMS}" != "600" ]; then
  fail "keystore permissions are ${KS6_PERMS}, expected 600"
fi

KT_LIST_RC=0
KT_LIST_OUT="$(KT_STORE_PASS="${PW_STORE}" "${REAL_KEYTOOL}" -list \
  -keystore "${KS6}" -storepass:env KT_STORE_PASS 2>&1)" || KT_LIST_RC=$?
if [ "${KT_LIST_RC}" -ne 0 ] || ! printf '%s\n' "${KT_LIST_OUT}" | grep -q "${THROWAWAY_ALIAS}"; then
  fail "generated keystore is not listable under the requested alias via -storepass:env"
fi

# F1 regression: the keyPassword value IN key.properties must open the
# PRIVATE key entry. jarsigner performs the same private-key operation as
# Gradle's release signing; a wrong keyPassword fails it with
# "key associated with <alias> not a private key".
REAL_JARSIGNER="$(command -v jarsigner)" || fail "jarsigner is required to prove the keyPassword contract"
REAL_JAR="$(command -v jar)" || fail "jar is required to prove the keyPassword contract"
J6_DIR="${SB6}/jarsign"; mkdir -p "${J6_DIR}"
echo "probe" > "${J6_DIR}/probe.txt"
( cd "${J6_DIR}" && "${REAL_JAR}" cf probe.jar probe.txt ) \
  || fail "test setup: could not create the probe jar"
KP6_KEYPASS="$(grep '^keyPassword=' "${KP6}" | cut -d= -f2-)"
KP6_STOREPASS="$(grep '^storePassword=' "${KP6}" | cut -d= -f2-)"
JS6_RC=0
"${REAL_JARSIGNER}" -keystore "${KS6}" \
  -storepass "${KP6_STOREPASS}" -keypass "${KP6_KEYPASS}" \
  "${J6_DIR}/probe.jar" "${THROWAWAY_ALIAS}" > "${SB6}/jarsigner.log" 2>&1 || JS6_RC=$?
if [ "${JS6_RC}" -ne 0 ] || grep -q '^jarsigner:' "${SB6}/jarsigner.log"; then
  fail "the keyPassword written to key.properties CANNOT open the private key entry (the exact failure that breaks Gradle :app:packageRelease). jarsigner output: $(cat "${SB6}/jarsigner.log")"
fi
"${REAL_JARSIGNER}" -verify "${J6_DIR}/probe.jar" > "${SB6}/jarsigner-verify.log" 2>&1 \
  || fail "the jar signed with key.properties values does not verify"
printf '%s\n' "$(cat "${SB6}/jarsigner-verify.log")" | grep -q "jar verified" \
  || fail "jarsigner did not report 'jar verified'"
echo "✅ [Test 6 Passed] key.properties is absolute, complete, mode 600; keyPassword equals storePassword and provably opens the private key (jar signed and verified)."

# -----------------------------------------------------------------------------
# Test 7: passwords never appear in keytool argv. A recording wrapper logs the
# real keytool's argv (NUL-separated) while still executing it, so this checks
# the genuine invocation, not a stub.
# -----------------------------------------------------------------------------
echo "🔍 [Test 7] Verifying passwords never appear in keytool argv..."
SB7="${TMP_BASE}/t7"; mkdir -p "${SB7}"
ARGVSHIM="${TMP_BASE}/t7-shim"; mkdir "${ARGVSHIM}"
ARGV_LOG="${TMP_BASE}/argv.log"
cat > "${ARGVSHIM}/keytool" <<EOF
#!/usr/bin/env bash
printf '%s\0' "\$@" >> "${ARGV_LOG}"
exec "${REAL_KEYTOOL}" "\$@"
EOF
chmod +x "${ARGVSHIM}/keytool"

T7_RC=0
PATH="${ARGVSHIM}:${PATH}" run_provision \
  --keystore-path "${SB7}/upload-test.jks" \
  --key-properties-path "${SB7}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 > /dev/null 2>&1 \
  || T7_RC=$?
if [ "${T7_RC}" -ne 0 ]; then
  fail "provisioning run under the argv-recording shim failed"
fi
[ -s "${ARGV_LOG}" ] || fail "the argv recording shim captured no keytool invocation"
if tr '\0' '\n' < "${ARGV_LOG}" | grep -Fq -- "${PW_STORE}"; then
  fail "the store password appeared in keytool argv"
fi
echo "✅ [Test 7 Passed] The password never appears in any keytool argv (verified on the real invocation)."

# -----------------------------------------------------------------------------
# Test 8: passwords never appear in the script's own output, under normal run
# or full bash -x tracing.
# -----------------------------------------------------------------------------
echo "🔍 [Test 8] Verifying passwords never appear in the script's output..."
SB8="${TMP_BASE}/t8"; mkdir -p "${SB8}"
T8_RC=0
T8_OUT="$(run_provision \
  --keystore-path "${SB8}/upload-test.jks" \
  --key-properties-path "${SB8}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T8_RC=$?
if [ "${T8_RC}" -ne 0 ]; then
  fail "plain provisioning run failed. Output: ${T8_OUT}"
fi
if printf '%s\n' "${T8_OUT}" | grep -Fq -- "${PW_STORE}"; then
  fail "the password appeared in the script's normal output"
fi

T8X_RC=0
T8X_OUT="$(printf '%s\n%s\n%s\n%s\n' "${PW_STORE}" "${PW_STORE}" "" "" \
  | bash -x "$PROVISION" \
  --keystore-path "${SB8}/upload-trace.jks" \
  --key-properties-path "${SB8}/key-trace.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T8X_RC=$?
if [ "${T8X_RC}" -ne 0 ]; then
  fail "traced provisioning run failed. Output tail: $(printf '%s' "${T8X_OUT}" | tail -5)"
fi
if printf '%s\n' "${T8X_OUT}" | grep -Fq -- "${PW_STORE}"; then
  fail "the password leaked into bash -x trace output"
fi
echo "✅ [Test 8 Passed] No password in normal output or under full bash -x tracing."

# -----------------------------------------------------------------------------
# Test 9: required-input fail-closed path — a truncated answer stream (the
# password without its confirmation) must exit non-zero with a clear message
# and write nothing.
# -----------------------------------------------------------------------------
echo "🔍 [Test 9] Verifying missing required input fails closed..."
SB9="${TMP_BASE}/t9"; mkdir -p "${SB9}"
T9_RC=0
T9_OUT="$(printf '%s\n' "${PW_STORE}" | "$PROVISION" \
  --keystore-path "${SB9}/upload-test.jks" \
  --key-properties-path "${SB9}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T9_RC=$?
if [ "${T9_RC}" -eq 0 ]; then
  fail "missing key password was accepted"
fi
printf '%s\n' "${T9_OUT}" | grep -qi "password" \
  || fail "missing-input failure must name the missing input. Output: ${T9_OUT}"
[ ! -e "${SB9}/upload-test.jks" ] || fail "a keystore was created despite missing input"
[ ! -e "${SB9}/key.properties" ] || fail "key.properties was written despite missing input"
echo "✅ [Test 9 Passed] Missing required input fails closed with a clear message and no artifacts."

# -----------------------------------------------------------------------------
# Test 10 (F2): --force with a FAILING keytool -genkeypair must leave the
# original keystore byte-identical AND still holding ALL of its entries (the
# same alias and unrelated aliases). The live keystore is never mutated in
# place: deletion and generation happen on a staged copy. Also verifies the
# happy-path rotation preserves unrelated aliases.
# -----------------------------------------------------------------------------
echo "🔍 [Test 10] Verifying the --force staging window (failing -genkeypair)..."
SB10="${TMP_BASE}/t10"; mkdir -p "${SB10}"
KS10="${SB10}/rotate.jks"
KT10_OUT="$(KT_T10_PASS="${PW_STORE}" "${REAL_KEYTOOL}" -genkeypair \
  -keystore "${KS10}" -storetype PKCS12 \
  -alias "${THROWAWAY_ALIAS}" -keyalg RSA -keysize 2048 -validity 30 \
  -dname "CN=Throwaway Existing" -storepass:env KT_T10_PASS 2>&1)" \
  || fail "test setup: could not create the existing keystore: ${KT10_OUT}"
KT10_OUT="$(KT_T10_PASS="${PW_STORE}" "${REAL_KEYTOOL}" -genkeypair \
  -keystore "${KS10}" -storetype PKCS12 \
  -alias "unrelated-keep" -keyalg RSA -keysize 2048 -validity 30 \
  -dname "CN=Unrelated" -storepass:env KT_T10_PASS 2>&1)" \
  || fail "test setup: could not add the unrelated alias: ${KT10_OUT}"
KS10_SUM1="$(sha256sum "${KS10}" | awk '{print $1}')"

GENSHIM="${TMP_BASE}/t10-shim"; mkdir "${GENSHIM}"
cat > "${GENSHIM}/keytool" <<EOF
#!/usr/bin/env bash
for a in "\$@"; do [ "\$a" = "-genkeypair" ] && { echo "SIMULATED_GENKEYPAIR_FAILURE" >&2; exit 1; }; done
exec "${REAL_KEYTOOL}" "\$@"
EOF
chmod +x "${GENSHIM}/keytool"

T10_RC=0
PATH="${GENSHIM}:${PATH}" run_provision --force \
  --keystore-path "${KS10}" \
  --key-properties-path "${SB10}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 > /dev/null 2>&1 || T10_RC=$?
if [ "${T10_RC}" -eq 0 ]; then
  fail "the forced run with a failing -genkeypair did not fail closed"
fi
KS10_SUM2="$(sha256sum "${KS10}" | awk '{print $1}')"
if [ "${KS10_SUM1}" != "${KS10_SUM2}" ]; then
  fail "the original keystore was MODIFIED although generation failed (F2 data-loss window)"
fi
KT10_LIST="$(KT_T10_PASS="${PW_STORE}" "${REAL_KEYTOOL}" -list \
  -keystore "${KS10}" -storepass:env KT_T10_PASS 2>&1)" \
  || fail "the original keystore no longer opens with its original password after the failed forced rotation"
for a in "${THROWAWAY_ALIAS}" "unrelated-keep"; do
  printf '%s\n' "${KT10_LIST}" | grep -q -- "${a}" \
    || fail "original entry '${a}' was lost by the failed forced rotation"
done

# Triangulation: the same forced rotation WITHOUT the failing shim must
# succeed and must preserve the unrelated alias.
T10B_RC=0
run_provision --force \
  --keystore-path "${KS10}" \
  --key-properties-path "${SB10}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 > /dev/null 2>&1 || T10B_RC=$?
if [ "${T10B_RC}" -ne 0 ]; then
  fail "the successful forced rotation failed (expected: rotate the same alias in place)"
fi
KT10B_LIST="$(KT_T10_PASS="${PW_STORE}" "${REAL_KEYTOOL}" -list \
  -keystore "${KS10}" -storepass:env KT_T10_PASS 2>&1)" \
  || fail "the rotated keystore no longer opens with its password"
printf '%s\n' "${KT10B_LIST}" | grep -q -- "${THROWAWAY_ALIAS}" \
  || fail "the rotated keystore does not contain the regenerated alias"
printf '%s\n' "${KT10B_LIST}" | grep -q -- "unrelated-keep" \
  || fail "the successful rotation did not preserve the unrelated alias"
echo "✅ [Test 10 Passed] A failed forced rotation leaves the keystore byte-identical with every entry; a successful one preserves unrelated aliases."

# -----------------------------------------------------------------------------
# Test 11 (F3): with a FAILING git shim on PATH and the script invoked through
# a SYMLINKED path, an in-repository keystore path must STILL be refused
# (exit 2). REPO_ROOT and the keystore path must both be physical.
# -----------------------------------------------------------------------------
echo "🔍 [Test 11] Verifying the in-repo guard under a broken git and a symlinked invocation path..."
SB11="${TMP_BASE}/t11"; mkdir -p "${SB11}"
GITSHIM="${TMP_BASE}/t11-shim"; mkdir "${GITSHIM}"
cat > "${GITSHIM}/git" <<'EOF'
#!/usr/bin/env bash
echo "gitshim: git is broken" >&2
exit 1
EOF
chmod +x "${GITSHIM}/git"
ln -s "${ROOT_DIR}" "${SB11}/repo-link"
EVIL11="${SB11}/repo-link/apps/pos_app/evil-suite.jks"
T11_RC=0
T11_OUT="$(export PATH="${GITSHIM}:${PATH}";
  export PROVISION_BIN="${SB11}/repo-link/scripts/provision_release_keystore.sh";
  run_provision \
    --keystore-path "${EVIL11}" \
    --key-properties-path "${SB11}/key.properties" \
    --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T11_RC=$?
if [ "${T11_RC}" -ne 2 ]; then
  fail "an in-repo keystore path reached through a symlinked invocation with broken git was not refused with exit 2 (got ${T11_RC}). Output: ${T11_OUT}"
fi
printf '%s\n' "${T11_OUT}" | grep -qi "outside the repository" \
  || fail "the symlinked-invocation refusal must explain the keystore must live outside the repository. Output: ${T11_OUT}"
[ ! -e "${ROOT_DIR}/apps/pos_app/evil-suite.jks" ] \
  || fail "the refused in-repo keystore path (physical) was created anyway"
[ ! -e "${EVIL11}" ] \
  || fail "the refused in-repo keystore path (symlink view) was created anyway"
echo "✅ [Test 11 Passed] Broken git + symlinked invocation cannot bypass the in-repo guard."

# -----------------------------------------------------------------------------
# Test 12 (F4): --force against an existing keystore protected by a DIFFERENT
# password must exit closed with a message naming the likely cause and the
# remedy, and must leave the keystore byte-identical with its entry intact.
# -----------------------------------------------------------------------------
echo "🔍 [Test 12] Verifying --force against a keystore with a different password..."
SB12="${TMP_BASE}/t12"; mkdir -p "${SB12}"
KS12="${SB12}/existing.jks"
PW_OLD="Old-$(head -c 16 /dev/urandom | base64 | tr -d '=+/')"
KT12_OUT="$(KT_T12_PASS="${PW_OLD}" "${REAL_KEYTOOL}" -genkeypair \
  -keystore "${KS12}" -storetype PKCS12 \
  -alias "legacy" -keyalg RSA -keysize 2048 -validity 30 \
  -dname "CN=Legacy" -storepass:env KT_T12_PASS 2>&1)" \
  || fail "test setup: could not create the existing keystore: ${KT12_OUT}"
KS12_SUM1="$(sha256sum "${KS12}" | awk '{print $1}')"
T12_RC=0
T12_OUT="$(run_provision --force \
  --keystore-path "${KS12}" \
  --key-properties-path "${SB12}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T12_RC=$?
if [ "${T12_RC}" -eq 0 ]; then
  fail "--force with a wrong password for the existing keystore was accepted"
fi
printf '%s\n' "${T12_OUT}" | grep -qi "different password" \
  || fail "the failure message must name the likely cause (a DIFFERENT password). Output: ${T12_OUT}"
printf '%s\n' "${T12_OUT}" | grep -qi "backup" \
  || fail "the failure message must name the remedy (recover the password / backups). Output: ${T12_OUT}"
KS12_SUM2="$(sha256sum "${KS12}" | awk '{print $1}')"
if [ "${KS12_SUM1}" != "${KS12_SUM2}" ]; then
  fail "the existing keystore was modified although its password did not match"
fi
KT12_LIST="$(KT_T12_PASS="${PW_OLD}" "${REAL_KEYTOOL}" -list \
  -keystore "${KS12}" -storepass:env KT_T12_PASS 2>&1)" \
  || fail "the existing keystore no longer opens with its original password"
printf '%s\n' "${KT12_LIST}" | grep -q "legacy" \
  || fail "the original entry was lost"
echo "✅ [Test 12 Passed] A different-password keystore fails closed with cause and remedy, byte-identical."

# -----------------------------------------------------------------------------
# Test 14 (S0-05): startup sweep — a STALE .provision-stage.<six> file (old
# mtime) left by a SIGKILLed previous run must be removed by the next startup
# (reported), while the keystore itself and every unrelated file in the same
# directory stay byte-identical. The run used here dies at the overwrite
# refusal (exit 2) BEFORE any prompt or keystore write, so this exercises
# exactly the startup sweep and nothing else — no keytool, no staging.
# -----------------------------------------------------------------------------
echo "🔍 [Test 14] Verifying the startup sweep removes a stale staging file..."
SB14="${TMP_BASE}/t14"; mkdir -p "${SB14}"
KS14="${SB14}/existing.jks"
printf 'sentinel-not-a-real-keystore\n' > "${KS14}"
KS14_SUM1="$(sha256sum "${KS14}" | awk '{print $1}')"
STALE14="${SB14}/.provision-stage.abc123"
printf 'stale-staging-debris\n' > "${STALE14}"
touch -d '30 minutes ago' "${STALE14}"
BACKUP14="${SB14}/backup.jks"; printf 'backup-sentinel\n' > "${BACKUP14}"
UNRELATED14="${SB14}/notes.txt"; printf 'unrelated\n' > "${UNRELATED14}"
T14_RC=0
T14_OUT="$(run_provision \
  --keystore-path "${KS14}" \
  --key-properties-path "${SB14}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 2>&1)" || T14_RC=$?
if [ "${T14_RC}" -eq 0 ]; then
  fail "the run against an existing keystore without --force should have been refused"
fi
[ ! -e "${STALE14}" ] || fail "the sweep did NOT remove the stale staging file ${STALE14}"
printf '%s\n' "${T14_OUT}" | grep -qF "${STALE14}" \
  || fail "the sweep must report what it removed. Output: ${T14_OUT}"
KS14_SUM2="$(sha256sum "${KS14}" | awk '{print $1}')"
[ "${KS14_SUM1}" = "${KS14_SUM2}" ] || fail "the sweep modified the keystore itself"
[ -f "${BACKUP14}" ] || fail "the sweep removed a sibling .jks backup"
[ "$(cat "${BACKUP14}")" = "backup-sentinel" ] || fail "the sweep modified a sibling .jks backup"
[ -f "${UNRELATED14}" ] || fail "the sweep removed an unrelated file"
echo "✅ [Test 14 Passed] Stale staging file swept and reported; keystore, backup and unrelated file untouched."

# -----------------------------------------------------------------------------
# Test 15 (S0-05): the concurrency guard — a FRESH .provision-stage.<six> file
# (recent mtime) must NOT be removed. A provisioning run creates its staging
# file and finishes the swap within seconds, so a fresh staging file may be an
# in-flight rotation; deleting it would be worse than the debris being fixed.
# Same die-at-overwrite-refusal path as Test 14: only the startup sweep runs.
# -----------------------------------------------------------------------------
echo "🔍 [Test 15] Verifying the sweep leaves a FRESH staging file alone..."
SB15="${TMP_BASE}/t15"; mkdir -p "${SB15}"
KS15="${SB15}/existing.jks"
printf 'sentinel-not-a-real-keystore\n' > "${KS15}"
KS15_SUM1="$(sha256sum "${KS15}" | awk '{print $1}')"
FRESH15="${SB15}/.provision-stage.xyz789"
printf 'in-flight-staging\n' > "${FRESH15}"
T15_RC=0
run_provision \
  --keystore-path "${KS15}" \
  --key-properties-path "${SB15}/key.properties" \
  --alias "${THROWAWAY_ALIAS}" --validity-days 365 > /dev/null 2>&1 || T15_RC=$?
if [ "${T15_RC}" -eq 0 ]; then
  fail "the run against an existing keystore without --force should have been refused"
fi
[ -f "${FRESH15}" ] || fail "the sweep DELETED a fresh staging file (concurrency guard broken)"
[ "$(cat "${FRESH15}")" = "in-flight-staging" ] || fail "the sweep modified a fresh staging file"
KS15_SUM2="$(sha256sum "${KS15}" | awk '{print $1}')"
[ "${KS15_SUM1}" = "${KS15_SUM2}" ] || fail "the sweep modified the keystore itself"
echo "✅ [Test 15 Passed] A fresh staging file survives the sweep (concurrency guard holds)."

# -----------------------------------------------------------------------------
# Test 16 (S0-05): scripts/key.properties.example documents the
# single-password flow — the two-distinct-placeholder-passwords shape was the
# documentation form of the F1 defect (PKCS12 silently ignores a distinct key
# password, breaking :app:packageRelease). The example must show ONE password
# value for both entries, explain why, name the provisioning script and the
# runbook, and its alias/storeFile placeholders must match what the script
# actually writes by default.
# -----------------------------------------------------------------------------
echo "🔍 [Test 16] Verifying key.properties.example documents the single-password flow..."
EXAMPLE16="${SCRIPT_DIR}/key.properties.example"
[ -f "${EXAMPLE16}" ] || fail "key.properties.example is missing"
EX_STOREPW="$(grep '^# storePassword=' "${EXAMPLE16}" | sed 's/^# storePassword=//')"
EX_KEYPW="$(grep '^# keyPassword=' "${EXAMPLE16}" | sed 's/^# keyPassword=//')"
[ -n "${EX_STOREPW}" ] || fail "example has no storePassword placeholder"
[ -n "${EX_KEYPW}" ] || fail "example has no keyPassword placeholder"
[ "${EX_STOREPW}" = "${EX_KEYPW}" ] \
  || fail "example still shows TWO DISTINCT password placeholders (storePassword='${EX_STOREPW}' vs keyPassword='${EX_KEYPW}') — the documentation form of the F1 defect"
grep -qi 'PKCS12' "${EXAMPLE16}" \
  || fail "example must explain WHY one password (PKCS12 ignores a distinct key password)"
grep -qF 'provision_release_keystore.sh' "${EXAMPLE16}" \
  || fail "example must point at scripts/provision_release_keystore.sh as the intended path"
grep -qF 'docs/operations/release-signing-runbook.md' "${EXAMPLE16}" \
  || fail "example must point at the runbook"
SCRIPT_ALIAS_DEFAULT="$(grep '^DEFAULT_ALIAS=' "${PROVISION}" | sed 's/^DEFAULT_ALIAS="\(.*\)"$/\1/')"
[ -n "${SCRIPT_ALIAS_DEFAULT}" ] || fail "could not read DEFAULT_ALIAS from the provisioning script"
grep -qF "keyAlias=${SCRIPT_ALIAS_DEFAULT}" "${EXAMPLE16}" \
  || fail "example keyAlias placeholder must match the script's default alias (${SCRIPT_ALIAS_DEFAULT})"
SCRIPT_KS_DEFAULT="$(grep '^DEFAULT_KEYSTORE_PATH=' "${PROVISION}" | sed 's/^DEFAULT_KEYSTORE_PATH="\(.*\)"$/\1/')"
SCRIPT_KS_NAME="$(basename "${SCRIPT_KS_DEFAULT}")"
grep -qF "${SCRIPT_KS_NAME}" "${EXAMPLE16}" \
  || fail "example storeFile placeholder must match the script's default keystore name (${SCRIPT_KS_NAME})"
echo "✅ [Test 16 Passed] Example shows one password for both entries, with the why, the script and the runbook; placeholders match the script defaults."

# -----------------------------------------------------------------------------
# Test 17: repository hygiene — the suite leaves no keystore, no key.properties
# and modifies no tracked file anywhere in the repository.
# -----------------------------------------------------------------------------
echo "🔍 [Test 17] Verifying the repository is left clean..."
LEFTOVER_JKS="$(find "${ROOT_DIR}" \( -name '*.jks' -o -name '*.keystore' -o -name '*.p12' \) -not -path '*/node_modules/*' 2>/dev/null || true)"
if [ -n "${LEFTOVER_JKS}" ]; then
  fail "keystore material left in the repository: ${LEFTOVER_JKS}"
fi
LEFTOVER_KP="$(find "${ROOT_DIR}" -name 'key.properties' 2>/dev/null || true)"
if [ -n "${LEFTOVER_KP}" ]; then
  fail "key.properties left in the repository: ${LEFTOVER_KP}"
fi
# Tracked-file integrity: recompute the content hashes of EVERY tracked file
# in the repository (same build-artifact exclusion as the snapshot) and
# compare against the snapshot taken at suite start. Pre-existing dirty
# working-tree content is identical in both snapshots, so it passes; anything
# the suite wrote into a tracked file shows up here.
HASH_NOW="${TMP_BASE}/tracked-hashes-at-end.txt"
( cd "${ROOT_DIR}" && git ls-files -z \
    | grep -zv -e '/__pycache__/' -e '\.pyc$' \
    | xargs -0 -r sha256sum ) \
  > "${HASH_NOW}" || fail "could not recompute tracked-file hashes"
HASH_DIFF="$(diff -u "${HASH_SNAPSHOT}" "${HASH_NOW}" || true)"
if [ -n "${HASH_DIFF}" ]; then
  fail "the suite modified tracked files:
${HASH_DIFF}"
fi
echo "✅ [Test 17 Passed] No keystore, no key.properties, no secret and no tracked-file change made by the suite."

echo "=============================================================================="
echo "🎉 ALL PROVISIONING TESTS PASSED CLEANLY!"
echo "=============================================================================="
