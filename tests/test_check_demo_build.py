"""Tests for scripts/check_demo_build.py: the checks run against small temporary
build trees. Nothing is mocked and the forbidden strings are spelled out here on
purpose, not imported from the script."""
import importlib.util
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "check_demo_build.py"

ALLOW = ["logo.png", "demo-covers/a.jpg"]


def _load():
    spec = importlib.util.spec_from_file_location("check_demo_build", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _tree(tmp_path, js="console.log('tour')", extra=None, skip=None):
    out = tmp_path / "dist"
    shutil.rmtree(out, ignore_errors=True)
    (out / "assets").mkdir(parents=True)
    (out / "demo-covers").mkdir()
    (out / "index.html").write_text('<script src="./assets/app.js"></script>')
    (out / "assets" / "app.js").write_text(js)
    for rel in ALLOW:
        if rel != skip:
            (out / rel).write_bytes(b"x")
    for rel, body in (extra or {}).items():
        (out / rel).parent.mkdir(parents=True, exist_ok=True)
        (out / rel).write_text(body)
    return out


def test_clean_tree_has_no_problems(tmp_path):
    assert _load().scan_build(_tree(tmp_path), ALLOW) == []


def test_other_stage_code_is_flagged(tmp_path):
    for word in ("live-output", "voice-lab", "Queue fill"):
        problems = _load().scan_build(_tree(tmp_path, js=f"x='{word}'"), ALLOW)
        assert any(word in p for p in problems), word


def test_stage_index_and_styleguide_text_is_flagged(tmp_path):
    for word in ("Design Spec Sheet", "#/styleguide", "Choose a demo stage"):
        problems = _load().scan_build(_tree(tmp_path, js=f"x='{word}'"), ALLOW)
        assert any(word in p for p in problems), word


def test_root_absolute_asset_paths_are_flagged(tmp_path):
    for body in ('x="/demo-covers/a.jpg"', 'x="/textures/p.jpg"', 'x="/logo.png"'):
        problems = _load().scan_build(_tree(tmp_path, js=body), ALLOW)
        assert problems, body
    css = _tree(tmp_path, extra={"assets/app.css": "a{background:url(/textures/p.jpg)}"})
    assert _load().scan_build(css, ALLOW)


def test_relative_asset_paths_pass(tmp_path):
    out = _tree(tmp_path, js='x="./demo-covers/a.jpg"')
    assert _load().scan_build(out, ALLOW) == []


def test_file_outside_allowlist_is_flagged(tmp_path):
    out = _tree(tmp_path, extra={"favicon.ico": "x", "textures/fold arms.kra": "x"})
    problems = _load().scan_build(out, ALLOW)
    assert any("favicon.ico" in p for p in problems)
    assert any("fold arms.kra" in p for p in problems)


def test_missing_allowlisted_file_is_flagged(tmp_path):
    problems = _load().scan_build(_tree(tmp_path, skip="logo.png"), ALLOW)
    assert any("logo.png" in p and "missing" in p for p in problems)
