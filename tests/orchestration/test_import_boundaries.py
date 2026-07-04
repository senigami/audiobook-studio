"""Executable import-boundary tests for the orchestration <-> routers/engines edge.

Replaces the decorative ``INTENDED_UPSTREAM_CALLERS`` / ``INTENDED_DOWNSTREAM_DEPENDENCIES`` /
``FORBIDDEN_DIRECT_IMPORTS`` tuples that used to live in these modules (BE-2). Those tuples were
read nowhere; this test makes the same boundary intent enforced instead of documented.

See ``.agent/rules/modular_architecture.md``: orchestration owns job execution lifecycle and must
not depend on the legacy ``app.jobs`` worker loop, the raw queue DB module, or reach back into
routers/engines internals directly.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO_ROOT = Path(__file__).parents[2]

# module path -> import prefixes that module must never import directly.
GUARDED_MODULES: dict[str, tuple[str, ...]] = {
    "app/orchestration/scheduler/orchestrator.py": (
        "app.jobs.worker",
        "app.jobs.core",
        "app.db.queue",
    ),
    "app/engines/bridge_utils.py": (
        "app.api.routers",
        "app.db",
        "app.jobs",
    ),
}

# NOTE: app/orchestration/progress/service.py intentionally is NOT enforced here. Its former
# FORBIDDEN_DIRECT_IMPORTS tuple claimed it must never import app.api.routers/app.engines, but it
# already does (lazy, function-local imports of app.api.routers.voices_helpers and
# app.engines.behavior for voice-test title/CPS lookups). That's a pre-existing boundary drift,
# out of scope for BE-2 (documentation-cleanup only, no behavior change). Flagged as a comment in
# the module itself instead of silently enforced/wrongly-enforced here.

IMPORT_LINE_RE = re.compile(r"^\s*(?:from|import)\s+([\w.]+)")


def _imported_modules(source: str) -> list[str]:
    modules = []
    for line in source.splitlines():
        stripped = line.strip()
        if stripped.startswith("#"):
            continue
        match = IMPORT_LINE_RE.match(line)
        if match:
            modules.append(match.group(1))
    return modules


def test_orchestration_engine_boundary_modules_have_no_forbidden_imports():
    violations = []

    for rel_path, forbidden_prefixes in GUARDED_MODULES.items():
        file_path = REPO_ROOT / rel_path
        source = file_path.read_text(encoding="utf-8")
        imported = _imported_modules(source)

        for module in imported:
            for forbidden in forbidden_prefixes:
                if module == forbidden or module.startswith(forbidden + "."):
                    violations.append(f"{rel_path}: imports {module!r} (forbidden: {forbidden!r})")

    if violations:
        header = (
            "Architectural violation: orchestration/engine boundary modules must not import "
            "the legacy app.jobs worker loop, raw queue/db internals, or router modules directly.\n"
            "See .agent/rules/modular_architecture.md.\n"
        )
        assert False, header + "\n".join(violations)


def test_guarded_modules_exist():
    """Sanity check: fail loudly if a guarded path is renamed/moved instead of silently no-op-ing."""

    for rel_path in GUARDED_MODULES:
        assert (REPO_ROOT / rel_path).is_file(), f"expected guarded module at {rel_path}"
