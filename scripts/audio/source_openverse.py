#!/usr/bin/env python3
"""Source CC0/PDM audio from Openverse into a local, license-audited library."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

API_URL = "https://api.openverse.org/v1/audio/"
USER_AGENT = "NHILOS-Audio/1.0 (+https://nhilos.com)"
ALLOWED_LICENSES = {"cc0", "pdm"}
AUDIO_SUFFIXES = {".mp3", ".wav", ".ogg", ".m4a", ".flac", ".opus"}


class OpenverseError(RuntimeError):
    """Raised when Openverse search or download cannot complete."""


def _request(url: str, *, timeout: int = 60, retries: int = 4,
             accept: str = "application/json") -> bytes:
    headers = {"User-Agent": USER_AGENT, "Accept": accept}
    delay = 2.0
    last_error: Exception | None = None
    for attempt in range(retries + 1):
        request = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            last_error = exc
            if exc.code not in (429, 500, 502, 503, 504) or attempt >= retries:
                body = exc.read().decode("utf-8", errors="replace")[:300]
                raise OpenverseError(f"HTTP {exc.code} for {url}: {body}") from exc
            retry_after = exc.headers.get("Retry-After")
            wait = float(retry_after) if retry_after and retry_after.isdigit() else delay
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = exc
            if attempt >= retries:
                raise OpenverseError(f"network error for {url}: {exc}") from exc
            time.sleep(delay)
        delay *= 2
    raise OpenverseError(f"request failed for {url}: {last_error}")


def search(query: str, licenses: tuple[str, ...] = ("cc0", "pdm"),
           page_size: int = 20, page: int = 1) -> dict[str, Any]:
    if not query.strip():
        raise OpenverseError("query must be non-empty")
    invalid = set(licenses) - ALLOWED_LICENSES
    if invalid:
        raise OpenverseError(f"licenses not allowed: {', '.join(sorted(invalid))}")
    params = urllib.parse.urlencode({
        "q": query,
        "license": ",".join(licenses),
        "page_size": page_size,
        "page": page,
    })
    payload = _request(f"{API_URL}?{params}")
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as exc:
        raise OpenverseError("Openverse returned invalid JSON") from exc
    results = [
        item for item in data.get("results", [])
        if item.get("license") in ALLOWED_LICENSES and item.get("url")
    ]
    return {"count": data.get("result_count", len(results)), "results": results}


def _safe_slug(value: str, fallback: str = "asset") -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return (slug or fallback)[:60]


def _load_manifest(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {"schema_version": 1, "generated_at": None, "assets": []}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise OpenverseError(f"invalid manifest: {path}") from exc
    if isinstance(data, list):
        return {"schema_version": 1, "generated_at": None, "assets": data}
    if not isinstance(data, dict) or not isinstance(data.get("assets"), list):
        raise OpenverseError(f"manifest must contain an assets array: {path}")
    return data


def _save_manifest(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    data["generated_at"] = datetime.now(timezone.utc).isoformat()
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def _upsert(assets: list[dict[str, Any]], entry: dict[str, Any]) -> None:
    for index, existing in enumerate(assets):
        if existing.get("id") == entry.get("id"):
            assets[index] = {**existing, **entry}
            return
    assets.append(entry)


def _download(url: str, destination: Path) -> tuple[str, int]:
    payload = _request(url, accept="audio/*,application/octet-stream")
    if not (
        payload.startswith((b"ID3", b"RIFF", b"OggS", b"fLaC"))
        or payload[:1] == b"\xff"
        or payload[4:8] == b"ftyp"
    ):
        raise OpenverseError(f"downloaded content is not audio: {url}")
    digest = hashlib.sha256(payload).hexdigest()
    if destination.is_file() and hashlib.sha256(destination.read_bytes()).hexdigest() == digest:
        return digest, destination.stat().st_size
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    temporary.write_bytes(payload)
    temporary.replace(destination)
    return digest, len(payload)


def fetch(query: str, role: str | None, limit: int, out_dir: str | Path,
          manifest_path: str | Path, licenses: tuple[str, ...] = ("cc0", "pdm"),
          delay: float = 3.0, dry_run: bool = False) -> dict[str, Any]:
    out = Path(out_dir).expanduser().resolve()
    manifest_file = Path(manifest_path).expanduser().resolve()
    manifest = _load_manifest(manifest_file)
    assets = manifest["assets"]
    role_dir = out / role if role else out

    collected: list[dict[str, Any]] = []
    page = 1
    while len(collected) < limit:
        page_size = min(20, max(limit - len(collected), 5))
        data = search(query, licenses, page_size=page_size, page=page)
        results = data["results"]
        if not results:
            break
        for result in results:
            if len(collected) >= limit:
                break
            title = result.get("title") or "asset"
            asset_id = result.get("id") or hashlib.sha256(title.encode()).hexdigest()[:12]
            suffix = "." + (result.get("filetype") or "mp3").lower()
            if suffix not in AUDIO_SUFFIXES:
                suffix = ".mp3"
            filename = f"{_safe_slug(title)}-{asset_id[:8]}{suffix}"
            destination = role_dir / filename
            entry = {
                "id": asset_id,
                "title": title,
                "creator": result.get("creator"),
                "license": result.get("license"),
                "license_version": result.get("license_version"),
                "license_url": result.get("license_url"),
                "provider": result.get("provider"),
                "source": result.get("foreign_landing_url"),
                "download_url": result.get("url"),
                "duration_ms": result.get("duration"),
                "role": role,
                "query": query,
                "path": os.path.relpath(destination, manifest_file.parent),
                "downloaded_at": datetime.now(timezone.utc).isoformat(),
            }
            if dry_run:
                entry["sha256"] = None
                entry["bytes"] = None
            else:
                digest, size = _download(result["url"], destination)
                entry["sha256"] = digest
                entry["bytes"] = size
                _upsert(assets, entry)
            collected.append(entry)
            print(
                f"{'[dry] ' if dry_run else ''}{entry['path']}  "
                f"{entry['license']}  {entry['creator']}  {entry['title']}",
                file=sys.stderr,
            )
        page += 1
        if delay and len(collected) < limit:
            time.sleep(delay)

    if not dry_run:
        _save_manifest(manifest_file, manifest)
    return {
        "query": query,
        "role": role,
        "requested": limit,
        "downloaded": len(collected),
        "manifest": str(manifest_file),
        "assets": collected,
    }


def index(root: str | Path, manifest_path: str | Path) -> dict[str, Any]:
    source_root = Path(root).expanduser().resolve()
    manifest_file = Path(manifest_path).expanduser().resolve()
    manifest = _load_manifest(manifest_file)
    known = {entry.get("path") for entry in manifest["assets"]}
    added: list[dict[str, Any]] = []
    for path in sorted(source_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in AUDIO_SUFFIXES:
            continue
        relative = os.path.relpath(path, manifest_file.parent)
        if relative in known:
            continue
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        entry = {
            "id": f"local-{digest[:12]}",
            "title": path.stem,
            "creator": None,
            "license": "unknown",
            "license_url": None,
            "provider": "local",
            "source": None,
            "download_url": None,
            "role": path.parent.name if path.parent != source_root else None,
            "query": None,
            "path": relative,
            "sha256": digest,
            "bytes": path.stat().st_size,
            "downloaded_at": None,
        }
        manifest["assets"].append(entry)
        added.append(entry)
    _save_manifest(manifest_file, manifest)
    return {"manifest": str(manifest_file), "added": len(added), "assets": len(manifest["assets"])}


def _licenses(value: str) -> tuple[str, ...]:
    licenses = tuple(item.strip().lower() for item in value.split(",") if item.strip())
    invalid = set(licenses) - ALLOWED_LICENSES
    if invalid:
        raise argparse.ArgumentTypeError(f"only cc0 and pdm are allowed: {', '.join(sorted(invalid))}")
    return licenses


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    search_parser = sub.add_parser("search", help="list Openverse results without downloading")
    search_parser.add_argument("--query", required=True)
    search_parser.add_argument("--limit", type=int, default=10)
    search_parser.add_argument("--license", type=_licenses, default=("cc0", "pdm"))
    search_parser.add_argument("--json", action="store_true")

    fetch_parser = sub.add_parser("fetch", help="download licensed audio into the local library")
    fetch_parser.add_argument("--query", required=True)
    fetch_parser.add_argument("--role", default="sfx")
    fetch_parser.add_argument("--limit", type=int, default=5)
    fetch_parser.add_argument("--out", default="assets/sfx")
    fetch_parser.add_argument("--manifest", default="assets/sfx/licenses.json")
    fetch_parser.add_argument("--license", type=_licenses, default=("cc0", "pdm"))
    fetch_parser.add_argument("--delay", type=float, default=3.0)
    fetch_parser.add_argument("--dry-run", action="store_true")

    index_parser = sub.add_parser("index", help="index existing local audio into the manifest")
    index_parser.add_argument("--root", default="assets/sfx")
    index_parser.add_argument("--manifest", default="assets/sfx/licenses.json")

    args = parser.parse_args(argv)
    try:
        if args.command == "search":
            data = search(args.query, args.license, page_size=min(20, max(args.limit, 1)))
            data["results"] = data["results"][: args.limit]
            if args.json:
                print(json.dumps(data, indent=2, ensure_ascii=False))
            else:
                for item in data["results"]:
                    print(f"{item.get('license'):4} {item.get('creator') or '-':24} {item.get('title')}")
            return 0
        if args.command == "fetch":
            result = fetch(args.query, args.role, args.limit, args.out, args.manifest,
                           args.license, args.delay, args.dry_run)
        else:
            result = index(args.root, args.manifest)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        return 0
    except OpenverseError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
