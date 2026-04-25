import os
from pathlib import Path
from typing import Optional


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
    try:
        # 1. Normalize and resolve the root
        base_dir = root.resolve()
        # 2. Join and resolve the candidate
        # Path.joinpath handles absolute 'value' by ignoring 'base_dir'
        candidate = base_dir.joinpath(value).resolve()
        # 3. Prove containment via relative_to()
        candidate.relative_to(base_dir)
        return candidate
    except (ValueError, OSError, RuntimeError) as e:
        raise ValueError(f"Path escapes root or is invalid: {value}") from e


def safe_join_flat(root: Path, value: str) -> Path:
    """Join a value as a single filename under a trusted root."""
    safe_name = safe_basename(value)
    if value != safe_name or "/" in value or "\\" in value:
        raise ValueError(f"Path must be a single filename: {value}")
    return safe_join(root, safe_name)


def find_secure_file(directory: Path, filename: str) -> Optional[Path]:
    """Rule 8: Enumerate trusted root and match by entry.name for existing files."""
    try:
        if not directory.exists() or not directory.is_dir():
            return None
        # Rule 8: match by entry.name against iterdir() to prove existence in root
        for entry in directory.iterdir():
            if entry.is_file() and entry.name == filename:
                # Prove containment for the entry we just found
                base_dir = directory.resolve()
                res = entry.resolve()
                res.relative_to(base_dir)
                return res
    except (OSError, ValueError):
        pass
    return None


def secure_join_flat(root: Path, filename: str) -> Path:
    """Rule 9: Explicit containment pattern for a single filename."""
    if filename != os.path.basename(filename) or "/" in filename or "\\" in filename:
         raise ValueError(f"Invalid filename: {filename}")

    try:
        base_dir = root.resolve()
        candidate = base_dir.joinpath(filename).resolve()
        candidate.relative_to(base_dir)
        return candidate
    except (ValueError, OSError, RuntimeError) as e:
        raise ValueError(f"Path escapes root or is invalid: {filename}") from e
