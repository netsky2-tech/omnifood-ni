#!/usr/bin/env bash
# ==============================================================================
# OmniFood NI — Release Signing Key Provisioning Tool (S0-02)
# ==============================================================================
#
# Interactive operator tool that creates the Android release signing key and
# emits apps/pos_app/android/key.properties (git-ignored).
#
# Hard guarantees:
#   - ONE password is prompted for (echo disabled, entered twice) and is used
#     as BOTH the store password and the key password. Rationale: the keystore
#     is created as PKCS12 (pinned with -storetype PKCS12 so behavior never
#     depends on keytool's default), and PKCS12 does not support a key
#     password distinct from the store password — keytool silently ignores a
#     different -keypass. A second distinct password would also add no real
#     protection, because key.properties holds both values in plaintext in
#     the same file: whoever can read one can read the other.
#   - Passwords are NEVER passed to keytool as command-line arguments. The
#     mechanism is the protected-argument form:
#         keytool -genkeypair ... -storepass:env KT_STORE_PASS -keypass:env KT_STORE_PASS
#     The password lives only in the child's environment (never in argv, never
#     in a process listing) and the export happens inside a tracing-guarded
#     region so it cannot leak through `bash -x` output either.
#   - Anything keytool writes to stderr (warnings) is ALWAYS surfaced to the
#     operator. keytool warnings must never be swallowed: a silently ignored
#     -keypass once produced key.properties files that could not open the
#     private key, and the warning that explained it was discarded.
#   - Refuses to overwrite an existing keystore or key.properties without
#     --force. Overwriting a release key permanently ends the ability to
#     update already-shipped terminals.
#   - --force NEVER mutates the live keystore in place. The existing keystore
#     is copied to a sibling temporary file; same-alias deletion and key
#     generation happen against the copy; the copy is verified; only then is
#     it moved into place. If any step fails, the original is left
#     byte-identical and still holds all of its entries, including unrelated
#     aliases.
#   - The keystore must live OUTSIDE the repository; paths inside the repo are
#     always refused (the guard compares physical, fully-resolved paths on
#     both sides, so it is not bypassable through symlinked invocation paths
#     or a non-functional git, and not even with --force).
#   - Fails closed (non-zero exit, clear message) when keytool is unavailable,
#     when the target directory cannot be created, or when a required input is
#     missing.
#   - At startup, BEFORE any write, sweeps stale `.provision-stage.*` debris
#     left in the keystore directory by a previous SIGKILLed run (the EXIT
#     trap cannot catch SIGKILL). See the sweep block below for its guards.
#
# Exit codes: 0 success, 1 environment/input failure, 2 refusal (overwrite
# guard, in-repository path).
#
# Custody and backup rules: docs/operations/release-signing-runbook.md
# Feature: odd/tasks/release-signing-baseline.md
# ==============================================================================

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

DEFAULT_KEYSTORE_PATH="${HOME}/.keys/nhilos-upload.jks"
DEFAULT_ALIAS="upload"
DEFAULT_VALIDITY_DAYS=10950
DEFAULT_DNAME="CN=NHilos Upload, OU=OmniFood NI, O=NHilos, L=Managua, ST=Managua, C=NI"
DEFAULT_KEYPROPS_REL="apps/pos_app/android/key.properties"
MAX_PASSWORD_ATTEMPTS=3

# --- tracing guard ------------------------------------------------------------
# `[[ ]]` and `[ ]` EXPAND their operands in `bash -x` output (verified on this
# machine), so every command that touches a password value must run inside a
# region where xtrace is suppressed. Tracing is restored afterwards.
XTRACE_WAS_ON=0
case $- in *x*) XTRACE_WAS_ON=1 ;; esac
secret_begin() { if [ "${XTRACE_WAS_ON}" -eq 1 ]; then set +x; fi; }
secret_end()   { if [ "${XTRACE_WAS_ON}" -eq 1 ]; then set -x; fi; }

die() {
  local code="$1"; shift
  echo "ERROR: $*" >&2
  exit "${code}"
}

