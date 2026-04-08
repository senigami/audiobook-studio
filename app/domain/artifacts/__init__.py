"""Artifact domain for Studio 2.0.

Import discipline note:
- Prefer direct imports from concrete artifact modules.
- Keep this package lightweight so Phase 2+ implementations do not create
  accidental import cycles through package-level re-exports.
"""
