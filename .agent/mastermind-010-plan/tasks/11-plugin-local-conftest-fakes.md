# Task 11 — Plugin-local conftest + local fakes (tests runnable both in-tree and standalone)

Depends on 08, 09, 10.

## Verify FIRST
What root/parent conftest fixtures plugin tests consume:
`grep -rn "def fixture\|@pytest.fixture" conftest.py tests/conftest.py 2>/dev/null | head` and run
`pytest plugins/tts_xtts -q -p no:cacheprovider --rootdir=plugins/tts_xtts` to see what breaks
standalone (do NOT modify anything to run this).

## Changes
- NEW `plugins/tts_xtts/tests/conftest.py`, `plugins/tts_voxtral/tests/conftest.py`: local fixtures
  replacing root-conftest dependencies (tmp dirs, fake context, settings). R2: fakes only at the
  host boundary (StudioPluginContext, DB models) — never mock plugin internals.
- Replace `from app.db.models import Job` in plugin tests (xtts: test_xtts_lexicon, test_jobs_extended,
  test_handler, test_force_rerender; voxtral: test_voxtral_implementation ×3) with a local Job fake or
  SDK JobSpec — choose per test by which attributes are used
  (`grep -n "Job(" <file>`). Assertion changes → R1 revert-check each.
- Voxtral `plugin/studio/app_adapter.py` `from app.db.state import get_settings` (4×) is source, not
  tests — stays (fn-body host surface, task 06 rules).

## Acceptance
- `pytest plugins -q` parity; full suite parity.
- Standalone smoke: `cd plugins/tts_xtts && python -m pytest tests -q` collects without root conftest
  errors (import errors acceptable ONLY for app-host fn-body paths never executed — target: zero).
