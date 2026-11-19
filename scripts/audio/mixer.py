#!/usr/bin/env python3
"""Mix a deterministic audio execution spec with ffmpeg and normalize loudness."""

from __future__ import annotations

import argparse
import json
import math
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
    from scripts.audio import spec as audio_spec
else:
    from . import spec as audio_spec


def _run(command: list[str], what: str) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        tail = (result.stderr or result.stdout or "").strip().splitlines()[-12:]
        raise RuntimeError(f"{what} failed:\n" + "\n".join(tail))
    return result


def _probe_duration(path: Path, ffmpeg: Path, ffprobe: Path | None) -> float | None:
    return audio_spec.probe_duration(path, ffmpeg, ffprobe)


def _prepare_voice(spec: dict[str, Any], work: Path, ffmpeg: Path,
                   ffprobe: Path | None, duration: float | None) -> Path | None:
    voice = spec.get("voice_track")
    if voice == "@video":
        video = audio_spec.resolve_path(spec, spec["video"])
        source = ["-i", str(video)]
        map_args = ["-map", "0:a:0"]
    elif voice:
        source = ["-i", str(audio_spec.resolve_path(spec, voice))]
        map_args = ["-map", "0:a:0"]
    else:
        if duration is None:
            return None
        source = ["-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo"]
        map_args = ["-t", f"{duration:.3f}"]

    output = work / "voice.wav"
    _run(
        [str(ffmpeg), "-y", *source, *map_args, "-ar", "48000", "-ac", "2",
         "-c:a", "pcm_s16le", str(output)],
        "voice preparation",
    )
    return output


def _prepare_music(spec: dict[str, Any], work: Path, ffmpeg: Path,
                   duration: float | None) -> Path | None:
    music = spec.get("music_bed")
    if not music:
        return None
    path = audio_spec.resolve_path(spec, music["path"])
    if not path.is_file():
        raise audio_spec.AudioSpecError(f"music bed not found: {path}")
    gain = float(music.get("gain_db", -18.0))
    loop = bool(music.get("loop", True))
    if loop and duration is None:
        raise audio_spec.AudioSpecError(
            "music_bed.loop requires a video/voice duration or at least one cue"
        )
    source = ["-stream_loop", "-1"] if loop else []
    trim = ["-t", f"{duration:.3f}"] if duration else []
    output = work / "music.wav"
    _run(
        [str(ffmpeg), "-y", *source, "-i", str(path), *trim,
         "-af", f"volume={gain}dB", "-ar", "48000", "-ac", "2",
         "-c:a", "pcm_s16le", str(output)],
        "music bed preparation",
    )
    return output


def _duck_music(music: Path, voice: Path, work: Path, ffmpeg: Path,
                ducking: dict[str, Any]) -> Path:
    threshold_db = float(ducking.get("threshold_db", -30.0))
    threshold = 10 ** (threshold_db / 20)
    ratio = float(ducking.get("ratio", 4.0))
    attack = float(ducking.get("attack_ms", 20.0))
    release = float(ducking.get("release_ms", 250.0))
    output = work / "music_ducked.wav"
    _run(
        [str(ffmpeg), "-y", "-i", str(music), "-i", str(voice),
         "-filter_complex",
         f"[0:a][1:a]sidechaincompress=threshold={threshold:.5f}:ratio={ratio}:"
         f"attack={attack}:release={release}[ducked]",
         "-map", "[ducked]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
         str(output)],
        "music ducking",
    )
    return output


def _mix_voice_and_music(voice: Path | None, music: Path | None, work: Path,
                         ffmpeg: Path, duration: float | None) -> Path | None:
    if voice and music:
        output = work / "base_mixed.wav"
        _run(
            [str(ffmpeg), "-y", "-i", str(voice), "-i", str(music),
             "-filter_complex",
             "[0:a][1:a]amix=inputs=2:duration=longest:normalize=0,"
             "alimiter=limit=0.89[out]",
             "-map", "[out]", "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
             str(output)],
            "voice and music mix",
        )
        return output
    if voice:
        return voice
    if music:
        return music
    return None


