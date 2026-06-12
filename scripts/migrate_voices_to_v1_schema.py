#!/usr/bin/env python3
"""Phase B migration: update voice.json files to the v1.0 bundle schema.

Migrates every ``voices/<Name>/voice.json`` file under the configured voices
directory.  Safe to re-run at any time (idempotent).

Changes made to each voice.json:
  - Adds ``spec``, ``spec_version``, ``taxonomy_version`` identity fields.
  - Drops the integer ``version`` field (superseded by ``spec_version``).
  - Moves ``default_variant`` to a sibling ``state.json`` file (D8).
  - Migrates ``labels[]`` → ``tags[]`` and drops ``labels`` (D6).
  - Copies ``preview_audio`` from the default variant's profile.json into
    ``samples[]`` (conditional — only when the field is present) (B1-f).
  - Does NOT write an ``attributes`` block (D7 — leave voices untagged).
  - Does NOT write an ``image`` field.

After migration, voices will:
  - Load via the lenient loader as "untagged" until a human tags them.
  - Fail strict ``python -m jsonschema`` validation (expected — by design).
  - Pass strict validation only after a user tags them via Voice Lab.

Usage:
    python scripts/migrate_voices_to_v1_schema.py [--voices-dir PATH]
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# Ensure the repo root is on sys.path so we can import app.*
# ---------------------------------------------------------------------------
_REPO_ROOT = Path(__file__).resolve().parents[1]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s  %(name)s  %(message)s",
)
logger = logging.getLogger("migrate_voices_to_v1_schema")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--voices-dir",
        type=Path,
        default=None,
        help="Path to the voices directory (defaults to the app-configured VOICES_DIR).",
    )
    args = parser.parse_args()

    from app.domain.voices.migration import migrate_voices_to_v1_schema
    from app.core.config import VOICES_DIR

    voices_dir: Path = args.voices_dir or VOICES_DIR
    logger.info("Migrating voices in: %s", voices_dir)

    ok = migrate_voices_to_v1_schema(voices_dir)
    if ok:
        logger.info("Migration complete.")
        return 0
    else:
        logger.error("Migration failed — check logs above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