usage() {
  cat <<'USAGE'
Usage: provision_release_keystore.sh [options]

Creates the OmniFood NI release signing key and writes
apps/pos_app/android/key.properties (git-ignored).

Options:
  --keystore-path PATH        Where the keystore lives. Default:
                              $HOME/.keys/nhilos-upload.jks. Must be OUTSIDE
                              the repository; in-repo paths are always refused.
  --key-properties-path PATH  Where key.properties is written. Default:
                              <repo>/apps/pos_app/android/key.properties.
                              (Override exists for tests; keep the default in
                              production.)
  --alias NAME                Key alias. Default: upload
  --validity-days N           Certificate validity in days. Default: 10950 (~30y)
  --dname "NAME"              Certificate distinguished name. Default:
                              CN=NHilos Upload, OU=OmniFood NI, O=NHilos,
                              L=Managua, ST=Managua, C=NI
  --force                     Overwrite an existing keystore and/or
                              key.properties. DANGEROUS: overwriting the
                              release key permanently ends in-place updates
                              for every terminal already shipped with it.
                              The password you provide must open the existing
                              keystore; the replacement is staged on a
                              temporary copy and only moved into place after
                              verification, so a failed rotation never
damages the original.
  -h, --help                  Show this help.

A single password is prompted for interactively with echo disabled (entered
twice) and is used as both the store and the key password; it is never placed
on a command line. Custody and backup rules:
docs/operations/release-signing-runbook.md
USAGE
}

# --- flag parsing -------------------------------------------------------------
KEYSTORE_PATH="${DEFAULT_KEYSTORE_PATH}"
KEYPROPS_PATH=""
KEY_ALIAS="${DEFAULT_ALIAS}"
VALIDITY_DAYS="${DEFAULT_VALIDITY_DAYS}"
CERT_DNAME="${DEFAULT_DNAME}"
FORCE=0
PROMPT_ALIAS=1
PROMPT_DNAME=1

while [ $# -gt 0 ]; do
  case "$1" in
    --keystore-path)
      [ $# -ge 2 ] || die 1 "--keystore-path requires a value"
      KEYSTORE_PATH="$2"; shift 2 ;;
    --key-properties-path)
      [ $# -ge 2 ] || die 1 "--key-properties-path requires a value"
      KEYPROPS_PATH="$2"; shift 2 ;;
    --alias)
      [ $# -ge 2 ] || die 1 "--alias requires a value"
      KEY_ALIAS="$2"; PROMPT_ALIAS=0; shift 2 ;;
    --validity-days)
      [ $# -ge 2 ] || die 1 "--validity-days requires a value"
      VALIDITY_DAYS="$2"; shift 2 ;;
    --dname)
      [ $# -ge 2 ] || die 1 "--dname requires a value"
      CERT_DNAME="$2"; PROMPT_DNAME=0; shift 2 ;;
    --force)
      FORCE=1; shift ;;
    -h|--help)
      usage; exit 0 ;;
    *)
      die 1 "unknown option: $1 (see --help)" ;;
  esac
done

# --- fail-closed environment checks (before any prompt or write) --------------
command -v keytool >/dev/null 2>&1 || die 1 "keytool is not available. Install a JDK (e.g. 'sudo apt install openjdk-17-jdk-headless') and re-run; the release key cannot be generated without it."
keytool -help >/dev/null 2>&1 || die 1 "keytool is present but not functional (exit $? / preflight). Fix the JDK installation and re-run."

REPO_ROOT="$(git -C "${SCRIPT_DIR}" rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "${REPO_ROOT}" ]; then
  REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
fi
# Both sides of the in-repository prefix comparison MUST be physical paths:
# the keystore path is resolved with `realpath -m` (physical), so resolving
# REPO_ROOT with a logical `pwd` would miss the prefix match when this script
# is invoked through a symlinked path (with git unavailable), letting an
# in-repository keystore path slip past the guard.
REPO_ROOT="$(cd "${REPO_ROOT}" && pwd -P)"

command -v realpath >/dev/null 2>&1 || die 1 "realpath is not available; cannot safely resolve the keystore path."
KS_ABS="$(realpath -m -- "${KEYSTORE_PATH}")"
KS_DIR="$(dirname "${KS_ABS}")"

