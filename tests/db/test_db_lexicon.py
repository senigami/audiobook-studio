"""DB CRUD tests for app.db.lexicon.

TDD: written before implementation. R1: must fail before code exists.
Uses the conftest session DB (DB_PATH env var points to a temp path).
"""

import pytest
from app.db.core import get_connection
from app.db.projects import create_project
from app.db import lexicon as lexicon_mod


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _all_entries(project_id: str):
    return lexicon_mod.get_lexicon(project_id)


# ---------------------------------------------------------------------------
# get_lexicon — empty
# ---------------------------------------------------------------------------

def test_get_lexicon_returns_empty_for_no_entries(clean_storage):
    pid = create_project("TestProject")
    entries = _all_entries(pid)
    assert entries == []


# ---------------------------------------------------------------------------
# add_lexicon_entry
# ---------------------------------------------------------------------------

def test_add_lexicon_entry_creates_entry(clean_storage):
    pid = create_project("TestProject")
    eid = lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    assert eid is not None
    entries = _all_entries(pid)
    assert len(entries) == 1
    assert entries[0]["word"] == "cat"
    assert entries[0]["replacement"] == "kitten"
    assert entries[0]["project_id"] == pid
    assert entries[0]["id"] == eid


def test_add_multiple_entries(clean_storage):
    pid = create_project("TestProject")
    lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    lexicon_mod.add_lexicon_entry(pid, "dog", "puppy")
    entries = _all_entries(pid)
    assert len(entries) == 2
    words = {e["word"] for e in entries}
    assert words == {"cat", "dog"}


def test_lexicon_isolated_per_project(clean_storage):
    pid1 = create_project("Project1")
    pid2 = create_project("Project2")
    lexicon_mod.add_lexicon_entry(pid1, "cat", "kitten")
    assert len(_all_entries(pid1)) == 1
    assert len(_all_entries(pid2)) == 0


def test_add_duplicate_word_case_insensitive_raises(clean_storage):
    """Two entries for the same word (any case) would chain unpredictably in
    apply_lexicon's sequential-substitution pass — reject the duplicate."""
    pid = create_project("TestProject")
    lexicon_mod.add_lexicon_entry(pid, "read", "red")
    with pytest.raises(ValueError):
        lexicon_mod.add_lexicon_entry(pid, "Read", "reed")
    # No second entry was created.
    entries = _all_entries(pid)
    assert len(entries) == 1
    assert entries[0]["word"] == "read"
    assert entries[0]["replacement"] == "red"


def test_add_duplicate_word_allowed_across_projects(clean_storage):
    pid1 = create_project("Project1")
    pid2 = create_project("Project2")
    lexicon_mod.add_lexicon_entry(pid1, "cat", "kitten")
    # Same word in a different project is not a duplicate.
    eid = lexicon_mod.add_lexicon_entry(pid2, "cat", "feline")
    assert eid is not None
    assert len(_all_entries(pid2)) == 1


# ---------------------------------------------------------------------------
# update_lexicon_entry
# ---------------------------------------------------------------------------

def test_update_lexicon_entry(clean_storage):
    pid = create_project("TestProject")
    eid = lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    ok = lexicon_mod.update_lexicon_entry(eid, word="feline", replacement="fluffy cat")
    assert ok is True
    entries = _all_entries(pid)
    assert entries[0]["word"] == "feline"
    assert entries[0]["replacement"] == "fluffy cat"


def test_update_lexicon_entry_word_only(clean_storage):
    pid = create_project("TestProject")
    eid = lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    lexicon_mod.update_lexicon_entry(eid, word="feline")
    entries = _all_entries(pid)
    assert entries[0]["word"] == "feline"
    assert entries[0]["replacement"] == "kitten"


def test_update_lexicon_entry_replacement_only(clean_storage):
    pid = create_project("TestProject")
    eid = lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    lexicon_mod.update_lexicon_entry(eid, replacement="pussycat")
    entries = _all_entries(pid)
    assert entries[0]["word"] == "cat"
    assert entries[0]["replacement"] == "pussycat"


def test_update_nonexistent_entry_returns_false(clean_storage):
    ok = lexicon_mod.update_lexicon_entry("nonexistent-id", word="x")
    assert ok is False


# ---------------------------------------------------------------------------
# delete_lexicon_entry
# ---------------------------------------------------------------------------

def test_delete_lexicon_entry(clean_storage):
    pid = create_project("TestProject")
    eid = lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    ok = lexicon_mod.delete_lexicon_entry(eid)
    assert ok is True
    assert len(_all_entries(pid)) == 0


def test_delete_nonexistent_entry_returns_false(clean_storage):
    ok = lexicon_mod.delete_lexicon_entry("nonexistent-id")
    assert ok is False


def test_delete_only_removes_target_entry(clean_storage):
    pid = create_project("TestProject")
    eid1 = lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    eid2 = lexicon_mod.add_lexicon_entry(pid, "dog", "puppy")
    lexicon_mod.delete_lexicon_entry(eid1)
    entries = _all_entries(pid)
    assert len(entries) == 1
    assert entries[0]["id"] == eid2


# ---------------------------------------------------------------------------
# created_at is populated and drives get_lexicon's ordering
# ---------------------------------------------------------------------------

def test_lexicon_entries_ordered_by_created_at(clean_storage, monkeypatch):
    """get_lexicon orders by created_at ASC (not insertion order) — insert
    entries with created_at monkeypatched out of natural insertion order and
    confirm the returned order follows the stored timestamps."""
    pid = create_project("TestProject")

    times = iter([100.0, 50.0, 75.0])
    monkeypatch.setattr(lexicon_mod.time, "time", lambda: next(times))

    eid_cat = lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")   # created_at=100.0
    eid_dog = lexicon_mod.add_lexicon_entry(pid, "dog", "puppy")    # created_at=50.0
    eid_bird = lexicon_mod.add_lexicon_entry(pid, "bird", "chirp")  # created_at=75.0

    entries = _all_entries(pid)
    assert [e["id"] for e in entries] == [eid_dog, eid_bird, eid_cat]
    assert [e["created_at"] for e in entries] == [50.0, 75.0, 100.0]
