#!/usr/bin/env python3
"""CI regression guard for the styling-separation plan (ST-4, task 018).

Scans ``frontend/src`` (excluding ``frontend/src/demo/`` and
``frontend/src/theme/tokens.css`` itself — that file legitimately defines the
hex/rgb source values every token points to) for two classes of regression:

  1. Hardcoded colors — a literal hex color (``#abc``/``#aabbcc``/``#aabbccdd``)
     or a literal ``rgb(``/``rgba(`` call (i.e. one that does NOT wrap a
     ``var(--...)`` channel reference, which is the established idiom for
     alpha-blended token colors, e.g. ``rgba(var(--accent-rgb), 0.08)``).
     Checked in every ``style={{...}}`` block across ``frontend/src``, in
     every rule of ``frontend/src/theme/components/*.css``, and in the 5
     co-located stylesheets this plan created (see ``COLOCATED_CSS_FILES``).
     NOT checked repo-wide across every ``.css`` file — other pre-existing
     stylesheets (e.g. ``ScriptView.css``) are out of this plan's scope and
     may contain violations this guard intentionally does not police; this
     is deliberately named-file scoped, not repo-wide, despite colors having
     no legitimate "close enough" case the way spacing does. Named CSS
     colors (``red``, ``white``) and ``hsl()``/``hsla()`` are also not
     detected — a known gap, not a claim of completeness.
  2. Raw px spacing regressions — a bare/quoted px number on a spacing
     property (``padding``/``margin``/``gap``/``top``/``left``/``right``/
     ``bottom`` and their per-side variants) that exactly equals one of the
     ``--space-N`` token pixel values (4/8/12/16/24/32/40/48). Checked only in
     ``style={{...}}`` blocks of the files task 018's plan (ST-3, "Workload
     C") converted from inline styles to classes — see ``CONVERTED_FILES``
     below. This check is intentionally NOT run repo-wide: a one-off audit
     during task 018 found ~136 pre-existing exact-px-match spacing literals
     in files this plan never touched, which would make a repo-wide check
     either impossibly noisy or require an out-of-scope rewrite.
     **Known gap:** this check only matches ``px`` literals, not the
     equivalent ``rem`` form (e.g. ``padding: '1rem'`` — the majority literal
     form this plan actually converted, at a 16px root) — a rem regression in
     one of the converted files will NOT be caught. Closing that gap requires
     either finishing the rem-vs-token reconciliation across the converted
     set or a curated allowlist for the many legitimate non-token rem
     one-offs (e.g. ``0.85rem``, ``1.25rem``) already present in those files;
     both are out of this task's scope — tracked as a follow-up, not silently
     claimed as covered.

Both checks respect a small, explicit ``ALLOWLIST`` of (file, exact stripped
line text) pairs for genuine one-offs that have no token equivalent (e.g. the
``.switch__knob`` white, which must render as literal white in both light and
dark theme — using ``var(--surface)`` would flip it dark). Every allowlist
entry is commented with its reason; loosening a regex to make a real
violation disappear is not an accepted way to keep this guard green — add a
narrow, justified allowlist entry instead.

Exit codes
----------
0 — no violations (after allowlist exclusions)
1 — one or more violations found

Usage::

    python scripts/check_hardcoded_styles.py
    python scripts/check_hardcoded_styles.py --src-dir /path/to/frontend/src
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# The 20 files task 018's plan (ST-3 / "Workload C", tasks 004-017) converted
# from inline `style={{...}}` to CSS classes. The raw-px spacing check is
# scoped to just these files — see the module docstring for why.
CONVERTED_FILES = [
    "pages/Book/studio/CastPalette.tsx",
    "pages/ProjectLibrary/ProjectLibraryPage.tsx",
    "pages/Voices/components/VoiceModals.tsx",
    "components/queue/GlobalQueue.tsx",
    "pages/ChapterEditor/components/ResyncPreviewModal.tsx",
    "pages/Engines/components/OfficialRegistryPanel.tsx",
    "pages/Voices/components/VariantEditor.tsx",
    "pages/Welcome/WelcomePage.tsx",
    "pages/Voices/components/ScriptEditor.tsx",
    "pages/LiveOutput/LiveOutputPage.tsx",
    "pages/Voices/components/MetadataEditorModal.tsx",
    "pages/Voices/components/metadata/IconUpload.tsx",
    "pages/Voices/components/metadata/ManySelect.tsx",
    "pages/Voices/components/metadata/OneSelect.tsx",
    "pages/Voices/components/metadata/TagsInput.tsx",
    "pages/Voices/components/metadata/chip.tsx",
    "pages/Engines/components/EngineCard.tsx",
    "pages/Engines/components/EngineCalibrationSection.tsx",
    "pages/Engines/components/EngineSettingsForm.tsx",
    "pages/Engines/components/EngineTestSample.tsx",
    "pages/Voices/components/VoicesTabHeader.tsx",
    "pages/Voices/components/SampleManager.tsx",
]

# Co-located stylesheets this plan created for a single-consumer component
# (as opposed to theme/components/*.css, which is checked by directory).
# Listed explicitly rather than scanning all *.css repo-wide, since a
# repo-wide scan would also hit pre-existing, out-of-scope CSS files with
# violations this plan never touched (e.g. ScriptView.css) — see the module
# docstring's scoping note.
COLOCATED_CSS_FILES = [
    "components/queue/GlobalQueue.css",
    "pages/Engines/components/EngineCard.css",
    "pages/LiveOutput/LiveOutputPage.css",
    "pages/ProjectLibrary/ProjectLibraryPage.css",
    "pages/Welcome/WelcomePage.css",
]

SPACE_TOKEN_PX = {4, 8, 12, 16, 24, 32, 40, 48}
SPACING_PROPS = [
    "padding", "margin", "gap", "top", "left", "right", "bottom", "inset",
    "marginTop", "marginBottom", "marginLeft", "marginRight",
    "paddingTop", "paddingBottom", "paddingLeft", "paddingRight",
]

HEX_COLOR_RE = re.compile(r"#[0-9a-fA-F]{3,8}\b")
LITERAL_RGB_RE = re.compile(r"\brgba?\(\s*\d")
# NOTE: the value is matched with a trailing ``\b`` rather than a ``\2``
# back-reference to the opening quote, so quoted CSS shorthand values like
# ``padding: '16px 8px'`` (where the first token is a spacing value but the
# quote does not close immediately after it) are still checked. Only the first
# px value of a shorthand is validated, which is sufficient to catch a
# token-exact regression.
SPACING_PROP_RE = re.compile(
    r"\b(" + "|".join(SPACING_PROPS) + r")\s*:\s*(['\"]?)(-?\d+(?:\.\d+)?)px\b"
)

ALLOW_TAG = "style-guard-allow"

# Genuine one-off literals with no token equivalent, found while building this
# guard. Matched by (file relative to frontend/src, exact stripped line text)
# so a future edit to the line re-triggers review rather than silently
# staying exempt forever.
ALLOWLIST: dict[str, set[str]] = {
    "theme/components/misc.css": {
        # Switch track resting-state backing (light/dark) — a neutral
        # black/white wash at low opacity, not a semantic color with a token.
        "background: rgba(0, 0, 0, .18);",
        "background: rgba(255, 255, 255, .18);",
        # Switch knob must render literal white in both themes — var(--surface)
        # flips dark in dark mode, which would make the knob invisible against
        # the (also dark) track.
        "background: #ffffff;",
        # Focus-ring halo blend (light/dark) — soft black/white glow behind
        # the accent outline, not a semantic color with a token.
        "box-shadow: 0 0 0 5px rgba(255, 255, 255, .55);",
        "box-shadow: 0 0 0 5px rgba(0, 0, 0, .5);",
        # form-input focus glow — alpha blend of the accent color computed by
        # hand (not the --accent-rgb channel var), kept literal per the
        # existing rgba(30, 79, 216) / rgba(107, 159, 255) light/dark pair.
        "box-shadow: 0 0 0 3px rgba(30, 79, 216, .12);",
        "box-shadow: 0 0 0 3px rgba(107, 159, 255, .15);",
        # SegmentRenderMonitor active-block pulse — a teal tint with no
        # matching token in the registry (registry has no teal family).
        "background: rgba(20, 184, 166, 0.22);",
        "background: rgba(45, 212, 191, 0.26);",
    },
    "theme/components/publish.css": {
        # Book-cover drop-shadow — a plain black shadow blend, not a semantic
        # color with a token.
        "filter: drop-shadow(0 12px 24px rgba(0, 0, 0, 0.2));",
    },
    "app/App.tsx": {
        # Pre-existing bug found while building this guard, out of this
        # task's scope to fix: `--danger` is not a defined token (the real
        # token is `--action-danger`), so this fallback hex is silently
        # load-bearing. Flagged in task 018's completion note; not fixed here.
        "border: '2px solid var(--danger, #d64545)',",
    },
    "pages/ProjectDetail/components/ProjectCard.tsx": {
        # Decorative glass-highlight / vignette / drop-shadow overlays on the
        # cover-photo card — arbitrary white/black alpha blends for a purely
        # visual compositing effect, not semantic colors with tokens.
        "background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, transparent 40%)',",
        "background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.1) 100%)',",
        "filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.2))',",
        "border: '1px solid rgba(255,255,255,0.2)'",
    },
}


# ---------------------------------------------------------------------------
# Style-block extraction (JS/TSX)
# ---------------------------------------------------------------------------

def _iter_style_blocks(text: str):
    """Yield (start_line_1_based, block_text) for every `style={{...}}` in text."""
    for m in re.finditer(r"style=\{\{", text):
        start = m.end() - 1  # index of the inner '{'
        depth = 1
        i = start + 1
        while i < len(text) and depth > 0:
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
            i += 1
        block = text[start:i]
        start_line = text.count("\n", 0, m.start()) + 1
        yield start_line, block


def _check_color_violations(rel_path: str, start_line: int, block: str, allowed: set[str]) -> list[str]:
    violations = []
    for offset, line in enumerate(block.split("\n")):
        if ALLOW_TAG in line:
            continue
        stripped = line.strip()
        if stripped in allowed:
            continue
        if HEX_COLOR_RE.search(line) or LITERAL_RGB_RE.search(line):
            lineno = start_line + offset
            violations.append(f"{rel_path}:{lineno}: hardcoded color literal — {stripped}")
    return violations


def _check_spacing_violations(rel_path: str, start_line: int, block: str, allowed: set[str]) -> list[str]:
    violations = []
    for offset, line in enumerate(block.split("\n")):
        if ALLOW_TAG in line:
            continue
        stripped = line.strip()
        if stripped in allowed:
            continue
        for pm in SPACING_PROP_RE.finditer(line):
            prop, _quote, num = pm.groups()
            try:
                val = float(num)
            except ValueError:
                continue
            if val in SPACE_TOKEN_PX and val != 0:
                lineno = start_line + offset
                violations.append(
                    f"{rel_path}:{lineno}: raw {val:g}px on '{prop}' exactly matches a "
                    f"--space-* token — use var(--space-*) — {stripped}"
                )
    return violations


def check_tsx_file(path: Path, src_dir: Path, allowlist: dict[str, set[str]], *, check_spacing: bool) -> list[str]:
    rel_path = str(path.relative_to(src_dir))
    text = path.read_text(encoding="utf-8")
    allowed = allowlist.get(rel_path, set())
    violations: list[str] = []
    for start_line, block in _iter_style_blocks(text):
        violations.extend(_check_color_violations(rel_path, start_line, block, allowed))
        if check_spacing:
            violations.extend(_check_spacing_violations(rel_path, start_line, block, allowed))
    return violations


# ---------------------------------------------------------------------------
# theme/components/*.css check (colors only — see module docstring)
# ---------------------------------------------------------------------------

def check_css_file(path: Path, src_dir: Path, allowlist: dict[str, set[str]]) -> list[str]:
    rel_path = str(path.relative_to(src_dir))
    allowed = allowlist.get(rel_path, set())
    violations: list[str] = []
    for lineno, line in enumerate(path.read_text(encoding="utf-8").split("\n"), start=1):
        if ALLOW_TAG in line:
            continue
        stripped = line.strip()
        if stripped in allowed:
            continue
        if HEX_COLOR_RE.search(line) or LITERAL_RGB_RE.search(line):
            violations.append(f"{rel_path}:{lineno}: hardcoded color literal — {stripped}")
    return violations


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def run(src_dir: Path) -> int:
    allowlist = ALLOWLIST
    violations: list[str] = []

    demo_dir = src_dir / "demo"
    tokens_css = src_dir / "theme" / "tokens.css"
    converted_set = set(CONVERTED_FILES)

    for path in sorted(src_dir.rglob("*")):
        if not path.is_file():
            continue
        if demo_dir in path.parents:
            continue
        if path == tokens_css:
            continue

        if path.suffix in (".tsx", ".ts", ".jsx"):
            rel_path = str(path.relative_to(src_dir))
            check_spacing = rel_path in converted_set
            violations.extend(
                check_tsx_file(path, src_dir, allowlist, check_spacing=check_spacing)
            )
        elif path.suffix == ".css" and (
            path.parent == src_dir / "theme" / "components"
            or str(path.relative_to(src_dir)) in COLOCATED_CSS_FILES
        ):
            violations.extend(check_css_file(path, src_dir, allowlist))

    if violations:
        print(f"FAIL: {len(violations)} hardcoded style violation(s) found:\n")
        for v in violations:
            print(f"  {v}")
        print(
            "\nEach violation is either a color literal not wrapped in var(--...) or a "
            "raw px spacing value that exactly matches a --space-* token. Use the matching "
            "design token instead. If this is a genuine one-off with no token equivalent, "
            "add a narrow ALLOWLIST entry in scripts/check_hardcoded_styles.py (with a reason "
            "comment) rather than loosening this script's regexes."
        )
        return 1

    print("OK: no hardcoded style violations found.")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--src-dir",
        type=Path,
        default=Path(__file__).parents[1] / "frontend" / "src",
        help="Path to frontend/src (default: repo root frontend/src)",
    )
    args = parser.parse_args()
    sys.exit(run(args.src_dir))


if __name__ == "__main__":
    main()