# The keystore must live outside the repository. The comparison uses fully
# resolved physical paths on both sides (REPO_ROOT via pwd -P, keystore via
# realpath), so it cannot be bypassed by symlinked invocation paths or by a
# broken git. It is the catastrophic-failure path; --force does not bypass it.
case "${KS_ABS}/" in
  "${REPO_ROOT}/"*) die 2 "refusing: the keystore must live OUTSIDE the repository (${KS_ABS} is inside ${REPO_ROOT}). The repository-level ignore rules are a safety net, not custody; use a path such as ${DEFAULT_KEYSTORE_PATH}." ;;
esac

if ! mkdir -p -- "${KS_DIR}" 2>/dev/null; then
  die 1 "cannot create the keystore directory '${KS_DIR}'. Check permissions and re-run."
fi

# --- startup sweep: residual staging files from an unclean previous run ------
# The --force rotation stages the replacement keystore in a sibling file named
# `.provision-stage.<six random characters>` (mktemp XXXXXX). The EXIT trap
# removes it, but SIGKILL cannot be trapped, so an unclean kill inside the
# swap window leaves that file behind: a full keystore copy, mode 600, holding
# the same secret as the keystore beside it. It exposes nothing new — it is
# stale debris — and this sweep removes it at startup, BEFORE any write.
#
# Guards, in order of importance:
#   - Scope: ONLY the resolved keystore directory (KS_DIR), with -maxdepth 1.
#     Never the repository, never a parent directory, never a glob that could
#     cross directories.
#   - Pattern: `.provision-stage.` followed by EXACTLY six characters — the
#     exact mktemp staging name. Too tight to match a real keystore (a real
#     one is a named *.jks/*.keystore/*.p12 file and never carries this
#     prefix) and, with -maxdepth 1, unable to reach any other directory.
#   - Regular files only (`-type f`): find does not follow symlinks by
#     default, so a symlinked staging name does not match at all and is left
#     alone — nothing in this sweep can dereference or delete through a link.
#   - Age guard (concurrency): a live provisioning run creates its staging
#     file and finishes the swap within seconds (keytool generation takes a
#     few seconds at most), so a FRESH staging file may belong to a
#     concurrent run and deleting it could destroy an in-flight rotation —
#     worse than the debris being fixed here. Only files older than
#     STALE_STAGE_MINUTES are treated as abandoned; anything younger is left
#     strictly alone. If in doubt, the file is left in place and reported.
STALE_STAGE_MINUTES=10
sweep_stale_staging() {
  local __stale __f
  __stale="$(find "${KS_DIR}" -maxdepth 1 -type f \
    -name '.provision-stage.??????' -mmin "+${STALE_STAGE_MINUTES}" -print 2>/dev/null || true)"
  [ -n "${__stale}" ] || return 0
  while IFS= read -r __f; do
    [ -n "${__f}" ] || continue
    if rm -f -- "${__f}"; then
      echo "Sweep: removed residual staging file from a previous unclean run: ${__f}"
    else
      echo "Sweep: WARNING — could not remove '${__f}' (left in place; if you are sure no provisioning run is active, remove it manually)." >&2
    fi
  done <<< "${__stale}"
}
sweep_stale_staging

if [ -z "${KEYPROPS_PATH}" ]; then
  KEYPROPS_PATH="${REPO_ROOT}/${DEFAULT_KEYPROPS_REL}"
fi
KP_ABS="$(realpath -m -- "${KEYPROPS_PATH}")"
if ! mkdir -p -- "$(dirname "${KP_ABS}")" 2>/dev/null; then
  die 1 "cannot create the directory for key.properties ('$(dirname "${KP_ABS}")'). Check permissions and re-run."
fi

KS_PRE_EXISTED=0
if [ -e "${KS_ABS}" ]; then
  KS_PRE_EXISTED=1
  if [ "${FORCE}" -ne 1 ]; then
    die 2 "refusing to overwrite the existing keystore '${KS_ABS}'. Overwriting a release key permanently ends the ability to update terminals already shipped with it. If you are ABSOLUTELY sure, re-run with --force."
  fi
fi
if [ -e "${KP_ABS}" ] && [ "${FORCE}" -ne 1 ]; then
  die 2 "refusing to overwrite the existing key.properties '${KP_ABS}'. Re-run with --force if this is intentional."
