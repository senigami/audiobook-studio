# Task 07 — Update s4/s5 import-cleanliness gates + new SDK cleanliness gate

Depends on 04, 05, 06. Boundary CONFIRMED by user at Checkpoint 2 (renegotiated boundary accepted,
incl. the context.py module-level-only exception) — unblocked.

## Changes
- `plugins/tts_xtts/tests/test_s4_import_cleanliness.py` and
  `plugins/tts_voxtral/tests/test_s5_import_cleanliness.py`: read them first
  (`sed -n 1,80p …`) — they currently import `app.studio_plugin_sdk` themselves (s4 lines 23, 27):
  repoint to `studio_plugin_sdk`. Encode the boundary from 00-overview.md exactly: zero app.* anywhere
  in server/core/interface.py/cli.py; zero module-level app.* in studio/. R1: temporarily reintroduce
  a module-level `import app.db` in a studio file and confirm the gate fails, then revert.
- NEW gate `tests/engines/test_sdk_import_cleanliness.py` (host suite): AST-walk `studio_plugin_sdk/`
  asserting zero module-level app.* imports anywhere, and zero app.* imports of ANY kind outside
  `context.py` (risk 4 in approach doc, adjusted for the context.py reality — see overview caveat).
- If a repo-wide AST gate exists (check `grep -rln "import ast" tests | head`), extend it instead of
  duplicating.

## Acceptance
- Gate tests fail on seeded violation (R1), pass clean; full suite parity; code-map queue entry.
