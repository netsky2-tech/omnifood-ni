#!/usr/bin/env python3
"""Real SFX adapter: export typed cues and optionally render with its library."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from scripts.audio import spec as audio_spec
else:
    from .. import spec as audio_spec


def root() -> Path:
    configured = os.environ.get("NHILOS_REAL_SFX_DIR")
    if configured:
        return Path(configured).expanduser().resolve()
    return (Path.home() / ".local/opt/nhilos-audio/real-sfx").resolve()


def available() -> bool:
    return (root() / "scripts/from_cues.py").is_file()


def _env() -> dict[str, str]:
    env = dict(os.environ)
    paths: list[str] = []
    try:
        paths.append(str(audio_spec.resolve_ffmpeg().parent))
    except audio_spec.AudioSpecError:
        pass
    ffprobe = audio_spec.resolve_ffprobe()
    if ffprobe:
        paths.append(str(ffprobe.parent))
    if paths:
        env["PATH"] = os.pathsep.join(dict.fromkeys(paths + [env.get("PATH", "")]))
    return env


def check() -> dict[str, Any]:
    if not available():
        return {
            "available": False,
            "error": f"Real SFX not installed at {root()}; run scripts/audio/install_tools.sh --with-real-sfx",
        }
    result = subprocess.run(
        [sys.executable, "scripts/setup.py", "check"],
        cwd=root(), capture_output=True, text=True, check=False, env=_env(),
    )
    return {
        "available": True,
        "path": str(root()),
        "returncode": result.returncode,
        "stdout": (result.stdout or "").strip(),
        "stderr": (result.stderr or "").strip(),
    }


def export_cues(spec: dict[str, Any], out: str | Path) -> Path:
    path = Path(out).expanduser().resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(audio_spec.to_real_sfx_cues(spec), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def render(spec: dict[str, Any], out: str | Path, work_dir: str | None = None,
           voice_safe: bool = True, normalize: bool = True) -> dict[str, Any]:
    if not available():
        raise audio_spec.AudioSpecError(
            f"Real SFX not installed at {root()}; run scripts/audio/install_tools.sh --with-real-sfx"
        )
    if audio_spec.resolve_ffprobe() is None:
        raise audio_spec.AudioSpecError(
            "Real SFX needs ffprobe; run scripts/audio/install_tools.sh or set NHILOS_FFPROBE"
        )
    if not spec.get("video"):
        raise audio_spec.AudioSpecError("Real SFX render requires video")

    video = audio_spec.resolve_path(spec, spec["video"])
    out_path = Path(out).expanduser().resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    work = Path(work_dir).expanduser().resolve() if work_dir else Path(
        tempfile.mkdtemp(prefix="nhilos-real-sfx-")
    )
    work.mkdir(parents=True, exist_ok=True)

    cues = export_cues(spec, work / "cues.json")
    voiced = work / "voiced.json"
    from_cues = subprocess.run(
        [sys.executable, "scripts/from_cues.py", str(cues), "--video", str(video),
         "--out", str(voiced)],
        cwd=root(), capture_output=True, text=True, check=False, env=_env(),
    )
    if from_cues.returncode != 0:
        tail = (from_cues.stderr or from_cues.stdout or "").strip().splitlines()[-12:]
        raise RuntimeError("Real SFX from_cues failed:\n" + "\n".join(tail))

    mix_command = [sys.executable, "scripts/mix.py", str(voiced), "--out", str(out_path)]
    if voice_safe:
        mix_command.append("--voice-safe")
    mixed = subprocess.run(
        mix_command, cwd=root(), capture_output=True, text=True, check=False, env=_env()
    )
    if mixed.returncode != 0:
        tail = (mixed.stderr or mixed.stdout or "").strip().splitlines()[-12:]
        raise RuntimeError("Real SFX mix failed:\n" + "\n".join(tail))

    result: dict[str, Any] = {
        "output": str(out_path),
        "cues": str(cues),
        "voiced": str(voiced),
        "work_dir": str(work),
        "from_cues": (from_cues.stdout or "").strip(),
        "mix": (mixed.stdout or "").strip(),
        "normalized": False,
    }

    if normalize and out_path.suffix.lower() in (".mp4", ".mov", ".m4v"):
        ffmpeg = audio_spec.resolve_ffmpeg()
        audio = work / "real_sfx_audio.wav"
        extracted = subprocess.run(
            [str(ffmpeg), "-y", "-i", str(out_path), "-vn", "-ar", "48000", "-ac", "2",
             "-c:a", "pcm_s16le", str(audio)],
            capture_output=True, text=True, check=False,
        )
        if extracted.returncode != 0:
            tail = (extracted.stderr or "").strip().splitlines()[-12:]
            raise RuntimeError("Real SFX audio extraction failed:\n" + "\n".join(tail))
        try:
            from scripts.audio import mixer
        except ImportError:
            from .. import mixer
        normalized, measured, linear = mixer.normalize_audio(
            audio, work, spec["loudness"], ffmpeg
        )
        final = work / "real_sfx_final.mp4"
        remuxed = subprocess.run(
            [str(ffmpeg), "-y", "-i", str(out_path), "-i", str(normalized),
             "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
             "-b:a", "192k", "-shortest", str(final)],
            capture_output=True, text=True, check=False,
        )
        if remuxed.returncode != 0:
            tail = (remuxed.stderr or "").strip().splitlines()[-12:]
            raise RuntimeError("Real SFX final mux failed:\n" + "\n".join(tail))
        final.replace(out_path)
        result.update({
            "normalized": True,
            "linear_loudnorm": linear,
            "loudnorm_before": measured,
        })

    try:
        from scripts.audio.qa import measure_loudness
    except ImportError:
        from ..qa import measure_loudness
    result["loudness"] = measure_loudness(out_path)
    return result


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["check", "cues", "render"])
    parser.add_argument("spec", nargs="?")
    parser.add_argument("--root", help="base directory for relative paths (default: cwd)")
    parser.add_argument("--out", help="output cues JSON or rendered media")
    parser.add_argument("--work-dir")
    parser.add_argument("--no-voice-safe", action="store_true")
    parser.add_argument("--no-normalize", action="store_true")
    args = parser.parse_args(argv)

    try:
        if args.command == "check":
            payload = check()
        else:
            if not args.spec:
                parser.error(f"{args.command} requires a spec")
            spec = audio_spec.load_spec(args.spec, args.root)
            if args.command == "cues":
                if not args.out:
                    parser.error("cues requires --out")
                path = export_cues(spec, args.out)
                payload = {"cues": str(path), "count": len(spec.get("sfx_cues", []))}
            else:
                if not args.out:
                    parser.error("render requires --out")
                payload = render(spec, args.out, args.work_dir, not args.no_voice_safe, not args.no_normalize)
        print(json.dumps(payload, indent=2, ensure_ascii=False))
        return 0 if payload.get("available", True) and payload.get("returncode", 0) == 0 else 1
    except (audio_spec.AudioSpecError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