fi

[ -n "${KEY_ALIAS}" ] || die 1 "required input missing: key alias (--alias)"
case "${VALIDITY_DAYS}" in
  ''|*[!0-9]*) die 1 "--validity-days must be a positive integer, found: '${VALIDITY_DAYS}'" ;;
esac
[ "${VALIDITY_DAYS}" -ge 1 ] || die 1 "--validity-days must be a positive integer, found: '${VALIDITY_DAYS}'"

# --- keytool invocation helpers ----------------------------------------------
# Any keytool warning (stderr) is ALWAYS surfaced to the operator, on success
# or failure: a swallowed warning once hid a silently ignored -keypass and
# made every generated key.properties unusable without any visible signal.
KEYTOOL_LOG="$(mktemp)"
KEYTOOL_LOG_OUT="$(mktemp)"
STAGE_FILE=""
KP_STAGE_FILE=""
trap 'rm -f "${KEYTOOL_LOG}" "${KEYTOOL_LOG_OUT}" ${STAGE_FILE:+"${STAGE_FILE}"} ${KP_STAGE_FILE:+"${KP_STAGE_FILE}"}' EXIT

# run_keytool: runs keytool, discards stdout on success, prints every stderr
# line (warnings) to the operator, and on failure prints the full captured
# output before returning keytool's exit code.
run_keytool() {
  local __rc=0
  if keytool "$@" > "${KEYTOOL_LOG_OUT}" 2> "${KEYTOOL_LOG}"; then
    if [ -s "${KEYTOOL_LOG}" ]; then
      echo "WARNING — keytool reported the following:" >&2
      cat "${KEYTOOL_LOG}" >&2
    fi
    : > "${KEYTOOL_LOG_OUT}"
    return 0
  else
    __rc=$?
    echo "keytool failed (exit ${__rc}). Output:" >&2
    cat "${KEYTOOL_LOG_OUT}" "${KEYTOOL_LOG}" >&2
    : > "${KEYTOOL_LOG_OUT}"
    return "${__rc}"
  fi
}

# Quiet alias-presence probe. "Alias <x> does not exist" is an EXPECTED
# outcome here (a first rotation onto a fresh alias), so it must not print a
# failure block; the keystore itself is separately proven readable by the
# open-check below before this probe is ever used.
ks_has_alias() {
  keytool -list -keystore "$1" -alias "$2" -storepass:env KT_STORE_PASS >/dev/null 2>&1
}

# --- interactive capture (echo disabled) --------------------------------------
# read_secret: prompts on stderr, reads with echo disabled, refuses empty
# values, and performs every value-bearing expansion inside the tracing guard.
read_secret() {
  local __var="$1" __prompt="$2" __attempt
  for __attempt in $(seq 1 "${MAX_PASSWORD_ATTEMPTS}"); do
    printf '%s' "${__prompt}" >&2
    read -r -s "${__var}" || die 1 "required input missing: ${__prompt}"
    printf '\n' >&2
    secret_begin
    if [ -z "${!__var}" ]; then
      secret_end
      echo "The value must not be empty. Please try again." >&2
      continue
    fi
    secret_end
    return 0
  done
  die 1 "required input missing: ${__prompt} (no valid value after ${MAX_PASSWORD_ATTEMPTS} attempts)"
}

confirm_secret() {
  local __var="$1" __confirm_var="$2" __label="$3" __attempt
  for __attempt in $(seq 1 "${MAX_PASSWORD_ATTEMPTS}"); do
    read_secret "${__confirm_var}" "Confirm ${__label}: "
    secret_begin
    if [ "${!__var}" = "${!__confirm_var}" ]; then
      unset "${__confirm_var}"
      secret_end
      return 0
    fi
    secret_end
    echo "The two values do not match. Please try again." >&2
  done
  unset "${__confirm_var}"
  die 1 "the ${__label} values never matched after ${MAX_PASSWORD_ATTEMPTS} attempts; aborting without writing anything."
}

read_plain() {
  local __var="$1" __prompt="$2" __default="$3"
  printf '%s [%s]: ' "${__prompt}" "${__default}" >&2
  read -r "${__var}" || die 1 "required input missing: ${__prompt}"
  [ -n "${!__var}" ] || printf -v "${__var}" '%s' "${__default}"
  return 0
}

