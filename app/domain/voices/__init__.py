"""Voice domain for Studio 2.0.

Owns voice profiles, voice assets, preview/test behavior, and compatibility.
"""

# Import discipline note:
# - Prefer direct imports from concrete voice modules.
# - Keep package-level imports minimal so preview, compatibility, repository,
#   and service layers do not accidentally form eager-import chains.
