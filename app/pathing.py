from pathlib import Path


def safe_basename(value: str) -> str:
    return Path(value).name


def safe_stem(value: str) -> str:
    return Path(safe_basename(value)).stem


def safe_join(root: Path, value: str) -> Path:
    """
    Join a user-controlled filename to a trusted root and keep it contained.

    The basename normalization strips any embedded path segments before the
    containment check so callers can safely pass values that came from request
    data or stored job metadata.
    """
    root_resolved = root.resolve()
    candidate = (root_resolved / safe_basename(value)).resolve()
    if not candidate.is_relative_to(root_resolved):
        raise ValueError(f"Path escapes root: {value}")
    return candidate