echo "OmniFood NI — release signing key provisioning"
echo "=============================================="
echo "This key is the single most irreversible artifact of the distribution"
echo "plan: losing it permanently ends the ability to update terminals that"
echo "have already shipped. Custody rules are in"
echo "docs/operations/release-signing-runbook.md — read them before continuing."
echo ""

read_secret STORE_PASSWORD "Keystore password: "
confirm_secret STORE_PASSWORD STORE_PASSWORD_CONFIRM "keystore password"

# --- --force over an existing keystore: open-check BEFORE any mutation -------
# Provisioning does not rotate keystore passwords. Under --force, if the
# existing file does not open with the provided password, the cause matters:
#   - keytool reports 'keystore password was incorrect' → the file IS a
#     keystore but was created with a DIFFERENT password; the remedy is the
#     backup/secret manager.
#   - anything else (unrecognized format, EOF, ...) → the file is NOT a
#     usable keystore at all, e.g. a partial file from an interrupted run or
#     a corrupted backup restored by mistake; the remedy is to compare it
#     against backups and remove it, not to hunt for a different password.
# Exit closed, keystore untouched, for both causes.
secret_begin
export KT_STORE_PASS="${STORE_PASSWORD}"
if [ "${KS_PRE_EXISTED}" -eq 1 ]; then
  # keytool prints its 'keytool error: ...' line on STDOUT, not stderr, so
  # both streams are captured and classified together. On success, stderr is
  # still surfaced (keytool warnings must never be swallowed).
  KS_OPEN_OUT="$(mktemp)"
  KS_OPEN_ERR="$(mktemp)"
  KS_OPEN_RC=0
  keytool -list -keystore "${KS_ABS}" -storepass:env KT_STORE_PASS > "${KS_OPEN_OUT}" 2> "${KS_OPEN_ERR}" || KS_OPEN_RC=$?
  if [ "${KS_OPEN_RC}" -ne 0 ]; then
    KS_OPEN_ERR_TEXT="$(cat "${KS_OPEN_OUT}" "${KS_OPEN_ERR}")"
    rm -f "${KS_OPEN_OUT}" "${KS_OPEN_ERR}"
    if printf '%s\n' "${KS_OPEN_ERR_TEXT}" | grep -qi "keystore password was incorrect"; then
      unset KT_STORE_PASS
      secret_end
      die 1 "the existing keystore '${KS_ABS}' could NOT be opened with the password you provided. Most likely it was created with a DIFFERENT password (this tool does not rotate keystore passwords). Remedy: recover the correct password from your secret manager or backups, or provision a new keystore under a different path. The existing keystore was left untouched."
    fi
    unset KT_STORE_PASS
    secret_end
    die 1 "the existing file '${KS_ABS}' is NOT a usable keystore (keytool could not read it: it may be a partial or corrupt file, for example from an interrupted earlier run). Remedy: compare it against your backups; if it is not your release key, remove it and re-run this tool. The existing file was left untouched."
  fi
  if [ -s "${KS_OPEN_ERR}" ]; then
    echo "WARNING — keytool reported the following:" >&2
    cat "${KS_OPEN_ERR}" >&2
  fi
  rm -f "${KS_OPEN_OUT}" "${KS_OPEN_ERR}"
fi
secret_end
# Only prompt for alias/dname when they were not given explicitly on the
# command line, so a flag value can never be clobbered by the default.
if [ "${PROMPT_ALIAS}" -eq 1 ]; then
  read_plain INPUT_ALIAS "Key alias" "${DEFAULT_ALIAS}"
  KEY_ALIAS="${INPUT_ALIAS}"
fi
if [ "${PROMPT_DNAME}" -eq 1 ]; then
  read_plain INPUT_DNAME "Certificate distinguished name" "${DEFAULT_DNAME}"
  CERT_DNAME="${INPUT_DNAME}"
fi

# --- key generation (password via env, never argv, inside tracing guard) -----
secret_begin
# Single-password design: the same value is passed as both the store and the
# key password (PKCS12 cannot hold a distinct key password, and key.properties
# stores both in plaintext in one file, so a second password adds nothing).
# (KT_STORE_PASS was exported in the open-check region above.)

