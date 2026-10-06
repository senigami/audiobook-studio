#!/usr/bin/env python3
"""Builds the tour-only demo into a temp dir and checks the output.

Fails when the bundle contains code from the other demo stages, a root-absolute
asset path (breaks under a subpath), or a file outside the public allowlist.
Usage: python scripts/check_demo_build.py [--outdir DIR] [--no-build]
"""
import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALLOWLIST_FILE = ROOT / "frontend" / "demo-public-allowlist.json"

OTHER_STAGE_MARKERS = (
    "live-output",
    "voice-lab",
    "Queue fill",
    "Design Spec Sheet",
    "#/styleguide",
    "Choose a demo stage",
)
ROOT_ABSOLUTE = re.compile(r"""["'`(]/(demo-|textures|logo)""")
TEXT_SUFFIXES = {".js", ".css", ".html"}


def scan_build(outdir: Path, allowlist: list[str]) -> list[str]:
    problems: list[str] = []
    emitted = {p.relative_to(outdir).as_posix() for p in outdir.rglob("*") if p.is_file()}
    allowed = set(allowlist)

    for rel in sorted(emitted):
        if rel == "index.html" or rel.startswith("assets/") or rel in allowed:
            continue
        problems.append(f"unexpected file in the build: {rel}")
    for rel in sorted(allowed - emitted):
        problems.append(f"allowlisted file missing from the build: {rel}")

    for rel in sorted(emitted):
        path = outdir / rel
        if path.suffix not in TEXT_SUFFIXES:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if path.suffix == ".js":
            for marker in OTHER_STAGE_MARKERS:
                if marker in text:
                    problems.append(f"{rel}: contains other-stage marker {marker!r}")
        for match in ROOT_ABSOLUTE.finditer(text):
            start = max(0, match.start() - 20)
            problems.append(f"{rel}: root-absolute asset path near {text[start:match.end() + 20]!r}")
    return problems


def _size_kb(outdir: Path) -> int:
    return sum(p.stat().st_size for p in outdir.rglob("*") if p.is_file()) // 1024


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--outdir", type=Path, help="build here (default: a temp dir)")
    parser.add_argument("--no-build", action="store_true", help="scan --outdir as it is")
    args = parser.parse_args()

    outdir = args.outdir or Path(tempfile.mkdtemp(prefix="demo-build-"))
    if not args.no_build:
        subprocess.run(
            ["npm", "-C", str(ROOT / "frontend"), "run", "build:demo", "--",
             "--outDir", str(outdir), "--emptyOutDir"],
            check=True, timeout=300,
        )
    allowlist = json.loads(ALLOWLIST_FILE.read_text())
    problems = scan_build(outdir, allowlist)
    if problems:
        print("\n".join(problems))
        print(f"FAIL: {len(problems)} problem(s) in {outdir}")
        return 1
    print(f"OK: {outdir} ({_size_kb(outdir)} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
