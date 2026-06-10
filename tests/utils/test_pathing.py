"""Tests for app/utils/pathing.py — safe_basename hardening."""
import pytest
from app.utils.pathing import safe_basename, safe_stem


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
