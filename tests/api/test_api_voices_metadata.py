"""Phase C endpoint tests — /api/voices metadata, search, casting, icon upload.

Covers acceptance criteria:
  C1 — GET /api/voices returns attributes, tags, description, languages, image
  C2 — PATCH /api/voices/{id}/metadata valid write persists; invalid enum → 422 with valid list
  C3 — GET /api/voices/search filters by attribute and free tag
  C4 — POST /api/voices/cast ranks by character brief; rejects unknown contract/card versions
  C5 — POST /api/voices/{id}/icon saves icon.png, updates voice.json
  D7 — untagged voices readable without error
  strict/lenient boundary — read (lenient) vs write (strict)
  provenance — read/write of the shared provenance field (voice.schema.json §provenance);
    decoupled from any HF importer, which will populate it separately in future work
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

    def test_valid_language_and_style_persist(self, voices_root, client):
        """G3: PATCH with valid language/style values persists them."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"attributes": {
                "class": "human", "gender": "masculine", "age": "senior",
                "language": ["english", "spanish"], "style": ["narration"],
            }},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["attributes"]["language"] == ["english", "spanish"]
        assert data["attributes"]["style"] == ["narration"]

    def test_invalid_language_returns_422_with_valid_values(self, voices_root, client):
        """G3: PATCH with an unknown language value → 422 listing valid values."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"attributes": {"language": ["klingon"]}},
        )
        assert resp.status_code == 422
        detail = json.dumps(resp.json())
        assert "klingon" in detail
        assert "english" in detail

    def test_invalid_style_returns_422_with_valid_values(self, voices_root, client):
        """G3: PATCH with an unknown style value → 422 listing valid values."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"attributes": {"style": ["underwater-basket-weaving"]}},
        )
        assert resp.status_code == 422
        detail = json.dumps(resp.json())
        assert "underwater-basket-weaving" in detail
        assert "narration" in detail


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

    def test_language_attribute_filter(self, voices_root, client):
        """G3: ?language=spanish filters by the language attribute facet."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", {
            **_gravel_road_manifest(),
            "attributes": {**_gravel_road_manifest()["attributes"], "language": ["english"]},
        })
        _make_voice(voices_root, "Bilingual Voice", {
            "spec_version": "1.0",
            "id": "bilingual-voice",
            "name": "Bilingual Voice",
            "languages": ["en-US", "es-ES"],
            "attributes": {
                "class": "human",
                "gender": "feminine",
                "age": "adult",
                "language": ["english", "spanish"],
            },
            "tags": [],
        })

        resp = client.get("/api/voices/search?language=spanish")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert "bilingual-voice" in ids
        assert "gravel-road" not in ids

    def test_style_attribute_filter(self, voices_root, client):
        """G3: ?style=educational filters by the style attribute facet."""
        voices_root.mkdir(exist_ok=True)
        self._setup(voices_root)
        _make_voice(voices_root, "Teacher Voice", {
            "spec_version": "1.0",
            "id": "teacher-voice",
            "name": "Teacher Voice",
            "languages": ["en-US"],
            "attributes": {
                "class": "human",
                "gender": "feminine",
                "age": "adult",
                "style": ["educational"],
            },
            "tags": [],
        })

        resp = client.get("/api/voices/search?style=educational")
        assert resp.status_code == 200
        ids = [v["id"] for v in resp.json()]
        assert ids == ["teacher-voice"]


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

class TestProvenance:
    """provenance is declared in voice.schema.json but was previously never read/written
    through the live metadata endpoints. These tests confirm it is now genuinely
    round-trippable via GET/PATCH, independent of any future HF importer."""

    def test_get_returns_provenance_when_present(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        manifest = _gravel_road_manifest()
        manifest["provenance"] = {
            "source": "recorded",
            "author": "steven",
            "consent_ack": True,
            "created_at": "2026-05-29T00:00:00Z",
        }
        _make_voice(voices_root, "Gravel Road", manifest)

        resp = client.get("/api/voices/gravel-road")
        assert resp.status_code == 200
        assert resp.json()["provenance"] == {
            "source": "recorded",
            "author": "steven",
            "consent_ack": True,
            "created_at": "2026-05-29T00:00:00Z",
        }

    def test_get_omits_provenance_when_absent(self, voices_root, client):
        """A voice with no provenance block still loads without error (no fabricated default)."""
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.get("/api/voices/gravel-road")
        assert resp.status_code == 200
        assert resp.json().get("provenance") is None

    def test_list_voices_includes_provenance(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        manifest = _gravel_road_manifest()
        manifest["provenance"] = {"source": "cloned"}
        _make_voice(voices_root, "Gravel Road", manifest)

        resp = client.get("/api/voices/")
        assert resp.status_code == 200
        assert resp.json()[0]["provenance"] == {"source": "cloned"}

    def test_search_result_includes_provenance(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        manifest = _gravel_road_manifest()
        manifest["provenance"] = {"source": "designed"}
        _make_voice(voices_root, "Gravel Road", manifest)

        resp = client.get("/api/voices/search?q=cowboy")
        assert resp.status_code == 200
        assert resp.json()[0]["provenance"] == {"source": "designed"}

    def test_patch_valid_provenance_persists(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"provenance": {"source": "imported", "author": "hf:some-namespace", "consent_ack": True}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["provenance"]["source"] == "imported"
        assert data["provenance"]["author"] == "hf:some-namespace"
        # persisted on disk?
        raw = json.loads((voices_root / "Gravel Road" / "voice.json").read_text())
        assert raw["provenance"]["source"] == "imported"

    def test_patch_invalid_source_returns_422(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"provenance": {"source": "alien-abduction"}},
        )
        assert resp.status_code == 422
        assert "alien-abduction" in json.dumps(resp.json())

    def test_patch_unknown_provenance_field_returns_422(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"provenance": {"hf_repo_id": "someone/some-voice"}},
        )
        assert resp.status_code == 422
        assert "hf_repo_id" in json.dumps(resp.json())

    def test_patch_provenance_does_not_clobber_other_fields(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"provenance": {"source": "recorded"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["description"] == "A weathered, low Southern drawl."
        assert data["attributes"]["class"] == "human"


class TestPatchSaveFailure:
    """A failed manifest write must not be reported as a 200 with stale data.

    ``save_voice_manifest`` returns ``False`` (rather than raising) on disk
    errors or a trusted-root violation. Before this fix, ``update_voice_metadata``
    ignored that return value and re-served the pre-write manifest under a
    success status.
    """

    def test_save_failure_returns_500_not_stale_200(self, voices_root, client, monkeypatch):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        monkeypatch.setattr(
            "app.domain.voices.manifest.save_voice_manifest",
            lambda voice_dir, manifest: False,
        )

        resp = client.patch(
            "/api/voices/gravel-road/metadata",
            json={"provenance": {"source": "recorded"}},
        )
        assert resp.status_code == 500

        # The on-disk manifest must be untouched by the failed write.
        raw = json.loads((voices_root / "Gravel Road" / "voice.json").read_text())
        assert "provenance" not in raw


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


# ---------------------------------------------------------------------------
# C5 — POST/GET /api/voices/{id}/icon
# ---------------------------------------------------------------------------

def _make_png_bytes(w: int, h: int) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (w, h), color=(200, 50, 50)).save(buf, format="PNG")
    return buf.getvalue()


class TestVoiceIcon:
    def test_upload_square_png_then_download_round_trips(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        upload = client.post(
            "/api/voices/gravel-road/icon",
            files={"file": ("icon.png", _make_png_bytes(512, 512), "image/png")},
        )
        assert upload.status_code == 200
        assert upload.json()["image"] == "icon.png"

        # voice.json persisted the image field.
        manifest = json.loads((voices_root / "Gravel Road" / "voice.json").read_text())
        assert manifest["image"] == "icon.png"

        # GET actually serves the uploaded bytes back (this route was
        # missing entirely before — every icon <img> 404'd silently).
        download = client.get("/api/voices/gravel-road/icon")
        assert download.status_code == 200
        assert download.headers["content-type"] == "image/png"
        assert len(download.content) > 0

    def test_upload_nonsquare_rejected_422(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.post(
            "/api/voices/gravel-road/icon",
            files={"file": ("icon.png", _make_png_bytes(400, 300), "image/png")},
        )
        assert resp.status_code == 422
        assert "square" in resp.json()["detail"].lower()

    def test_upload_unsupported_content_type_rejected_422(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.post(
            "/api/voices/gravel-road/icon",
            files={"file": ("icon.gif", b"not-really-a-gif", "image/gif")},
        )
        assert resp.status_code == 422

    def test_upload_unknown_voice_404(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)

        resp = client.post(
            "/api/voices/does-not-exist/icon",
            files={"file": ("icon.png", _make_png_bytes(256, 256), "image/png")},
        )
        assert resp.status_code == 404

    def test_download_before_any_upload_returns_404(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)
        _make_voice(voices_root, "Gravel Road", _gravel_road_manifest())

        resp = client.get("/api/voices/gravel-road/icon")
        assert resp.status_code == 404

    def test_download_unknown_voice_404(self, voices_root, client):
        voices_root.mkdir(exist_ok=True)

        resp = client.get("/api/voices/does-not-exist/icon")
        assert resp.status_code == 404