# --force staging: NEVER mutate the live keystore in place. All destructive
# steps (same-alias deletion, regeneration) run against a sibling temporary
# copy; the copy is verified and only then moved into place. If any step
# fails, the original remains byte-identical and keeps every entry, including
# unrelated aliases. The file-level overwrite guard alone does NOT cover this
# window: it cannot help once an overwrite has been requested.
#
# NEW keystores are staged too (R4-2): generating directly at KS_ABS meant a
# SIGKILL during -genkeypair left a partial file at the live path, which the
# next run refused to overwrite and --force misdiagnosed as a different
# password. Staging both paths means ONE mechanism covers both, and the
# startup sweep (which already removes stale .provision-stage.* files) covers
# both debris cases.
STAGE_FILE="$(mktemp "${KS_DIR}/.provision-stage.XXXXXX")"
if [ "${KS_PRE_EXISTED}" -eq 1 ]; then
  cp -- "${KS_ABS}" "${STAGE_FILE}"
else
  # keytool -genkeypair refuses to write into an existing (empty) file
  # ('Keystore file exists, but is empty'), so the fresh path uses the
  # race-free random NAME from mktemp but lets keytool create the file. The
  # EXIT trap still cleans the name, and a SIGKILL mid-generation leaves the
  # partial file at the STAGING path, where the startup sweep finds it.
  rm -f -- "${STAGE_FILE}"
fi

# With --force over an existing keystore, remove the same-alias entry first
# (on the staged copy): keytool refuses to regenerate an existing alias when
# stdin is not a TTY, which would make --force nondeterministic. Unrelated
# aliases are untouched: only this alias is deleted, and the staged copy
# carries every other entry over.
if [ "${KS_PRE_EXISTED}" -eq 1 ] && ks_has_alias "${STAGE_FILE}" "${KEY_ALIAS}"; then
  if ! run_keytool -delete -keystore "${STAGE_FILE}" -alias "${KEY_ALIAS}" \
        -storepass:env KT_STORE_PASS; then
    unset KT_STORE_PASS
    secret_end
    die 1 "keytool failed to remove the existing alias '${KEY_ALIAS}' from the staging copy (--force path). The original keystore '${KS_ABS}' was left untouched."
  fi
fi

# Fresh stores are pinned to PKCS12 explicitly so the keystore type never
# depends on keytool's default; PKCS12 is also what forces the single-password
# design (a distinct key password is silently ignored there — see header).
# A --force rotation reuses the existing store's own type (detected from its
# content, not from keytool's default), so a legacy store keeps its format.
# Both paths generate into STAGE_FILE (see the staging block above).
GEN_TARGET="${STAGE_FILE}"
GEN_EXTRA=()
if [ "${KS_PRE_EXISTED}" -eq 0 ]; then
  GEN_EXTRA=(-storetype PKCS12)
fi

if ! run_keytool -genkeypair \
      -keystore "${GEN_TARGET}" \
      "${GEN_EXTRA[@]}" \
      -alias "${KEY_ALIAS}" \
      -keyalg RSA -keysize 4096 \
      -validity "${VALIDITY_DAYS}" \
      -dname "${CERT_DNAME}" \
      -storepass:env KT_STORE_PASS \
      -keypass:env KT_STORE_PASS; then
  unset KT_STORE_PASS
  secret_end
  if [ "${KS_PRE_EXISTED}" -eq 1 ]; then
    die 1 "keytool failed to generate the key pair. The original keystore '${KS_ABS}' was left untouched (the staging copy was discarded)."
  fi
  die 1 "keytool failed to generate the key pair. No keystore was created at '${KS_ABS}' (the staging copy was discarded)."
fi

# Verify the staged keystore actually contains the expected entry BEFORE it
# is moved into place (or replaces the live keystore), then move it into
# place. This is the point where a NEW keystore first exists at its live
# path — and only as a whole, verified file.
if ! run_keytool -list -keystore "${STAGE_FILE}" -alias "${KEY_ALIAS}" \
      -storepass:env KT_STORE_PASS; then
  unset KT_STORE_PASS
  secret_end
  if [ "${KS_PRE_EXISTED}" -eq 1 ]; then
    die 1 "the staged keystore copy does not contain the expected alias '${KEY_ALIAS}'. The original keystore '${KS_ABS}' was left untouched."
  fi
  die 1 "the staged keystore copy does not contain the expected alias '${KEY_ALIAS}'. No keystore was created at '${KS_ABS}'."
