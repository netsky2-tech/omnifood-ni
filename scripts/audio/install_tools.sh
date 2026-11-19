#!/usr/bin/env bash
set -euo pipefail

ROOT="${NHILOS_AUDIO_HOME:-$HOME/.local/opt/nhilos-audio}"
BIN="$ROOT/bin"
FFMPEG_URL="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
WITH_REAL_SFX=0
WITH_EARSHOT=0
UISFX_ONLY=0

for arg in "$@"; do
  case "$arg" in
    --uisfx-only) UISFX_ONLY=1 ;;
    --with-real-sfx) WITH_REAL_SFX=1 ;;
    --with-earshot) WITH_EARSHOT=1 ;;
    --all) WITH_REAL_SFX=1; WITH_EARSHOT=1 ;;
    -h|--help)
      printf '%s\n' "usage: $0 [--uisfx-only] [--with-real-sfx] [--with-earshot] [--all]"
      printf '%s\n' "  --uisfx-only  install only uisfx (14 MB) and reuse the ffmpeg already available"
      printf '%s\n' "  default       install ffmpeg/ffprobe (if missing), uisfx, and write $ROOT/env.sh"
      exit 0
      ;;
    *) printf 'unknown argument: %s\n' "$arg" >&2; exit 2 ;;
  esac
done

if [ "$UISFX_ONLY" -eq 1 ] && { [ "$WITH_REAL_SFX" -eq 1 ] || [ "$WITH_EARSHOT" -eq 1 ]; }; then
  printf '%s\n' "--uisfx-only cannot be combined with --with-real-sfx or --with-earshot" >&2
  exit 2
fi

need() {
  command -v "$1" >/dev/null 2>&1 || { printf 'missing required command: %s\n' "$1" >&2; exit 1; }
}

mkdir -p "$ROOT" "$BIN"

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

resolve_ffmpeg_path() {
  if [ -n "${NHILOS_FFMPEG:-}" ] && [ -x "${NHILOS_FFMPEG}" ]; then
    printf '%s\n' "$NHILOS_FFMPEG"
    return
  fi
  if command -v ffmpeg >/dev/null 2>&1; then
    command -v ffmpeg
    return
  fi
  python3 - "$REPO" <<'PY' 2>/dev/null || true
import sys
sys.path.insert(0, sys.argv[1])
from scripts.audio import spec
print(spec.resolve_ffmpeg())
PY
}

resolve_ffprobe_path() {
  if [ -n "${NHILOS_FFPROBE:-}" ] && [ -x "${NHILOS_FFPROBE}" ]; then
    printf '%s\n' "$NHILOS_FFPROBE"
    return
  fi
  if command -v ffprobe >/dev/null 2>&1; then
    command -v ffprobe
    return
  fi
  python3 - "$REPO" <<'PY' 2>/dev/null || true
import sys
sys.path.insert(0, sys.argv[1])
from scripts.audio import spec
probe = spec.resolve_ffprobe()
if probe:
    print(probe)
PY
}

install_ffmpeg() {
  if command -v ffmpeg >/dev/null 2>&1 && command -v ffprobe >/dev/null 2>&1; then
    FFMPEG="$(command -v ffmpeg)"
    FFPROBE="$(command -v ffprobe)"
    printf 'using system ffmpeg: %s\n' "$FFMPEG"
    return
  fi

  need curl
  need tar
  local downloads="$ROOT/downloads"
  local tarball="$downloads/ffmpeg-release-amd64-static.tar.xz"
  mkdir -p "$downloads"
  printf 'downloading static ffmpeg + ffprobe ...\n'
  curl -fL --retry 3 --retry-delay 2 -o "$tarball" "$FFMPEG_URL"
  curl -fsSL --retry 3 --retry-delay 2 -o "$tarball.md5" "$FFMPEG_URL.md5"
  (
    cd "$downloads"
    md5sum -c "$(basename "$tarball").md5"
  )
  tar -xf "$tarball" -C "$downloads"
  local ffmpeg_src ffprobe_src
  ffmpeg_src="$(find "$downloads" -maxdepth 2 -type f -name ffmpeg | head -n 1)"
  ffprobe_src="$(find "$downloads" -maxdepth 2 -type f -name ffprobe | head -n 1)"
  if [ -z "$ffmpeg_src" ] || [ -z "$ffprobe_src" ]; then
    printf 'static archive did not contain ffmpeg and ffprobe\n' >&2
    exit 1
  fi
  cp "$ffmpeg_src" "$BIN/ffmpeg"
  cp "$ffprobe_src" "$BIN/ffprobe"
  chmod +x "$BIN/ffmpeg" "$BIN/ffprobe"
  FFMPEG="$BIN/ffmpeg"
  FFPROBE="$BIN/ffprobe"
  printf 'installed: %s and %s\n' "$FFMPEG" "$FFPROBE"
}

