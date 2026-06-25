# Test Quality Audit — tests/orchestration/ (full suite)

**Date:** 2026-06-11  
**Scope:** All files in `tests/orchestration/` — incremental audit extending the 2026-06-10 parts.  
**Auditor:** Claude Code (Sonnet 4.6)  
**Rubric:** design-docs/specs/testing-standards.md R1–R4  
**Prior art:** `test_audit_orchestration_part1.md` (a–l), `test_audit_orchestration_part2.md` (m–z)

---

## Overview

The 2026-06-10 audits (parts 1 and 2) covered all files thoroughly and deleted 9 vacuous/mocked-out tests.
This pass (2026-06-11) performed a sweep for:

- **R2 violations** — tests that mock the module they are named for, or mock internal state.
- **R4 violations** — real `time.sleep` / `asyncio.sleep` calls (not patched mocks).
- **Mocked-out smell** — assertions that can never fail because the mock returns what is asserted.

### R4 check results

| file | sleep usage | verdict |
|------|-------------|---------|
| test_submit.py | `patch("...time.sleep")` — the sleep is patched, not called | REAL |
| test_recover.py | comment only (`# no sleeps`) | REAL |
| all others | no sleep references | REAL |

No real sleep-based timing found in the suite.

### R2 check results

All mocks examined sit at legitimate boundaries (DB, WebSocket broadcast, subprocess/FFmpeg, TTS server HTTP client, `time.sleep` clock). No test mocks the module it is named for.

---

## Gap file: test_recovery_db_integration.py (not in prior audits)

This file was present in the directory but absent from both 2026-06-10 audit tables.

| test | class | classification | verdict | notes |
|------|-------|---------------|---------|-------|
| test_recoverable_contexts_found_for_running_job | — | REAL | sound | Real DB + real `load_recoverable_task_contexts()`; asserts the job appears in the result list |
| test_recoverable_contexts_found_for_queued_job | — | REAL | sound | Same path, queued status |
| test_recoverable_context_has_recovered_flag | — | REAL | sound | Asserts payload carries `_recovered=True` and `_recovered_from_status` — observable contract |
| test_recoverable_context_is_task_context_instance | — | REAL | sound | isinstance check on real return type |
| test_terminal_jobs_not_recovered | — | REAL | sound | Asserts done/failed IDs are absent from results |
| TestStartupRecovery::test_startup_recovery_resubmits_interrupted_task | TestStartupRecovery | REAL | sound | Mocks `TaskOrchestrator.submit` at the orchestrator class boundary (correct per R2 — the unit is `run_startup_recovery`) |
| TestStartupRecovery::test_startup_recovery_disabled_by_env_var | TestStartupRecovery | REAL | sound | Same boundary; asserts submit never called when env var is `0` |

**All 7 tests: sound.**

---

## Full suite summary (2026-06-11 state)

| verdict | count | note |
|---------|-------|------|
| sound | 227 | Pass; no R2/R4/mocked-out issues found |
| weak | 0 | — |
| mocked-out | 0 | All previously identified mocked-out tests were deleted in the 2026-06-10 audit pass |

**Deleted in prior audit passes (not counted above):** 9 tests total (vacuous pass-bodies, local-lambda testers, wrong-scenario scaling tests).

---

## Fixes applied this pass

None required. No sleep-based offenders, no self-mocking violations, and no mocked-out assertions remain after the 2026-06-10 cleanup.

---

## Run results

```
227 passed in 12.66s
ruff check tests/orchestration/  →  All checks passed!
```
