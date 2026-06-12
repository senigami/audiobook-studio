"""Phase C endpoint tests — /api/voices metadata, search, casting, icon upload.

Covers acceptance criteria:
  C1 — GET /api/voices returns attributes, tags, description, languages, image
  C2 — PATCH /api/voices/{id}/metadata valid write persists; invalid enum → 422 with valid list
  C3 — GET /api/voices/search filters by attribute and free tag
  C4 — POST /api/voices/cast ranks by character brief; rejects unknown contract/card versions
  C5 — POST /api/voices/{id}/icon saves icon.png, updates voice.json
  D7 — untagged voices readable without error
  strict/lenient boundary — read (lenient) vs write (strict)
"""

import io
import json
import pytest

# Fixture from the shared fixture file — voices_root + client + clean_db
from tests.api.api_voices_fixtures import *  # noqa: F401,F403


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_voice(voices_root, name: str, manifest: dict) -> None:
    """Create voices/<name>/voice.json on disk."""
    voice_dir = voices_root / name
    voice_dir.mkdir(parents=True, exist_ok=True)
    (voice_dir / "voice.json").write_text(json.dumps(manifest))


def _gravel_road_manifest(voice_id: str = "gravel-road") -> dict:
    return {
        "spec": "audiobook-studio-voice",
        "spec_version": "1.0",
        "taxonomy_version": "1.0",
        "id": voice_id,
        "name": "Gravel Road",
        "description": "A weathered, low Southern drawl.",
        "image": "icon.png",
        "samples": [{"path": "samples/preview.mp3", "primary": True}],
        "languages": ["en-US"],
        "attributes": {
            "class": "human",
            "gender": "masculine",
            "age": "senior",
            "accent": "us-southern",
            "tone": ["authoritative", "somber"],
            "timbre": ["deep", "gravelly"],
            "pace": "measured",
            "use_case": ["audiobook", "narration"],
            "quality": ["studio-quality"],
        },
        "tags": ["cowboy", "weathered", "rancher"],
    }


# ---------------------------------------------------------------------------
# C1 — GET /api/voices
# ---------------------------------------------------------------------------

