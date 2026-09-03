"""The ordered set of versioned schema migrations run at boot.

#232 (chapter_segments render-block redesign) owns entries 1+. Append a
``Migration(version=N, name=..., up=...)`` with the next unused version
number; never renumber or reorder an already-shipped entry (see
``design-docs/specs/data-model.md``).
"""
from app.db.migrations.runner import Migration
from app.db.migrations.steps.render_block_foundations import (
    migrate_001_render_block_foundations,
)
from app.db.migrations.steps.render_block_collapse import (
    migrate_002_render_block_collapse,
)

MIGRATIONS: list[Migration] = [
    Migration(
        version=1,
        name="segment_render_block_foundations",
        up=migrate_001_render_block_foundations,
    ),
    Migration(
        version=2,
        name="segment_render_block_collapse",
        up=migrate_002_render_block_collapse,
    ),
]
