from pathlib import Path


def safe_basename(value: str) -> str:
    return Path(value).name


def safe_stem(value: str) -> str:
    return Path(safe_basename(value)).stem


def safe_join(root: Path, value: str) -> Path:
    """
    Join a user-controlled relative path to a trusted root and keep it contained.

    This preserves legitimate subdirectories under the root, while rejecting any
    attempt to escape via ".." segments or absolute paths.
    """
    root_resolved = root.resolve()
    candidate = (root_resolved / Path(value)).resolve()
    if not candidate.is_relative_to(root_resolved):
        raise ValueError(f"Path escapes root: {value}")
    return candidate


def safe_join_flat(root: Path, value: str) -> Path:
    """Join a value as a single filename under a trusted root."""
    return safe_join(root, safe_basename(value))
