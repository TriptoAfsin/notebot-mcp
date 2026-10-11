#!/usr/bin/env python3
"""Check for and apply butex-notebot skill updates.

Usage:  python scripts/check_update.py [--force] [--check-only] [--quiet]

Prints one status line and always exits 0, so it can never break the task:
  UP_TO_DATE 1.0.0
  UPDATED 1.0.0 -> 1.1.0        (re-read SKILL.md)
  UPDATE_AVAILABLE 1.0.0 -> 1.1.0 (read-only install / --check-only)
  SKIPPED checked <24h ago
  OFFLINE <reason>
Standard library only.
"""

from __future__ import annotations

import io
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.request
import zipfile
from pathlib import Path

BASE = os.environ.get("BUTEX_NOTEBOT_URL", "https://ai.butexnotebot.com").rstrip("/")
VERSION_URL = f"{BASE}/skill/version.json"
SKILL_DIR = Path(__file__).resolve().parent.parent
STAMP = SKILL_DIR / ".last_update_check"
CHECK_EVERY = 24 * 3600
MARKER = re.compile(r"butex-notebot skill version:\s*([0-9]+(?:\.[0-9]+){0,2})")


def local_version() -> str:
    try:
        m = MARKER.search((SKILL_DIR / "SKILL.md").read_text(encoding="utf-8"))
        return m.group(1) if m else "0.0.0"
    except OSError:
        return "0.0.0"


def parse(v: str) -> tuple[int, ...]:
    return tuple(int(x) for x in (v.split(".") + ["0", "0"])[:3])


def get(url: str, timeout: float = 6) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "butex-notebot-skill-updater"})
    with urllib.request.urlopen(req, timeout=timeout) as r:  # noqa: S310 - fixed https host
        return r.read()


def recently_checked() -> bool:
    try:
        return time.time() - float(STAMP.read_text().strip()) < CHECK_EVERY
    except (OSError, ValueError):
        return False


def mark_checked() -> None:
    try:
        STAMP.write_text(str(time.time()))
    except OSError:
        pass  # read-only install (e.g. claude.ai sandbox) — fine


def apply(zip_bytes: bytes, expected: str) -> None:
    """Extract to a temp dir, validate, then swap files in. Old files are restored on failure."""
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as z:
        names = z.namelist()
        prefix = "butex-notebot/"
        if f"{prefix}SKILL.md" not in names:
            raise ValueError("package has no butex-notebot/SKILL.md")
        if any(n.startswith("/") or ".." in Path(n).parts for n in names):
            raise ValueError("unsafe paths in package")
        with tempfile.TemporaryDirectory() as tmp:
            z.extractall(tmp)
            new_dir = Path(tmp) / "butex-notebot"
            got = MARKER.search((new_dir / "SKILL.md").read_text(encoding="utf-8"))
            if not got or got.group(1) != expected:
                raise ValueError("package version does not match version.json")

            backup = Path(tempfile.mkdtemp(prefix="butex-notebot-backup-"))
            moved: list[str] = []
            try:
                for item in list(SKILL_DIR.iterdir()):
                    if item.name == STAMP.name:
                        continue
                    shutil.move(str(item), backup / item.name)
                    moved.append(item.name)
                for item in new_dir.iterdir():
                    dest = SKILL_DIR / item.name
                    if item.is_dir():
                        shutil.copytree(item, dest)
                    else:
                        shutil.copy2(item, dest)
            except Exception:
                for name in moved:
                    target = SKILL_DIR / name
                    if target.exists():
                        shutil.rmtree(target) if target.is_dir() else target.unlink()
                    shutil.move(str(backup / name), target)
                raise
            finally:
                shutil.rmtree(backup, ignore_errors=True)


def main() -> None:
    args = set(sys.argv[1:])
    quiet = "--quiet" in args
    current = local_version()

    def say(msg: str) -> None:
        if not quiet or not msg.startswith(("UP_TO_DATE", "SKIPPED")):
            print(msg)

    if "--force" not in args and recently_checked():
        say(f"SKIPPED checked <24h ago (local {current})")
        return

    try:
        info = json.loads(get(VERSION_URL))
        latest = str(info["version"])
    except Exception as e:  # network, DNS, sandbox egress block, bad JSON
        say(f"OFFLINE could not reach {VERSION_URL} ({type(e).__name__}); continuing with {current}")
        return

    mark_checked()
    if parse(latest) <= parse(current):
        say(f"UP_TO_DATE {current}")
        return

    notes = info.get("notes", "")
    if "--check-only" in args or not os.access(SKILL_DIR, os.W_OK):
        say(f"UPDATE_AVAILABLE {current} -> {latest}. {notes} Get it at {BASE}/#skill")
        return

    try:
        apply(get(info.get("zip") or f"{BASE}/skill/butex-notebot.zip", timeout=20), latest)
        say(f"UPDATED {current} -> {latest}. {notes} Re-read SKILL.md before continuing.")
    except Exception as e:
        say(f"UPDATE_AVAILABLE {current} -> {latest} (auto-update failed: {e}). Reinstall from {BASE}/#skill")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # absolutely never fail the calling task
        print(f"OFFLINE updater error: {e}")
