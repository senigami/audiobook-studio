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
# created_at is populated
# ---------------------------------------------------------------------------

def test_add_lexicon_entry_has_created_at(clean_storage):
    pid = create_project("TestProject")
    lexicon_mod.add_lexicon_entry(pid, "cat", "kitten")
    entries = _all_entries(pid)
    assert entries[0]["created_at"] is not None
    assert float(entries[0]["created_at"]) > 0
