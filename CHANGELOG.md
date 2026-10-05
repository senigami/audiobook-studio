# Changelog

Repo release versions for Audiobook Studio. One entry per cut, newest first.

This is the **release ledger**: what the whole repo was, at a version, on a date. It is not the
product narrative. `wiki/Changelog.md` is the user-facing story of what changed and why, written for
readers of the app rather than readers of the repo, and the two move independently on purpose.

A release version moves **only on the owner's explicit approval**. Component versions
(`package.json`, `frontend/package.json`, `pyproject.toml`, and every versioned contract: plugin
manifest, SDK, event envelope, voice bundle, casting card) bump continuously as their own content
changes and are allowed to disagree with this number and with each other. Treating a component bump
as if it advanced the repo's release is the mistake this file exists to prevent. The policy is stated
once in `CLAUDE.md` under "Versioning".

Cutting a release means three things happen together: an entry lands here, a `vX.Y.Z` git tag is
created, and any living "current state" document is refreshed to describe that release rather than an
unspecified "current".

## Unreleased

Nothing cut yet on the Studio 2.0 line. The newest tag in this repo is `v1.8.5`, which belongs to the
v1 line; `studio-2.0` has not had a release cut against it. Establishing the first v2 number is an
owner decision, not a default, and the component versions currently disagree about what it would be.

- Orchestration layer restored after a branch switch deleted it from disk. The reasoning is in
  this repo's decision log, which is local to a working copy and not part of a clone.
- Upgraded to skill-arsenal Release 1.1.0 conventions: record-driven closeout, tracked git hooks,
  permission-allowlist cleanup, review personas declared as a class.
