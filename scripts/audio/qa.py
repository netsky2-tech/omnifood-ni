#!/usr/bin/env python3
"""Measure loudness, true peak, LRA, and silence with ffmpeg."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from scripts.audio import spec as audio_spec
else:
    from . import spec as audio_spec


def _float_or_none(value: str) -> float | None:
    try:
        return float(value)
    except ValueError:
        return None


def measure_loudness(path: str | Path, ffmpeg: Path | None = None) -> dict[str, Any]:
    ffmpeg = ffmpeg or audio_spec.resolve_ffmpeg()
    result = subprocess.run(
        [str(ffmpeg), "-hide_banner", "-nostats", "-i", str(path),
         "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True, check=False,
    )
    stderr = result.stderr or ""
    if result.returncode != 0:
        return {
            "file": str(path),
            "error": stderr.strip().splitlines()[-1] if stderr.strip() else "ffmpeg failed",
            "integrated_lufs": None,
            "true_peak_dbfs": None,
            "lra_lu": None,
        }

    integrated = re.findall(r"I:\s*(-?\d+(?:\.\d+)?|-inf)\s+LUFS", stderr)
    peaks = re.findall(r"Peak:\s*(-?\d+(?:\.\d+)?|-inf)\s+dBFS", stderr)
    ranges = re.findall(r"LRA:\s*(-?\d+(?:\.\d+)?|-inf)\s+LU", stderr)

    duration = audio_spec.probe_duration(path, ffmpeg)
    lra = _float_or_none(ranges[-1]) if ranges else None
    lra_applicable = duration is None or duration >= 3.5
    return {
        "file": str(path),
        "duration_s": round(duration, 3) if duration is not None else None,
        "integrated_lufs": _float_or_none(integrated[-1]) if integrated else None,
        "true_peak_dbfs": _float_or_none(peaks[-1]) if peaks else None,
        "lra_lu": lra if lra_applicable else None,
        "lra_measured_lu": lra,
        "lra_applicable": lra_applicable,
    }


def detect_silence(path: str | Path, ffmpeg: Path | None = None,
                   noise_db: float = -40.0, min_duration: float = 0.3) -> list[dict[str, float]]:
    ffmpeg = ffmpeg or audio_spec.resolve_ffmpeg()
    result = subprocess.run(
        [str(ffmpeg), "-hide_banner", "-nostats", "-i", str(path),
         "-af", f"silencedetect=noise={noise_db}dB:d={min_duration}",
         "-f", "null", "-"],
        capture_output=True, text=True, check=False,
    )
    stderr = result.stderr or ""
    intervals: list[dict[str, float]] = []
    pending: float | None = None
    for line in stderr.splitlines():
        if "silence_start:" in line:
            match = re.search(r"silence_start:\s*(-?\d+(?:\.\d+)?)", line)
            if match:
                pending = float(match.group(1))
        elif "silence_end:" in line:
            match = re.search(
                r"silence_end:\s*(-?\d+(?:\.\d+)?)\s*\|\s*silence_duration:\s*(-?\d+(?:\.\d+)?)",
                line,
            )
            if match:
                end, duration = float(match.group(1)), float(match.group(2))
                start = pending if pending is not None else end - duration
                intervals.append({"start_s": round(start, 3), "end_s": round(end, 3),
                                  "duration_s": round(duration, 3)})
                pending = None
    if pending is not None:
        duration = audio_spec.probe_duration(path, ffmpeg)
        if duration is not None:
            intervals.append({"start_s": round(pending, 3), "end_s": round(duration, 3),
                              "duration_s": round(duration - pending, 3)})
    return intervals


def check_delivery(loudness: dict[str, Any], target: dict[str, Any],
                   tolerance_lu: float = 1.0, peak_margin: float = 0.1,
                   lra_margin: float = 0.5) -> dict[str, Any]:
    reasons: list[str] = []
    integrated = loudness.get("integrated_lufs")
    peak = loudness.get("true_peak_dbfs")
    lra = loudness.get("lra_lu")

    if integrated is None:
        reasons.append("integrated loudness unavailable")
    elif abs(integrated - float(target["target_lufs"])) > tolerance_lu:
        reasons.append(
            f"integrated {integrated} LUFS outside {target['target_lufs']} ± {tolerance_lu}"
        )

    if peak is None:
        reasons.append("true peak unavailable")
    elif peak > float(target["true_peak_db"]) + peak_margin:
        reasons.append(
            f"true peak {peak} dBFS above {target['true_peak_db']} dBTP"
        )

    if loudness.get("lra_applicable", True):
        if lra is None:
            reasons.append("LRA unavailable")
        elif lra > float(target["lra"]) + lra_margin:
            reasons.append(f"LRA {lra} LU above {target['lra']} LU")

    return {"pass": not reasons, "reasons": reasons}


def analyze(path: str | Path, target: dict[str, Any] | None = None,
            with_silence: bool = True, silence_db: float = -40.0,
            silence_min: float = 0.3) -> dict[str, Any]:
    target = target or audio_spec.DEFAULT_LOUDNESS
    loudness = measure_loudness(path)
    report: dict[str, Any] = {"loudness": loudness, "target": target}
    if with_silence:
        report["silence"] = detect_silence(path, noise_db=silence_db, min_duration=silence_min)
    report["delivery"] = check_delivery(loudness, target)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("media", help="audio or video file")
    parser.add_argument("--json", action="store_true", help="print JSON")
    parser.add_argument("--target-lufs", type=float, default=audio_spec.DEFAULT_LOUDNESS["target_lufs"])
    parser.add_argument("--target-peak", type=float, default=audio_spec.DEFAULT_LOUDNESS["true_peak_db"])
    parser.add_argument("--target-lra", type=float, default=audio_spec.DEFAULT_LOUDNESS["lra"])
    parser.add_argument("--silence-db", type=float, default=-40.0)
    parser.add_argument("--silence-duration", type=float, default=0.3)
    parser.add_argument("--no-silence", action="store_true")
    parser.add_argument("--earshot", action="store_true", help="merge Earshot analysis when installed")
    args = parser.parse_args(argv)

    target = {
        "target_lufs": args.target_lufs,
        "true_peak_db": args.target_peak,
        "lra": args.target_lra,
    }
    report = analyze(args.media, target, not args.no_silence,
                     args.silence_db, args.silence_duration)
    if args.earshot:
        try:
            from scripts.audio.adapters.earshot import measure as earshot_measure
        except ImportError:
            from .adapters.earshot import measure as earshot_measure
        report["earshot"] = earshot_measure(args.media)

    if args.json:
        print(json.dumps(report, indent=2, ensure_ascii=False))
    else:
        loud = report["loudness"]
        delivery = report["delivery"]
        print(f"{args.media}")
        print(f"  integrated: {loud.get('integrated_lufs')} LUFS")
        print(f"  true peak:  {loud.get('true_peak_dbfs')} dBFS")
        print(f"  LRA:        {loud.get('lra_lu')} LU")
        for interval in report.get("silence", []):
            print(f"  silence:    {interval['start_s']}s .. {interval['end_s']}s")
        print(f"  delivery:   {'PASS' if delivery['pass'] else 'FAIL'}")
        for reason in delivery["reasons"]:
            print(f"    - {reason}")
    return 0 if report["delivery"]["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
