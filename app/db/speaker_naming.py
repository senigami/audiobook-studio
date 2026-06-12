"""Speaker / variant name inference from profile names.

Extracted from app.db.speakers — pure string-logic helpers.
No I/O, no DB, no state.  speakers.py re-exports these for backward compat.
"""
from __future__ import annotations

import uuid
from typing import Any, Dict, Optional


def infer_variant_name(profile_name: str) -> str:
    """Return the variant portion of a compound profile name, or 'Default'."""
    if " - " in profile_name:
        variant = profile_name.split(" - ", 1)[1].strip()
        return variant or "Default"
    return "Default"


def infer_speaker_name(profile_name: str, meta: Optional[Dict[str, Any]] = None) -> str:
    """Return the base speaker name, stripping the variant suffix when appropriate."""
    meta = dict(meta or {})
    variant_name = str(meta.get("variant_name") or infer_variant_name(profile_name) or "Default").strip() or "Default"
    if " - " not in profile_name:
        return profile_name

    base_name, suffix = profile_name.split(" - ", 1)
    if variant_name == "Default" or suffix.strip() == variant_name:
        return base_name.strip() or profile_name
    return base_name.strip() or profile_name


def is_default_profile_name(profile_name: str, meta: Optional[Dict[str, Any]] = None) -> bool:
    """Return True when the profile represents the default variant of its speaker."""
    meta = dict(meta or {})
    variant_name = str(meta.get("variant_name") or infer_variant_name(profile_name) or "Default").strip() or "Default"
    return variant_name == "Default" or " - " not in profile_name


def looks_like_uuid(value: Optional[str]) -> bool:
    """Return True when *value* is a well-formed UUID string."""
    if not value or not isinstance(value, str):
        return False
    try:
        uuid.UUID(value)
        return True
    except (ValueError, TypeError, AttributeError):
        return False
