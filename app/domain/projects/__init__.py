"""Project domain for Studio 2.0.

Owns project lifecycle, project-level defaults, snapshots, and export intent.
"""

# Import discipline note:
# - Prefer direct imports from concrete project modules.
# - Keep this package lightweight to reduce future cycle risk as services,
#   snapshots, and exports gain real behavior.