install_uisfx() {
  need npm
  printf 'installing uisfx (CC0 interface sounds) ...\n'
  npm install uisfx --prefix "$ROOT/uisfx" --no-audit --no-fund
  if [ ! -f "$ROOT/uisfx/node_modules/uisfx/manifest.json" ]; then
    printf 'uisfx manifest missing after install\n' >&2
    exit 1
  fi
  printf 'installed uisfx: %s\n' "$ROOT/uisfx/node_modules/uisfx"
}

install_real_sfx() {
  need git
  if [ ! -f "$ROOT/real-sfx/scripts/from_cues.py" ]; then
    printf 'cloning Real SFX ...\n'
    rm -rf "$ROOT/clipwing-skills"
    git clone --depth 1 --filter=blob:none --sparse \
      https://github.com/Clipwing/skills.git "$ROOT/clipwing-skills"
    git -C "$ROOT/clipwing-skills" sparse-checkout set skills/real-sfx
    rm -rf "$ROOT/real-sfx"
    cp -R "$ROOT/clipwing-skills/skills/real-sfx" "$ROOT/real-sfx"
  fi
  mkdir -p "$ROOT/real-sfx/vendor/node_modules"
  ln -sfn "$ROOT/uisfx/node_modules/uisfx" "$ROOT/real-sfx/vendor/node_modules/uisfx"
  if [ ! -f "$ROOT/real-sfx/library_index.json" ]; then
    (cd "$ROOT/real-sfx" && PATH="$BIN:$PATH" python3 scripts/build_index.py) || true
  fi
  printf 'Real SFX: %s\n' "$ROOT/real-sfx"
  PATH="$BIN:$PATH" python3 "$ROOT/real-sfx/scripts/setup.py" check || true
}

install_earshot() {
  need git
  need uv
  if [ ! -f "$ROOT/earshot/earshot/cli.py" ]; then
    printf 'cloning Earshot ...\n'
    rm -rf "$ROOT/earshot"
    git clone --depth 1 https://github.com/Leonxlnx/earshot.git "$ROOT/earshot"
  fi
  if [ ! -x "$ROOT/earshot/.venv/bin/earshot" ]; then
    printf 'installing Earshot CPU environment (downloads models on first use) ...\n'
    (
      cd "$ROOT/earshot"
      uv venv .venv
      . .venv/bin/activate
      uv pip install torch --index-url https://download.pytorch.org/whl/cpu
      uv pip install -e ".[mcp,llm]"
    )
  fi
  printf 'Earshot: %s\n' "$ROOT/earshot/.venv/bin/earshot"
}

if [ "$UISFX_ONLY" -eq 1 ]; then
  FFMPEG="$(resolve_ffmpeg_path || true)"
  FFPROBE="$(resolve_ffprobe_path || true)"
  if [ -n "$FFMPEG" ]; then
    printf 'using ffmpeg: %s\n' "$FFMPEG"
  else
    printf 'warning: ffmpeg not found; set NHILOS_FFMPEG or install it later\n' >&2
  fi
else
  install_ffmpeg
fi
install_uisfx
if [ "$WITH_REAL_SFX" -eq 1 ]; then
  install_real_sfx
fi
if [ "$WITH_EARSHOT" -eq 1 ]; then
  install_earshot
fi

{
  if [ -n "${FFMPEG:-}" ]; then printf 'export NHILOS_FFMPEG="%s"\n' "$FFMPEG"; fi
  if [ -n "${FFPROBE:-}" ]; then printf 'export NHILOS_FFPROBE="%s"\n' "$FFPROBE"; fi
  printf 'export NHILOS_UISFX_DIR="%s"\n' "$ROOT/uisfx/node_modules/uisfx"
  printf 'export NHILOS_REAL_SFX_DIR="%s"\n' "$ROOT/real-sfx"
  printf 'export NHILOS_EARSHOT="%s"\n' "$ROOT/earshot/.venv/bin/earshot"
  printf 'export PATH="%s:$PATH"\n' "$BIN"
} > "$ROOT/env.sh"

printf '\nready. load the environment with:\n  source %s/env.sh\n' "$ROOT"
printf 'check with:\n  python3 -m scripts.audio.spec --doctor --json\n'
