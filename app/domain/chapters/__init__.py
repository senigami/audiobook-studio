"""Chapter domain for Studio 2.0.

Owns chapter drafts, production blocks, segmentation, and render batching.
"""

# Import discipline note:
# - Prefer direct imports from concrete chapter modules.
# - Keep package-level imports minimal so draft, segmentation, and batching
#   logic can evolve without hidden eager-import coupling.
