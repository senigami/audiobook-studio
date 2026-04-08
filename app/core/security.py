"""Request and filesystem validation helpers for Studio 2.0."""


def validate_safe_identifier(*, value: str, field_name: str) -> str:
    """Describe strict identifier validation before persistence or path use.

    Args:
        value: Raw identifier value from requests, persistence, or uploads.
        field_name: Field label used for error reporting.

    Returns:
        str: Validated identifier value.

    Raises:
        NotImplementedError: Phase 1 scaffold only.
    """
    _ = (value, field_name)
    raise NotImplementedError
