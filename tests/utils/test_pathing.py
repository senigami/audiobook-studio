"""Tests for app/utils/pathing.py — safe_basename hardening."""
import os
import pytest
from app.utils.pathing import safe_basename, safe_stem, contained_path


def test_safe_basename_normal():
    assert safe_basename("foo.txt") == "foo.txt"
    assert safe_basename("../../foo.txt") == "foo.txt"
    assert safe_basename("/tmp/evil.jpg") == "evil.jpg"


def test_safe_basename_raises_on_dotdot():
    with pytest.raises(ValueError):
        safe_basename("..")


def test_safe_basename_raises_on_dot():
    with pytest.raises(ValueError):
        safe_basename(".")


def test_safe_basename_raises_on_root_path():
    # "/" — Path("/").name is "" (empty)
    with pytest.raises(ValueError):
        safe_basename("/")


def test_safe_basename_raises_on_dot_slash():
    # "./" — Path("./").name is "" (empty)
    with pytest.raises(ValueError):
        safe_basename("./")


def test_safe_basename_raises_on_empty_string():
    with pytest.raises(ValueError):
        safe_basename("")


def test_safe_stem_normal():
    assert safe_stem("foo.txt") == "foo"
    assert safe_stem("../../foo.wav") == "foo"


# ---------------------------------------------------------------------------
# contained_path tests
# ---------------------------------------------------------------------------

def test_contained_path_normal_join():
    result = contained_path("/base/dir", "sub", "file.txt")
    assert str(result) == os.path.normpath("/base/dir/sub/file.txt")


def test_contained_path_exact_base():
    """Joining zero parts returns the base itself."""
    result = contained_path("/base/dir")
    assert str(result) == os.path.normpath("/base/dir")


def test_contained_path_single_file():
    result = contained_path("/voices", "Alice.wav")
    assert str(result) == os.path.normpath("/voices/Alice.wav")


def test_contained_path_escape_dotdot_raises():
    with pytest.raises(ValueError, match="escapes"):
        contained_path("/base/dir", "..", "evil.txt")


def test_contained_path_deep_escape_raises():
    with pytest.raises(ValueError, match="escapes"):
        contained_path("/base/dir", "../../etc/passwd")


def test_contained_path_absolute_part_escape_raises():
    with pytest.raises(ValueError, match="escapes"):
        contained_path("/base/dir", "/etc/passwd")


def test_contained_path_returns_path_object():
    from pathlib import Path
    result = contained_path("/base", "sub")
    assert isinstance(result, Path)