fi
mv -f -- "${STAGE_FILE}" "${KS_ABS}"
STAGE_FILE=""

# Verify the keystore is actually usable with the chosen password before
# declaring success.
if ! run_keytool -list -keystore "${KS_ABS}" -storepass:env KT_STORE_PASS; then
  unset KT_STORE_PASS
  secret_end
  if [ "${KS_PRE_EXISTED}" -eq 0 ]; then
    rm -f -- "${KS_ABS}"
  fi
  die 1 "the generated keystore could not be opened with the chosen store password."
fi

# --- key.properties (the only place the password is ever written) -------------
# Written ATOMICALLY (R4-3): staged into a same-directory temporary file with
# restrictive mode, then moved into place — the same mechanism as the
# keystore rotation. A direct in-place redirection truncates the existing
# file the moment it opens it, so a disk-full or interrupted write would
# destroy a previously working configuration. The staging file is cleaned up
# on every exit path by the EXIT trap (KP_STAGE_FILE).
# keyPassword is written because Gradle's signingConfig reads it; it is
# deliberately the SAME value as storePassword (single-password design): the
# keystore is PKCS12, which cannot hold a distinct key password, and two
# plaintext values in one file protect nothing extra.
KP_STAGE_FILE="$(mktemp "$(dirname "${KP_ABS}")/.keyprops-stage.XXXXXX")"
{
  printf 'storePassword=%s\n' "${STORE_PASSWORD}"
  printf 'keyPassword=%s\n' "${STORE_PASSWORD}"
  printf 'keyAlias=%s\n' "${KEY_ALIAS}"
  printf 'storeFile=%s\n' "${KS_ABS}"
} > "${KP_STAGE_FILE}"
chmod 600 "${KP_STAGE_FILE}"
mv -f -- "${KP_STAGE_FILE}" "${KP_ABS}"
KP_STAGE_FILE=""

unset KT_STORE_PASS STORE_PASSWORD STORE_PASSWORD_CONFIRM
secret_end

chmod 600 "${KP_ABS}"
chmod 600 "${KS_ABS}"

echo ""
echo "Release signing key created."
echo "  Keystore:     ${KS_ABS} (mode 600, outside the repository)"
echo "  Alias:        ${KEY_ALIAS}"
echo "  Validity:     ${VALIDITY_DAYS} days"
echo "  key.properties: ${KP_ABS} (mode 600, git-ignored)"
echo ""
echo "=============================================================================="
echo "NEXT STEPS — BACKUP AND CUSTODY (do these NOW, before building anything)"
echo "=============================================================================="
echo " 1. Create TWO ENCRYPTED backups of '${KS_ABS}' in TWO DISTINCT"
echo "    locations (e.g. an encrypted USB drive kept off-site and an encrypted"
echo "    vault). One copy is not custody; it is a single point of failure."
echo " 2. Store the keystore password in your SECRET MANAGER, physically"
echo "    separate from every keystore copy. A backup without its password is"
echo "    as lost as no backup."
echo " 3. Verify a backup restores: copy it back and run"
echo "    'keytool -list -keystore <backup>' with the secret-manager password."
echo " 4. NEVER copy the keystore into the repository, a ticket, a chat, or an"
echo "    unencrypted share. The repo ignore rules (added in S0-01) only cover"
echo "    *.jks/*.keystore/*.p12/key.properties patterns; they are a safety"
echo "    net, not custody."
echo ""
echo "IRREVERSIBILITY: losing this key permanently ends the ability to update"
echo "already-shipped terminals. An artifact signed with any other key is"
echo "rejected with INSTALL_FAILED_UPDATE_INCOMPATIBLE, and without physical"
echo "access the terminal cannot be recovered in the field."
echo "Full custody and recovery rules: docs/operations/release-signing-runbook.md"
echo "=============================================================================="