def _synth_source(preset: str, freq: float, duration: float) -> tuple[str, str]:
    if preset in ("tone", "sine"):
        lavfi = f"sine=frequency={freq}:duration={duration:.4f}:sample_rate=48000"
        fade_out = max(0.0, duration - 0.04)
        return lavfi, f"afade=t=in:st=0:d=0.005,afade=t=out:st={fade_out:.4f}:d=0.04"
    if preset == "keystroke":
        lavfi = (
            f"anoisesrc=color=white:duration={duration:.4f}:"
            "amplitude=0.6:sample_rate=48000"
        )
        fade = duration * 0.5
        return lavfi, f"highpass=f=1800,lowpass=f=7000,afade=t=out:st={fade:.4f}:d={fade:.4f}"
    lavfi = (
        f"anoisesrc=color=pink:duration={duration:.4f}:"
        "amplitude=0.4:sample_rate=48000"
    )
    return lavfi, "anull"


def _cue_filter(cue: dict[str, Any], source: dict[str, Any], fps: float) -> str:
    gain = float(cue.get("gain_db", 0))
    pan = float(cue.get("pan", 0))
    duration = audio_spec.cue_length_seconds(cue, fps)
    delay_ms = round(audio_spec.cue_time_seconds(cue, fps) * 1000)
    parts = [f"volume={gain}dB"]
    if duration:
        parts.append(f"atrim=0:{duration:.4f}")
        parts.append("asetpts=PTS-STARTPTS")
    if pan == 0:
        parts.append("aformat=channel_layouts=stereo")
    else:
        angle = (pan + 1) * math.pi / 4
        left, right = math.cos(angle), math.sin(angle)
        parts.append("aformat=channel_layouts=mono")
        parts.append(f"pan=stereo|c0={left:.4f}*c0|c1={right:.4f}*c0")
    if delay_ms > 0:
        parts.append(f"adelay={delay_ms}|{delay_ms}")
    parts.append("aresample=48000")
    return ",".join(parts)


