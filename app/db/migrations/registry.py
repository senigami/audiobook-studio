"""The ordered set of versioned schema migrations run at boot.

Empty today. #232 (chapter_segments redesign) is expected to add the
first real entry here — append a ``Migration(version=N, name=..., up=...)``
with the next unused version number; never renumber or reorder an
already-shipped entry (see ``design-docs/specs/data-model.md``).
"""
from app.db.migrations.runner import Migration

MIGRATIONS: list[Migration] = []
