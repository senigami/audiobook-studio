"""Shared cache primitives for Studio 2.0."""


def build_cache_key(*, namespace: str, identifier: str) -> str:
    """Describe deterministic cache-key generation for shared infra caches.

    Args:
        namespace: Cache namespace or subsystem name.
        identifier: Stable identifier within the namespace.

    Returns:
        str: Deterministic cache key.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (namespace, identifier)
    raise NotImplementedError
