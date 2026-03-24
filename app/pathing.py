import os
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
    base_dir = os.path.abspath(os.path.normpath(os.fspath(root)))
    fullpath = os.path.abspath(os.path.normpath(os.path.join(base_dir, value)))
    if not fullpath.startswith(base_dir + os.sep) and fullpath != base_dir:
        raise ValueError(f"Path escapes root: {value}")
    return Path(fullpath)


def safe_join_flat(root: Path, value: str) -> Path:
    """Join a value as a single filename under a trusted root."""
    safe_name = safe_basename(value)
    if value != safe_name or "/" in value or "\\" in value:
        raise ValueError(f"Path must be a single filename: {value}")
    return safe_join(root, safe_name)
