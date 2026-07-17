"""Deterministic AST-based import graph for the backend (map-code edge tool).

Walks app/ and tts_engines/*/plugin (excluding tests/), parses each .py file with
the stdlib `ast` module, and resolves `import x.y` / `from x.y import z`
statements to repo-relative module paths when they point at a mapped module.
Output: {module_path: [dep_module_path, ...]} plus the reverse graph.
"""
import ast
import json
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
ROOTS = ["app", "tts_engines"]

def is_mapped(path: Path) -> bool:
    parts = path.parts
    if "tests" in parts:
        return False
    if path.parts[0] == "tts_engines":
        # tts_engines/<name>/plugin/** or tts_engines/<name>/interface.py — skip tts_engines/<name>/tests
        return True
    return True

def module_to_path(mod: str) -> str | None:
    # mod like "app.orchestration.scheduler.cap_settings" -> app/orchestration/scheduler/cap_settings.py
    candidate = ROOT / (mod.replace(".", "/") + ".py")
    if candidate.exists():
        return str(candidate.relative_to(ROOT))
    candidate_init = ROOT / mod.replace(".", "/") / "__init__.py"
    if candidate_init.exists():
        return str(candidate_init.relative_to(ROOT))
    return None

files = []
for r in ROOTS:
    for p in (ROOT / r).rglob("*.py"):
        rel = p.relative_to(ROOT)
        if "tests" in rel.parts:
            continue
        if "__pycache__" in rel.parts:
            continue
        files.append(rel)

graph = {}
errors = []
for rel in files:
    key = str(rel)
    deps = set()
    try:
        src = (ROOT / rel).read_text(encoding="utf-8")
        tree = ast.parse(src, filename=key)
    except Exception as e:
        errors.append((key, str(e)))
        graph[key] = []
        continue
    pkg_parts = rel.parts[:-1]  # for resolving relative imports
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                p = module_to_path(alias.name)
                if p and p != key:
                    deps.add(p)
        elif isinstance(node, ast.ImportFrom):
            if node.level and node.level > 0:
                # relative import: resolve against package path
                base_parts = list(pkg_parts)
                for _ in range(node.level - 1):
                    if base_parts:
                        base_parts.pop()
                mod = ".".join(base_parts)
                if node.module:
                    mod = f"{mod}.{node.module}" if mod else node.module
                if mod:
                    p = module_to_path(mod)
                    if p and p != key:
                        deps.add(p)
            elif node.module:
                p = module_to_path(node.module)
                if p and p != key:
                    deps.add(p)
    graph[key] = sorted(deps)

reverse = {k: [] for k in graph}
for k, deps in graph.items():
    for d in deps:
        reverse.setdefault(d, []).append(k)
for k in reverse:
    reverse[k] = sorted(set(reverse[k]))

out = {"edges": graph, "reverse": reverse, "errors": errors, "file_count": len(files)}
print(json.dumps(out))
