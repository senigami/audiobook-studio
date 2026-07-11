"""Self-check for the 'no-import-side-effects' invariant (narrow slice):
flags module-level (import-time) Thread/Timer construction or `.start()`
calls under app/**, outside app/core/boot.py and any `if __name__ == "__main__"`
guard. Does not descend into function/class/lambda bodies (those only run
when called, not at import time). Does not attempt to catch listener
registration or global-settings mutation generically (those need broader
judgment) -- deliberately scoped to the mechanically-checkable subset.
Non-empty output = violation.
"""
import ast
import sys
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").resolve()
SUSPECT_CALLS = {"Thread", "Timer"}
NO_DESCEND = (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)

violations = []


def is_main_guard(node):
    if not isinstance(node, ast.If):
        return False
    test = node.test
    return isinstance(test, ast.Compare) and isinstance(test.left, ast.Name) and test.left.id == "__name__"


def check_call(sub, rel):
    func = sub.func
    name = func.attr if isinstance(func, ast.Attribute) else (func.id if isinstance(func, ast.Name) else None)
    if name == "start":
        violations.append(f"{rel}:{sub.lineno}: module-level .start() call")
    elif name in SUSPECT_CALLS:
        violations.append(f"{rel}:{sub.lineno}: module-level {name}(...) construction")


def walk_module_level(node, rel):
    """Visit statements that actually execute at import time -- never
    descending into function/async-function/lambda bodies. ClassDef bodies
    DO run at import time (they define the class), so those are visited too,
    but methods inside a class body are FunctionDefs and get skipped."""
    for child in ast.iter_child_nodes(node):
        if isinstance(child, NO_DESCEND):
            continue
        if isinstance(child, ast.Call):
            check_call(child, rel)
        walk_module_level(child, rel)


for path in (ROOT / "app").rglob("*.py"):
    rel = path.relative_to(ROOT)
    if "tests" in rel.parts or "__pycache__" in rel.parts:
        continue
    if rel == Path("app/core/boot.py"):
        continue
    try:
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(rel))
    except Exception:
        continue

    for node in tree.body:
        if is_main_guard(node):
            continue
        if isinstance(node, NO_DESCEND):
            continue
        if isinstance(node, ast.Call):
            check_call(node, rel)
        walk_module_level(node, rel)

print("\n".join(violations))