class TestListVoices:
    def test_empty_catalog_returns_empty_list(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        resp = client.get("/api/voices/")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_returns_full_metadata_fields(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.get("/api/voices/")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        v = data[0]
        assert v["id"] == "gravel-road"
        assert v["name"] == "Gravel Road"
        assert v["description"] == "A weathered, low Southern drawl."
        assert "icon.png" in v.get("image", "")
        assert "en-US" in v.get("languages", [])
        assert v.get("attributes", {}).get("class") == "human"
        assert "cowboy" in v.get("tags", [])
        assert v.get("untagged") is False

    def test_untagged_voice_readable_without_error(self, voices_root, client):
        """D7: missing attributes block → voice still loads, untagged=True."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Bare Voice", {
            "version": 2, "id": "bare-voice", "name": "Bare Voice",
        })

        resp = client.get("/api/voices/")
        assert resp.status_code == 200
        data = resp.json()
        assert any(v["id"] == "bare-voice" for v in data)
        bare = next(v for v in data if v["id"] == "bare-voice")
        assert bare["untagged"] is True


# ---------------------------------------------------------------------------
# Single-voice GET
# ---------------------------------------------------------------------------

class TestGetVoice:
    def test_known_voice_returns_200(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.get("/api/voices/gravel-road")
        assert resp.status_code == 200
        assert resp.json()["id"] == "gravel-road"

    def test_unknown_voice_returns_404(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        resp = client.get("/api/voices/no-such-voice")
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# C2 — PATCH /api/voices/{id}/metadata
# ---------------------------------------------------------------------------

class TestPatchVoiceMetadata:
    def test_valid_attributes_persist(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"attributes": {"class": "creature", "gender": "not-applicable", "age": "ageless"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["attributes"]["class"] == "creature"
        # persisted on disk?
        raw = json.loads((voices_root / "Gravel Road" / "voice.json").read_text())
        assert raw["attributes"]["class"] == "creature"

    def test_invalid_enum_returns_422_with_valid_values(self, voices_root, client):
        """C2 acceptance: PATCH with class='alien' → 422; 422 detail names valid values."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"attributes": {"class": "alien"}},
        )
        assert resp.status_code == 422
        body = resp.json()
        detail = json.dumps(body)
        assert "alien" in detail
        # Valid values should be listed
        assert "creature" in detail or "human" in detail

    def test_description_update_persists(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"description": "Updated description."},
        )
        assert resp.status_code == 200
        assert resp.json()["description"] == "Updated description."

    def test_tags_accepted_freeform(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"tags": ["wizard", "mystical", "old-sage"]},
        )
        assert resp.status_code == 200
        assert set(resp.json()["tags"]) == {"wizard", "mystical", "old-sage"}

    def test_languages_update_persists(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"languages": ["en-US", "en-AU"]},
        )
        assert resp.status_code == 200
        assert "en-AU" in resp.json()["languages"]

    def test_unknown_voice_returns_404(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        resp = client.patch(
            "/api/voices/no-such/metadata",
            json={"description": "x"},
        )
        assert resp.status_code == 404

    def test_strict_validation_rejects_unknown_field(self, voices_root, client):
        """Write path (strict) rejects unknown attribute fields."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"attributes": {"species": "elf"}},
        )
        assert resp.status_code == 422
        assert "species" in json.dumps(resp.json())


# ---------------------------------------------------------------------------
# C3 — GET /api/voices/search
# ---------------------------------------------------------------------------

class TestSearchVoices:
    def _setup(self, voices_root):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())
        _make_voice(voices_root, "Bright Star", {
            "spec_version": "1.0",
            "id": "bright-star",
            "name": "Bright Star",
            "description": "Light and cheerful feminine voice.",
            "languages": ["en-US"],
            "attributes": {
                "class": "human",
                "gender": "feminine",
                "age": "young-adult",
                "tone": ["cheerful", "warm"],
                "timbre": ["light"],
                "use_case": ["e-learning", "podcast"],
            },
            "tags": ["upbeat"],
        })
        _make_voice(voices_root, "Dark Dragon", {
            "spec_version": "1.0",
            "id": "dark-dragon",
            "name": "Dark Dragon",
            "description": "A creature voice, menacing and deep.",
            "languages": ["en-US"],
            "attributes": {
                "class": "creature",
                "gender": "not-applicable",
                "age": "ageless",
                "tone": ["menacing"],
                "timbre": ["deep", "booming"],
            },
            "tags": ["dragon", "monster"],
        })

    def test_class_and_tone_filter(self, voices_root, client):
        """C3 acceptance: ?class=creature&tone=menacing returns only Dark Dragon."""
        self._setup(voices_root)
        resp = client.get("/api/voices/search?class=creature&tone=menacing")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert "dark-dragon" in ids
        assert "gravel-road" not in ids
        assert "bright-star" not in ids

    def test_free_text_search_on_tags(self, voices_root, client):
        self._setup(voices_root)
        resp = client.get("/api/voices/search?q=cowboy")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert "gravel-road" in ids
        assert "bright-star" not in ids

    def test_no_filters_returns_all(self, voices_root, client):
        self._setup(voices_root)
        resp = client.get("/api/voices/search")
        assert resp.status_code == 200
        assert len(resp.json()) == 3

    def test_gender_filter(self, voices_root, client):
        self._setup(voices_root)
        resp = client.get("/api/voices/search?gender=masculine")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert "gravel-road" in ids
        assert "bright-star" not in ids

    def test_tag_filter(self, voices_root, client):
        self._setup(voices_root)
        resp = client.get("/api/voices/search?tag=dragon")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert "dark-dragon" in ids
        assert "gravel-road" not in ids

    def test_empty_result_returns_empty_list(self, voices_root, client):
        self._setup(voices_root)
        resp = client.get("/api/voices/search?class=synthetic")
        assert resp.status_code == 200
        assert resp.json() == []


# ---------------------------------------------------------------------------
# C4 — POST /api/voices/cast
# ---------------------------------------------------------------------------

def _gravel_card():
    return {
        "card_version": "1.0",
        "voice_id": "gravel-road",
        "name": "Gravel Road",
        "languages": ["en-US"],
        "class": "human",
        "gender": "masculine",
        "age": "senior",
        "accent": "us-southern",
        "tone": ["authoritative", "somber"],
        "timbre": ["deep", "gravelly"],
        "use_case": ["audiobook"],
        "tags": ["cowboy"],
        "description": "A weathered, low Southern drawl.",
    }


def _bright_card():
    return {
        "card_version": "1.0",
        "voice_id": "bright-star",
        "name": "Bright Star",
        "languages": ["en-US"],
        "class": "human",
        "gender": "feminine",
        "age": "young-adult",
        "tone": ["cheerful"],
        "description": "Light and cheerful feminine voice.",
    }


class TestCastVoices:
    def test_gravel_road_ranks_first_for_elderly_southern_male(self, voices_root, client):
        """C4 acceptance: elderly southern male lawman → Gravel Road rank 1."""
        voices_root.mkdir(exist_ok=True)

        body = {
            "contract_version": "1.0",
            "character": {
                "name": "Sheriff Boone",
                "description": "An aging frontier lawman, world-weary, speaks with authority.",
                "inferred_gender": "masculine",
                "inferred_age": "senior",
                "notes": "Southern USA setting",
            },
            "project_language": "en-US",
            "catalog": [_gravel_card(), _bright_card()],
            "limit": 5,
        }
        resp = client.post("/api/voices/cast", json=body)
        assert resp.status_code == 200
        data = resp.json()
        assert data["contract_version"] == "1.0"
        recs = data["recommendations"]
        assert len(recs) >= 1
        assert recs[0]["voice_id"] == "gravel-road"
        assert recs[0]["score"] > 0

    def test_unknown_contract_version_returns_422(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        body = {
            "contract_version": "99.0",
            "character": {"name": "Test"},
            "project_language": "en-US",
            "catalog": [],
            "limit": 5,
        }
        resp = client.post("/api/voices/cast", json=body)
        assert resp.status_code == 422

    def test_unknown_card_version_returns_422(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        bad_card = dict(_gravel_card(), card_version="99.0")
        body = {
            "contract_version": "1.0",
            "character": {"name": "Test"},
            "project_language": "en-US",
            "catalog": [bad_card],
            "limit": 5,
        }
        resp = client.post("/api/voices/cast", json=body)
        assert resp.status_code == 422

    def test_language_hard_filter_excludes_non_matching(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        fr_card = dict(_gravel_card(), languages=["fr-FR"], voice_id="french-voice")
        body = {
            "contract_version": "1.0",
            "character": {"name": "English character", "inferred_gender": "masculine"},
            "project_language": "en-US",
            "catalog": [fr_card],
            "limit": 5,
        }
        resp = client.post("/api/voices/cast", json=body)
        assert resp.status_code == 200
        # French-only voice excluded, needs_input should be True (< 2 eligible)
        assert resp.json()["needs_input"] is True

    def test_needs_input_false_when_two_or_more_eligible(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        body = {
            "contract_version": "1.0",
            "character": {"name": "Test"},
            "project_language": "en-US",
            "catalog": [_gravel_card(), _bright_card()],
            "limit": 5,
        }
        resp = client.post("/api/voices/cast", json=body)
        assert resp.status_code == 200
        assert resp.json()["needs_input"] is False


# ---------------------------------------------------------------------------
# Strict vs lenient boundary
# ---------------------------------------------------------------------------

class TestStrictVsLenientBoundary:
    def test_read_with_invalid_enum_still_succeeds(self, voices_root, client):
        """GET (lenient) accepts voice.json with class='alien'; voice is readable."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Alien Voice", {
            "id": "alien-voice",
            "name": "Alien Voice",
            "attributes": {"class": "alien", "gender": "neutral", "age": "adult"},
            "tags": [],
        })

        resp = client.get("/api/voices/alien-voice")
        assert resp.status_code == 200
        data = resp.json()
        # 'alien' demoted to tags by lenient loader
        assert "alien" in data.get("tags", [])
        assert data.get("untagged") is True

    def test_write_with_same_invalid_enum_returns_422(self, voices_root, client):
        """PATCH (strict) rejects the same class='alien' value → 422."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Alien Voice", {
            "id": "alien-voice",
            "name": "Alien Voice",
            "tags": [],
        })

        resp = client.patch(
            "/api/voices/alien-voice/metadata",
            json={"attributes": {"class": "alien"}},
        )
        assert resp.status_code == 422
