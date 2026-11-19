#!/usr/bin/env python3
"""Validate audio execution specs, resolve sources, and export Real SFX cues."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

DEFAULT_FPS = 30
DEFAULT_LOUDNESS = {"target_lufs": -14.0, "true_peak_db": -1.0, "lra": 6.0}
DEFAULT_UISFX_PACK = "studio"

UISFX_KIND_MAP: dict[str, tuple[str, str]] = {
    "tap": ("studio", "press"),
    "click": ("studio", "press"),
    "press": ("studio", "press"),
    "pop": ("studio", "select"),
    "select": ("studio", "select"),
    "key": ("studio", "typing"),
    "typing": ("studio", "typing"),
    "keystroke": ("studio", "typing"),
    "success": ("studio", "success"),
    "complete": ("studio", "complete"),
    "error": ("studio", "error"),
    "warning": ("studio", "warning"),
    "cta": ("studio", "purchase"),
    "purchase": ("studio", "purchase"),
    "checkout": ("studio", "checkout"),
    "coins": ("studio", "purchase"),
    "tick": ("studio", "progress-step"),
    "progress": ("studio", "progress-step"),
    "chime": ("studio", "notification"),
    "notification": ("studio", "notification"),
    "whoosh": ("studio", "swipe"),
    "swipe": ("studio", "swipe"),
    "wipe": ("studio", "swipe"),
    "transition": ("studio", "swipe"),
    "hit": ("cinematic", "drop"),
    "hook": ("cinematic", "drop"),
    "drop": ("cinematic", "drop"),
    "impact": ("cinematic", "drop"),
    "reward": ("studio", "reward"),
    "badge": ("studio", "badge"),
    "ambience": ("studio", "loading"),
}

REAL_SFX_KIND_MAP: dict[str, str] = {
    "tap": "click",
    "click": "click",
    "press": "click",
    "pop": "pop",
    "select": "pop",
    "key": "key",
    "typing": "key",
    "keystroke": "key",
    "success": "success",
    "complete": "success",
    "error": "error",
    "warning": "error",
    "cta": "coins",
    "purchase": "coins",
    "checkout": "coins",
    "coins": "coins",
    "tick": "tick",
    "progress": "tick",
    "chime": "chime",
    "notification": "chime",
    "whoosh": "whoosh",
    "swipe": "whoosh",
    "wipe": "wipe",
    "transition": "wipe",
    "hit": "hit",
    "hook": "hit",
    "drop": "drop",
    "impact": "hit",
    "reward": "chime",
    "badge": "success",
    "ambience": "ambience",
    "tone": "chime",
    "noise": "whoosh",
}

SOURCE_TYPES = ("uisfx", "file", "synth", "openverse")
SYNTH_PRESETS = ("tone", "sine", "keystroke", "noise")


class AudioSpecError(ValueError):
    """Raised when an audio execution spec cannot be validated or resolved."""


def _require_number(value: Any, field: str, *, minimum: float | None = None,
                    maximum: float | None = None) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise AudioSpecError(f"{field} must be a number")
    number = float(value)
    if minimum is not None and number < minimum:
        raise AudioSpecError(f"{field} must be >= {minimum}")
    if maximum is not None and number > maximum:
        raise AudioSpecError(f"{field} must be <= {maximum}")
    return number


def _require_string(value: Any, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise AudioSpecError(f"{field} must be a non-empty string")
    return value.strip()


def load_spec(path: str | os.PathLike[str], root: str | os.PathLike[str] | None = None) -> dict[str, Any]:
    spec_path = Path(path).expanduser().resolve()
    try:
        data = json.loads(spec_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise AudioSpecError(f"spec not found: {spec_path}") from exc
    except json.JSONDecodeError as exc:
        raise AudioSpecError(f"invalid JSON in {spec_path}: {exc}") from exc
    if not isinstance(data, dict):
        raise AudioSpecError("spec root must be an object")

    base_dir = Path(root).expanduser().resolve() if root else Path.cwd().resolve()
    spec = dict(data)
    spec["_path"] = str(spec_path)
    spec["_base_dir"] = str(base_dir)
    validate_spec(spec)
    return spec


def validate_spec(spec: dict[str, Any]) -> None:
    if "fps" in spec:
        _require_number(spec["fps"], "fps", minimum=1)
    spec.setdefault("fps", DEFAULT_FPS)

    loudness = spec.setdefault("loudness", {})
    if not isinstance(loudness, dict):
        raise AudioSpecError("loudness must be an object")
    merged = dict(DEFAULT_LOUDNESS)
    merged.update(loudness)
    _require_number(merged["target_lufs"], "loudness.target_lufs", minimum=-40, maximum=-5)
    _require_number(merged["true_peak_db"], "loudness.true_peak_db", minimum=-12, maximum=0)
    _require_number(merged["lra"], "loudness.lra", minimum=0.5, maximum=30)
    spec["loudness"] = merged

    cues = spec.setdefault("sfx_cues", [])
    if not isinstance(cues, list):
        raise AudioSpecError("sfx_cues must be an array")

    seen: set[str] = set()
    for index, cue in enumerate(cues):
        if not isinstance(cue, dict):
            raise AudioSpecError(f"sfx_cues[{index}] must be an object")
        cue_id = _require_string(cue.get("cue_id"), f"sfx_cues[{index}].cue_id")
        if cue_id in seen:
            raise AudioSpecError(f"duplicate cue_id: {cue_id}")
        seen.add(cue_id)
        _require_string(cue.get("kind"), f"sfx_cues[{index}].kind")

        if "time_s" not in cue and "frame" not in cue:
            raise AudioSpecError(f"{cue_id}: time_s or frame is required")
        if "time_s" in cue:
            _require_number(cue["time_s"], f"{cue_id}.time_s", minimum=0)
        if "frame" in cue:
            _require_number(cue["frame"], f"{cue_id}.frame", minimum=0)
        if "length_s" in cue:
            _require_number(cue["length_s"], f"{cue_id}.length_s", minimum=0.001)
        if "length_frames" in cue:
            _require_number(cue["length_frames"], f"{cue_id}.length_frames", minimum=1)
        if "gain_db" in cue:
            _require_number(cue["gain_db"], f"{cue_id}.gain_db", minimum=-60, maximum=12)
        if "pan" in cue:
            _require_number(cue["pan"], f"{cue_id}.pan", minimum=-1, maximum=1)

        source = cue.get("source")
        if not isinstance(source, dict):
            raise AudioSpecError(f"{cue_id}.source must be an object")
        source_type = source.get("type")
        if source_type not in SOURCE_TYPES:
            raise AudioSpecError(f"{cue_id}.source.type must be one of {', '.join(SOURCE_TYPES)}")
        if source_type == "file":
            _require_string(source.get("path"), f"{cue_id}.source.path")
        elif source_type == "uisfx":
            if "pack" in source:
                _require_string(source["pack"], f"{cue_id}.source.pack")
            if "cue" in source:
                _require_string(source["cue"], f"{cue_id}.source.cue")
        elif source_type == "synth":
            preset = source.get("preset", "tone")
            if preset not in SYNTH_PRESETS:
                raise AudioSpecError(f"{cue_id}.source.preset must be one of {', '.join(SYNTH_PRESETS)}")
            if "freq_hz" in source:
                _require_number(source["freq_hz"], f"{cue_id}.source.freq_hz", minimum=20, maximum=20000)
            if "duration_s" in source:
                _require_number(source["duration_s"], f"{cue_id}.source.duration_s", minimum=0.001, maximum=10)
        elif source_type == "openverse":
            _require_string(source.get("query"), f"{cue_id}.source.query")
            if "role" in source:
                _require_string(source["role"], f"{cue_id}.source.role")

    music = spec.get("music_bed")
    if music is not None:
        if not isinstance(music, dict):
            raise AudioSpecError("music_bed must be an object")
        _require_string(music.get("path"), "music_bed.path")
        if "gain_db" in music:
            _require_number(music["gain_db"], "music_bed.gain_db", minimum=-60, maximum=12)
        if "loop" in music and not isinstance(music["loop"], bool):
            raise AudioSpecError("music_bed.loop must be a boolean")
        ducking = music.get("ducking")
        if ducking is not None:
            if not isinstance(ducking, dict):
                raise AudioSpecError("music_bed.ducking must be an object")
            if "threshold_db" in ducking:
                _require_number(ducking["threshold_db"], "music_bed.ducking.threshold_db", minimum=-60, maximum=0)
            if "ratio" in ducking:
                _require_number(ducking["ratio"], "music_bed.ducking.ratio", minimum=1, maximum=20)
            if "attack_ms" in ducking:
                _require_number(ducking["attack_ms"], "music_bed.ducking.attack_ms", minimum=0.01, maximum=2000)
            if "release_ms" in ducking:
                _require_number(ducking["release_ms"], "music_bed.ducking.release_ms", minimum=0.01, maximum=9000)

    voice = spec.get("voice_track")
    if voice is not None:
        _require_string(voice, "voice_track")
        if voice == "@video" and not spec.get("video"):
            raise AudioSpecError("voice_track @video requires video")
    if "video" in spec:
        _require_string(spec["video"], "video")
    if "output" in spec:
        _require_string(spec["output"], "output")
    if "license_manifest" in spec:
        _require_string(spec["license_manifest"], "license_manifest")
    uisfx = spec.get("uisfx")
    if uisfx is not None:
        if not isinstance(uisfx, dict):
            raise AudioSpecError("uisfx must be an object")
        if "root" in uisfx:
            _require_string(uisfx["root"], "uisfx.root")
        if "default_pack" in uisfx:
            _require_string(uisfx["default_pack"], "uisfx.default_pack")


def resolve_path(spec: dict[str, Any], value: str) -> Path:
    if value.startswith("@"):
        raise AudioSpecError(f"cannot resolve virtual path: {value}")
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path(spec["_base_dir"]) / path
    return path.resolve()


def cue_time_seconds(cue: dict[str, Any], fps: float) -> float:
    if "time_s" in cue:
        return float(cue["time_s"])
    return float(cue["frame"]) / float(fps)


def cue_length_seconds(cue: dict[str, Any], fps: float | None = None) -> float | None:
    if "length_s" in cue:
        return float(cue["length_s"])
    if "length_frames" in cue and fps:
        return float(cue["length_frames"]) / float(fps)
    return None


def _candidate_roots(spec: dict[str, Any]) -> list[Path]:
    roots: list[Path] = []
    configured = spec.get("uisfx", {}).get("root")
    if configured:
        roots.append(resolve_path(spec, configured))
    env = os.environ.get("NHILOS_UISFX_DIR")
    if env:
        roots.append(Path(env).expanduser())
    roots.append(Path.home() / ".local/opt/nhilos-audio/uisfx/node_modules/uisfx")
    repo = Path(__file__).resolve().parents[2]
    roots.append(repo / "vendor/node_modules/uisfx")
    return roots


def uisfx_root(spec: dict[str, Any]) -> Path:
    for root in _candidate_roots(spec):
        if (root / "manifest.json").is_file():
            return root.resolve()
    raise AudioSpecError(
        "uisfx not found; run scripts/audio/install_tools.sh --uisfx-only or set NHILOS_UISFX_DIR"
    )


_MANIFEST_CACHE: dict[str, dict[str, Any]] = {}


def load_uisfx_manifest(root: Path) -> dict[str, Any]:
    key = str(root)
    if key not in _MANIFEST_CACHE:
        manifest_path = root / "manifest.json"
        try:
            _MANIFEST_CACHE[key] = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (FileNotFoundError, json.JSONDecodeError) as exc:
            raise AudioSpecError(f"cannot read uisfx manifest: {manifest_path}") from exc
    return _MANIFEST_CACHE[key]


def resolve_uisfx(spec: dict[str, Any], pack: str | None, cue: str | None) -> dict[str, Any]:
    root = uisfx_root(spec)
    manifest = load_uisfx_manifest(root)
    pack = pack or spec.get("uisfx", {}).get("default_pack") or DEFAULT_UISFX_PACK

    packs = {item["name"] for item in manifest.get("packs", [])}
    cues = {item["name"] for item in manifest.get("cues", [])}
    if pack not in packs:
        raise AudioSpecError(f"unknown uisfx pack: {pack}; available: {', '.join(sorted(packs))}")
    if cue not in cues:
        raise AudioSpecError(f"unknown uisfx cue: {cue}; available: {', '.join(sorted(cues))}")

    asset = next(
        (item for item in manifest.get("assets", [])
         if item.get("pack") == pack and item.get("cue") == cue),
        None,
    )
    if asset is None:
        raise AudioSpecError(f"uisfx asset missing for {pack}/{cue}")

    files = asset.get("files", {})
    relative = files.get("mp3", {}).get("path") or files.get("ogg", {}).get("path")
    if not relative:
        raise AudioSpecError(f"uisfx asset has no audio file: {pack}/{cue}")
    path = (root / relative).resolve()
    if not path.is_file():
        raise AudioSpecError(f"uisfx file missing: {path}")
    return {
        "type": "uisfx",
        "path": str(path),
        "pack": pack,
        "cue": cue,
        "duration_s": asset.get("duration"),
        "default_volume": asset.get("defaultVolume", 1.0),
        "loop": bool(asset.get("loop", False)),
    }


def _load_license_manifest(spec: dict[str, Any]) -> tuple[Path, list[dict[str, Any]]]:
    configured = spec.get("license_manifest")
    manifest_path = resolve_path(spec, configured) if configured else resolve_path(
        spec, "assets/sfx/licenses.json"
    )
    if not manifest_path.is_file():
        return manifest_path, []
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise AudioSpecError(f"invalid license manifest: {manifest_path}") from exc
    assets = data.get("assets") if isinstance(data, dict) else data
    if not isinstance(assets, list):
        raise AudioSpecError(f"license manifest must contain an assets array: {manifest_path}")
    return manifest_path, assets


def resolve_openverse(spec: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    manifest_path, assets = _load_license_manifest(spec)
    if "path" in source:
        path = resolve_path(spec, source["path"])
        if not path.is_file():
            raise AudioSpecError(f"openverse asset not found: {path}")
        return {"type": "openverse", "path": str(path), "entry": None}

    wanted_id = source.get("id")
    query = source.get("query")
    role = source.get("role")
    match = None
    for entry in assets:
        if not isinstance(entry, dict):
            continue
        if wanted_id and entry.get("id") == wanted_id:
            match = entry
            break
        if not wanted_id and entry.get("query") == query and (role is None or entry.get("role") == role):
            match = entry
            break
    if match is None:
        hint = source.get("query", "")
        role_hint = f" --role {role}" if role else ""
        raise AudioSpecError(
            f"openverse asset not indexed for query '{hint}'; run "
            f"python3 -m scripts.audio.source_openverse fetch --query \"{hint}\"{role_hint}"
        )
    relative = match.get("path")
    if not relative:
        raise AudioSpecError(f"openverse manifest entry has no path: {match.get('id')}")
    path = Path(relative)
    if not path.is_absolute():
        path = manifest_path.parent / path
    path = path.resolve()
    if not path.is_file():
        raise AudioSpecError(f"openverse file missing: {path}")
    return {"type": "openverse", "path": str(path), "entry": match}


def resolve_cue_source(spec: dict[str, Any], cue: dict[str, Any]) -> dict[str, Any]:
    source = cue["source"]
    source_type = source["type"]
    kind = cue["kind"]

    if source_type == "uisfx":
        mapped = UISFX_KIND_MAP.get(kind)
        pack = source.get("pack") or (mapped[0] if mapped else None)
        cue_name = source.get("cue") or (mapped[1] if mapped else None)
        if not cue_name:
            raise AudioSpecError(f"{cue['cue_id']}: no uisfx mapping for kind '{kind}'")
        resolved = resolve_uisfx(spec, pack, cue_name)
        resolved["gain_db"] = float(cue.get("gain_db", 0))
        return resolved

    if source_type == "file":
        path = resolve_path(spec, source["path"])
        if not path.is_file():
            raise AudioSpecError(f"{cue['cue_id']}: file not found: {path}")
        return {"type": "file", "path": str(path), "gain_db": float(cue.get("gain_db", 0))}

    if source_type == "synth":
        preset = source.get("preset", "tone")
        default_duration = {"tone": 0.12, "sine": 0.12, "keystroke": 0.04, "noise": 0.5}[preset]
        return {
            "type": "synth",
            "preset": preset,
            "freq_hz": float(source.get("freq_hz", 880)),
            "duration_s": float(source.get("duration_s") or cue_length_seconds(cue, spec["fps"]) or default_duration),
            "gain_db": float(cue.get("gain_db", 0)),
        }

    if source_type == "openverse":
        resolved = resolve_openverse(spec, source)
        resolved["gain_db"] = float(cue.get("gain_db", 0))
        return resolved

    raise AudioSpecError(f"{cue['cue_id']}: unsupported source type: {source_type}")


def to_real_sfx_cues(spec: dict[str, Any]) -> dict[str, list[dict[str, Any]]]:
    fps = spec["fps"]
    cues: list[dict[str, Any]] = []
    for cue in spec.get("sfx_cues", []):
        kind = cue["kind"]
        gain_db = float(cue.get("gain_db", 0))
        item: dict[str, Any] = {
            "cue_id": cue["cue_id"],
            "t": round(cue_time_seconds(cue, fps), 3),
            "type": cue.get("real_sfx_type") or REAL_SFX_KIND_MAP.get(kind, kind),
            "g": round(10 ** (gain_db / 20), 4),
        }
        length = cue_length_seconds(cue, fps)
        if length:
            item["len"] = round(length, 3)
        if "keystrokes" in cue:
            item["n"] = int(cue["keystrokes"])
        cues.append(item)
    return {"cues": cues}


def spec_summary(spec: dict[str, Any]) -> dict[str, Any]:
    by_source: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for cue in spec.get("sfx_cues", []):
        source_type = cue["source"]["type"]
        by_source[source_type] = by_source.get(source_type, 0) + 1
        by_kind[cue["kind"]] = by_kind.get(cue["kind"], 0) + 1
    return {
        "spec": spec["_path"],
        "base_dir": spec["_base_dir"],
        "fps": spec["fps"],
        "video": spec.get("video"),
        "voice_track": spec.get("voice_track"),
        "music_bed": (spec.get("music_bed") or {}).get("path"),
        "output": spec.get("output"),
        "cues": len(spec.get("sfx_cues", [])),
        "by_source": by_source,
        "by_kind": by_kind,
        "loudness": spec["loudness"],
    }


def _executable(path: Path) -> bool:
    return path.is_file() and os.access(path, os.X_OK)


def resolve_ffmpeg() -> Path:
    env = os.environ.get("NHILOS_FFMPEG")
    if env and _executable(Path(env).expanduser()):
        return Path(env).expanduser().resolve()
    found = shutil.which("ffmpeg")
    if found:
        return Path(found).resolve()
    local = Path.home() / ".local/opt/nhilos-audio/bin/ffmpeg"
    if _executable(local):
        return local
    cache = Path.home() / ".cache/uv/archive-v0"
    if cache.is_dir():
        for candidate in sorted(cache.glob("*/imageio_ffmpeg/binaries/ffmpeg-*"), reverse=True):
            if _executable(candidate):
                return candidate.resolve()
    raise AudioSpecError(
        "ffmpeg not found; install it or set NHILOS_FFMPEG (see scripts/audio/install_tools.sh)"
    )


def resolve_ffprobe() -> Path | None:
    env = os.environ.get("NHILOS_FFPROBE")
    if env and _executable(Path(env).expanduser()):
        return Path(env).expanduser().resolve()
    found = shutil.which("ffprobe")
    if found:
        return Path(found).resolve()
    local = Path.home() / ".local/opt/nhilos-audio/bin/ffprobe"
    if _executable(local):
        return local
    ffmpeg = resolve_ffmpeg()
    sibling = ffmpeg.with_name("ffprobe")
    if _executable(sibling):
        return sibling.resolve()
    return None


def probe_duration(path: str | Path, ffmpeg: Path | None = None,
                   ffprobe: Path | None = None) -> float | None:
    ffmpeg = ffmpeg or resolve_ffmpeg()
    if ffprobe is None:
        ffprobe = resolve_ffprobe()
    if ffprobe:
        result = subprocess.run(
            [str(ffprobe), "-v", "error", "-show_entries", "format=duration",
             "-of", "csv=p=0", str(path)],
            capture_output=True, text=True, check=False,
        )
        try:
            return float(result.stdout.strip())
        except ValueError:
            pass
    result = subprocess.run(
        [str(ffmpeg), "-hide_banner", "-i", str(path)],
        capture_output=True, text=True, check=False,
    )
    for line in (result.stderr or "").splitlines():
        if "Duration:" not in line:
            continue
        raw = line.split("Duration:", 1)[1].split(",", 1)[0].strip()
        try:
            hours, minutes, seconds = raw.split(":")
            return int(hours) * 3600 + int(minutes) * 60 + float(seconds)
        except ValueError:
            continue
    return None


def doctor() -> dict[str, Any]:
    result: dict[str, Any] = {}
    try:
        ffmpeg = resolve_ffmpeg()
        version = subprocess.run(
            [str(ffmpeg), "-version"], capture_output=True, text=True, check=False
        ).stdout.splitlines()
        result["ffmpeg"] = {"path": str(ffmpeg), "version": version[0] if version else None}
    except AudioSpecError as exc:
        result["ffmpeg"] = {"error": str(exc)}
    ffprobe = resolve_ffprobe()
    result["ffprobe"] = {"path": str(ffprobe) if ffprobe else None}

    spec = {"uisfx": {}, "_base_dir": str(Path.cwd())}
    try:
        root = uisfx_root(spec)
        manifest = load_uisfx_manifest(root)
        result["uisfx"] = {
            "path": str(root),
            "packs": len(manifest.get("packs", [])),
            "cues": len(manifest.get("cues", [])),
            "assets": len(manifest.get("assets", [])),
        }
    except AudioSpecError as exc:
        result["uisfx"] = {"error": str(exc)}

    real_sfx = os.environ.get("NHILOS_REAL_SFX_DIR") or str(
        Path.home() / ".local/opt/nhilos-audio/real-sfx"
    )
    result["real_sfx"] = {
        "path": real_sfx,
        "available": (Path(real_sfx) / "scripts/from_cues.py").is_file(),
    }
    earshot = shutil.which("earshot") or str(
        Path.home() / ".local/opt/nhilos-audio/earshot/.venv/bin/earshot"
    )
    result["earshot"] = {"path": earshot, "available": Path(earshot).is_file()}
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", nargs="?", help="path to audio_execution_spec JSON")
    parser.add_argument("--root", help="base directory for relative paths (default: cwd)")
    parser.add_argument("--out", help="write Real SFX cues to this file")
    parser.add_argument("--summary", action="store_true", help="print resolved summary")
    parser.add_argument("--doctor", action="store_true", help="print tool availability")
    parser.add_argument("--json", action="store_true", help="print JSON instead of text")
    args = parser.parse_args(argv)

    try:
        if args.doctor:
            report = doctor()
            print(json.dumps(report, indent=2, ensure_ascii=False) if args.json else
                  "\n".join(f"{key}: {value}" for key, value in report.items()))
            return 0
        if not args.spec:
            parser.error("spec is required unless --doctor is used")
        spec = load_spec(args.spec, args.root)
        cues = to_real_sfx_cues(spec)
        if args.out:
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(cues, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            print(f"wrote {out} ({len(cues['cues'])} cues)")
        if args.summary or not args.out:
            summary = spec_summary(spec)
            print(json.dumps(summary, indent=2, ensure_ascii=False) if args.json else
                  f"{summary['spec']}: {summary['cues']} cues, {summary['by_source']}, "
                  f"loudness {summary['loudness']['target_lufs']} LUFS")
        return 0
    except AudioSpecError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
