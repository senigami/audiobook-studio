"""Unit tests for app.db.speaker_naming — pure string inference."""
import pytest
from app.db.speaker_naming import infer_variant_name, infer_speaker_name, is_default_profile_name, looks_like_uuid


class TestInferVariantName:
    def test_compound_name_extracts_variant(self):
        assert infer_variant_name("Dracula - Angry") == "Angry"

    def test_simple_name_returns_default(self):
        assert infer_variant_name("Dracula") == "Default"

    def test_compound_with_extra_spaces(self):
        assert infer_variant_name("Dracula -  Angry ") == "Angry"

    def test_empty_suffix_returns_default(self):
        assert infer_variant_name("Dracula - ") == "Default"


class TestInferSpeakerName:
    def test_simple_name_unchanged(self):
        assert infer_speaker_name("Narrator") == "Narrator"

    def test_compound_default_strips_variant(self):
        assert infer_speaker_name("Dracula - Default") == "Dracula"

    def test_compound_non_default_strips_base(self):
        assert infer_speaker_name("Dracula - Angry") == "Dracula"

    def test_meta_variant_name_respected(self):
        assert infer_speaker_name("Dracula - Angry", {"variant_name": "Angry"}) == "Dracula"


class TestIsDefaultProfileName:
    def test_simple_name_is_default(self):
        assert is_default_profile_name("Narrator") is True

    def test_compound_default_is_default(self):
        assert is_default_profile_name("Dracula - Default") is True

    def test_compound_non_default_is_not_default(self):
        assert is_default_profile_name("Dracula - Angry") is False

    def test_meta_overrides_infer(self):
        assert is_default_profile_name("Dracula - Angry", {"variant_name": "Default"}) is True


class TestLooksLikeUuid:
    def test_valid_uuid(self):
        assert looks_like_uuid("123e4567-e89b-12d3-a456-426614174000") is True

    def test_plain_name_is_not_uuid(self):
        assert looks_like_uuid("Dracula") is False

    def test_none_is_not_uuid(self):
        assert looks_like_uuid(None) is False

    def test_empty_string_is_not_uuid(self):
        assert looks_like_uuid("") is False
