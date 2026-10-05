"""Trusted path helpers for Studio 2.0.

This module will eventually replace ad-hoc path construction with explicit
trusted-root helpers and CodeQL-friendly containment checks.
"""


def build_trusted_path(*, root_name: str, relative_path: str) -> str:
    """Describe safe path creation under a named trusted root.

    Args:
        root_name: Stable trusted-root identifier such as projects, library, or
            artifact_cache.
        relative_path: User- or DB-derived path component that must remain
            under the trusted root.

    Returns:
        str: Normalized absolute path under the trusted root.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (root_name, relative_path)
    raise NotImplementedError
