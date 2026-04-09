"""Pronunciation helpers for Studio 2.0."""

from __future__ import annotations


def build_pronunciation_overrides(*, raw_text: str, project_id: str | None = None) -> dict[str, str]:
    """Describe pronunciation override lookup for synthesis preparation.

    Args:
        raw_text: Text being prepared for synthesis.
        project_id: Optional project identifier for project-scoped overrides.

    Returns:
        dict[str, str]: Placeholder pronunciation override mapping.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (raw_text, project_id)
    raise NotImplementedError