def _prepare_cue(cue: dict[str, Any], source: dict[str, Any], index: int,
                 spec: dict[str, Any], work: Path, ffmpeg: Path) -> Path:
    output = work / f"cue_{index:03d}.wav"
    filter_chain = _cue_filter(cue, source, spec["fps"])

    if source["type"] == "synth":
        duration = float(source["duration_s"])
        lavfi, extra = _synth_source(source["preset"], float(source["freq_hz"]), duration)
        chain = f"{extra},{filter_chain}" if extra != "anull" else filter_chain
        _run(
            [str(ffmpeg), "-y", "-f", "lavfi", "-i", lavfi,
             "-af", chain, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le",
             str(output)],
            f"synth cue {cue['cue_id']}",
        )
        return output

    path = source["path"]
    duration = audio_spec.cue_length_seconds(cue, spec["fps"])
    source_args = ["-i", path]
    if source.get("loop") and duration:
        source_args = ["-stream_loop", "-1", *source_args, "-t", f"{duration:.4f}"]
    _run(
        [str(ffmpeg), "-y", *source_args, "-af", filter_chain,
         "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(output)],
        f"cue {cue['cue_id']}",
    )
    return output


def _mix_cues(base: Path | None, cues: list[Path], work: Path, ffmpeg: Path,
              duration: float | None) -> Path:
    if not cues:
        if base is None:
            raise audio_spec.AudioSpecError("nothing to mix: add voice, music, or sfx cues")
        return base

    inputs = ([base] if base else []) + cues
    output = work / "mix.wav"
    streams = "".join(f"[{i}:a]" for i in range(len(inputs)))
    filter_complex = (
        f"{streams}amix=inputs={len(inputs)}:duration=longest:normalize=0,"
        "alimiter=limit=0.89[out]"
    )
    trim = ["-t", f"{duration:.3f}"] if duration else []
    command: list[str] = [str(ffmpeg), "-y"]
    for item in inputs:
        command += ["-i", str(item)]
    command += ["-filter_complex", filter_complex, "-map", "[out]", *trim,
                "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(output)]
    _run(command, "sfx mix")
    return output


def _measure_loudnorm(path: Path, ffmpeg: Path, target: dict[str, Any]) -> dict[str, Any] | None:
    result = subprocess.run(
        [str(ffmpeg), "-hide_banner", "-nostats", "-i", str(path),
         "-af", f"loudnorm=I={target['target_lufs']}:TP={target['true_peak_db']}:"
                f"LRA={target['lra']}:print_format=json",
         "-f", "null", "-"],
        capture_output=True, text=True, check=False,
    )
    stderr = result.stderr or ""
    start, end = stderr.find("{"), stderr.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(stderr[start:end + 1])
    except json.JSONDecodeError:
        return None


def _normalize(path: Path, work: Path, ffmpeg: Path,
               target: dict[str, Any]) -> tuple[Path, dict[str, Any] | None, bool]:
    measured = _measure_loudnorm(path, ffmpeg, target)
    output = work / "mix_normalized.wav"
    if not measured or measured.get("input_i") in (None, "-inf", "inf"):
        _run(
            [str(ffmpeg), "-y", "-i", str(path), "-af", "alimiter=limit=0.89",
             "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(output)],
            "fallback limiter",
        )
        return output, measured, False

    chain = (
        f"loudnorm=I={target['target_lufs']}:TP={target['true_peak_db']}:"
        f"LRA={target['lra']}:measured_I={measured['input_i']}:"
        f"measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}:"
        f"measured_thresh={measured['input_thresh']}:offset={measured.get('target_offset', 0)}:"
        "linear=true:print_format=json"
    )
    result = subprocess.run(
        [str(ffmpeg), "-y", "-i", str(path), "-af", chain,
         "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(output)],
        capture_output=True, text=True, check=False,
    )
    if result.returncode != 0:
        _run(
            [str(ffmpeg), "-y", "-i", str(path), "-af", "alimiter=limit=0.89",
             "-ar", "48000", "-ac", "2", "-c:a", "pcm_s16le", str(output)],
            "fallback limiter",
        )
        return output, measured, False
    return output, measured, True


def normalize_audio(path: str | Path, work: str | Path, target: dict[str, Any],
                    ffmpeg: Path | None = None) -> tuple[Path, dict[str, Any] | None, bool]:
    ffmpeg = ffmpeg or audio_spec.resolve_ffmpeg()
    return _normalize(Path(path), Path(work), ffmpeg, target)


def _mux(video: Path | None, audio: Path, output: Path, ffmpeg: Path) -> None:
    suffix = output.suffix.lower()
    output.parent.mkdir(parents=True, exist_ok=True)
    if suffix == ".wav":
        shutil.copyfile(audio, output)
        return
    if suffix == ".mp3":
        _run(
            [str(ffmpeg), "-y", "-i", str(audio), "-c:a", "libmp3lame",
             "-b:a", "192k", str(output)],
            "mp3 encode",
        )
        return
    if video is None:
        raise audio_spec.AudioSpecError("mp4 output requires video")
    _run(
        [str(ffmpeg), "-y", "-i", str(video), "-i", str(audio),
         "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac",
         "-b:a", "192k", "-shortest", str(output)],
        "video mux",
    )


def build_mix(spec: dict[str, Any], out_path: str | None = None,
              work_dir: str | None = None, keep_work: bool = False) -> dict[str, Any]:
    ffmpeg = audio_spec.resolve_ffmpeg()
    ffprobe = audio_spec.resolve_ffprobe()

    video = audio_spec.resolve_path(spec, spec["video"]) if spec.get("video") else None
    if video and not video.is_file():
        raise audio_spec.AudioSpecError(f"video not found: {video}")

    duration = _probe_duration(video, ffmpeg, ffprobe) if video else None
    voice_path = audio_spec.resolve_path(spec, spec["voice_track"]) if spec.get("voice_track") and spec["voice_track"] != "@video" else None
    if duration is None and voice_path and voice_path.is_file():
        duration = _probe_duration(voice_path, ffmpeg, ffprobe)
    if duration is None:
        last = max(
            (audio_spec.cue_time_seconds(c, spec["fps"]) + (audio_spec.cue_length_seconds(c, spec["fps"]) or 0)
             for c in spec.get("sfx_cues", [])),
            default=0.0,
        )
        duration = last + 0.5 if last else None

    work = Path(work_dir).expanduser().resolve() if work_dir else Path(tempfile.mkdtemp(prefix="nhilos-audio-"))
    work.mkdir(parents=True, exist_ok=True)

    try:
        voice = _prepare_voice(spec, work, ffmpeg, ffprobe, duration)
        music = _prepare_music(spec, work, ffmpeg, duration)
        if music and voice and spec.get("music_bed", {}).get("ducking", True):
            music = _duck_music(music, voice, work, ffmpeg,
                                spec.get("music_bed", {}).get("ducking") or {})
        base = _mix_voice_and_music(voice, music, work, ffmpeg, duration)

        cue_files = [
            _prepare_cue(cue, audio_spec.resolve_cue_source(spec, cue), index, spec, work, ffmpeg)
            for index, cue in enumerate(spec.get("sfx_cues", []))
        ]
        mix = _mix_cues(base, cue_files, work, ffmpeg, duration)

        output = Path(out_path).expanduser().resolve() if out_path else None
        if output is None:
            configured = spec.get("output")
            if configured:
                output = audio_spec.resolve_path(spec, configured)
            elif video:
                output = video.with_name(f"{video.stem}_mixed.mp4")
            else:
                output = work / "mix_output.wav"

        normalize_target = dict(spec["loudness"])
        if output.suffix.lower() in {".mp4", ".mov", ".m4a", ".mp3"}:
            normalize_target["true_peak_db"] = float(normalize_target["true_peak_db"]) - 0.5
        normalized, measured, linear = _normalize(mix, work, ffmpeg, normalize_target)
        _mux(video, normalized, output, ffmpeg)

        try:
            from scripts.audio.qa import measure_loudness
        except ImportError:
            from .qa import measure_loudness
        after = measure_loudness(output, ffmpeg)

        return {
            "output": str(output),
            "mix": str(mix),
            "normalized": str(normalized),
            "linear_loudnorm": linear,
            "voice": str(voice) if voice else None,
            "music": str(music) if music else None,
            "cues": len(cue_files),
            "duration_s": duration,
            "loudnorm_before": measured,
            "loudness_after": after,
            "target": spec["loudness"],
            "normalize_target": normalize_target,
            "work_dir": str(work),
        }
    finally:
        if not keep_work and not work_dir:
            shutil.rmtree(work, ignore_errors=True)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("spec", help="path to audio_execution_spec JSON")
    parser.add_argument("--root", help="base directory for relative paths (default: cwd)")
    parser.add_argument("--out", help="output media path")
    parser.add_argument("--work-dir", help="keep intermediate files in this directory")
    parser.add_argument("--keep-work", action="store_true", help="keep temporary files")
    parser.add_argument("--json", action="store_true", help="print JSON")
    args = parser.parse_args(argv)

    try:
        spec = audio_spec.load_spec(args.spec, args.root)
        result = build_mix(spec, args.out, args.work_dir, args.keep_work)
        if args.json:
            print(json.dumps(result, indent=2, ensure_ascii=False))
        else:
            after = result["loudness_after"]
            print(f"wrote {result['output']}")
            print(f"cues: {result['cues']} · loudness: {after.get('integrated_lufs')} LUFS · "
                  f"peak: {after.get('true_peak_dbfs')} dBFS · LRA: {after.get('lra_lu')} LU")
        return 0
    except (audio_spec.AudioSpecError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
