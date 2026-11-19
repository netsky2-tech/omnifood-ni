#!/usr/bin/env python3
"""Optional Earshot adapter: local audio measurement and critique."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[3]))


def binary() -> Path | None:
    configured = os.environ.get("NHILOS_EARSHOT")
    if configured and Path(configured).is_file():
        return Path(configured).resolve()
    found = shutil.which("earshot")
    if found:
        return Path(found).resolve()
    local = Path.home() / ".local/opt/nhilos-audio/earshot/.venv/bin/earshot"
    if local.is_file():
        return local.resolve()
    return None


def available() -> bool:
    return binary() is not None


def _run(command: str, media: str | None = None, *extra: str) -> dict[str, Any]:
    executable = binary()
    if executable is None:
        return {
            "available": False,
            "error": "Earshot not installed; run scripts/audio/install_tools.sh --with-earshot",
        }
    args = [str(executable), command]
    if media:
        args.append(str(media))
    args.extend(extra)
    args.append("--json")
    result = subprocess.run(args, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        return {
            "available": True,
            "error": (result.stderr or result.stdout or "").strip().splitlines()[-1]
            if (result.stderr or result.stdout).strip() else f"earshot {command} failed",
        }
    stdout = (result.stdout or "").strip()
    start, end = stdout.find("{"), stdout.rfind("}")
    if start >= 0 and end > start:
        try:
            return {"available": True, "result": json.loads(stdout[start:end + 1])}
        except json.JSONDecodeError:
            pass
    return {"available": True, "raw": stdout}


def doctor() -> dict[str, Any]:
    executable = binary()
    if executable is None:
        return {
            "available": False,
            "error": "Earshot not installed; run scripts/audio/install_tools.sh --with-earshot",
        }
    result = subprocess.run(
        [str(executable), "doctor", "--json"], capture_output=True, text=True, check=False
    )
    return {
        "available": True,
        "path": str(executable),
        "returncode": result.returncode,
        "stdout": (result.stdout or "").strip(),
        "stderr": (result.stderr or "").strip(),
    }


def measure(media: str | Path) -> dict[str, Any]:
    return _run("measure", str(media))


def critique(media: str | Path) -> dict[str, Any]:
    return _run("critique", str(media))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["doctor", "measure", "critique"])
    parser.add_argument("media", nargs="?")
    args = parser.parse_args(argv)

    if args.command == "doctor":
        payload = doctor()
    elif args.command == "measure":
        if not args.media:
            parser.error("measure requires a media path")
        payload = measure(args.media)
    else:
        if not args.media:
            parser.error("critique requires a media path")
        payload = critique(args.media)

    print(json.dumps(payload, indent=2, ensure_ascii=False))
    return 0 if payload.get("available") and not payload.get("error") else 1


if __name__ == "__main__":
    raise SystemExit(main())
