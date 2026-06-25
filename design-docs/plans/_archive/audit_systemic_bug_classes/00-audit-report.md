# Audit Report — 2026-06-11

> **TL;DR:** The five fix commits of 2026-06-10/11 (`daedcfea`, `e106311a`, `92645e4b`,
> `a39b3a24`, `b88e13b8`) are not five independent bugs — they are four systemic design
> flaws each patched one call site at a time, and confirmed unfixed call sites of the same
> classes remain live. Highest-leverage move: land the four central fixes (Workload 1) so
> the classes die instead of the instances.

## Scope

Audited: the subsystems implicated by the recent fix-commit cluster — TTS server readiness
(`app/tts_server/`), bridge synthesis request construction (`app/jobs/handlers/`,
`plugins/*/plugin/studio/`), orchestrator post-success bookkeeping
(`app/orchestration/scheduler/orchestrator_helpers.py`), engine registry resolution
(`app/engines/voice_engines.py`), and live-event emission (`app/api/ws.py`,
`app/orchestration/progress/service.py`, `frontend/src/hooks/useSegmentHandoffQueue.ts`).

Method: the orchestrating model read the five fix commits and the load-bearing files
directly, formed the four bug-class hypotheses, then dispatched one Fable 5 Explore agent to
sweep for remaining instances of each class. All high-severity claims were verified against
source with `path:line` evidence before becoming tasks. Dimensions not run (UX, theming,
DRY-at-large, test inventory): out of scope for this targeted audit — the question was "why
do the same bugs keep coming back", not general code health.

## What's healthy

- Every recent fix landed with a revert-checked test (R1 discipline is genuinely followed).
- Commit messages are excellent forensic records; this diagnosis was possible because of them.
- The ownership split (orchestrator owns job lifecycle / watchdog owns process lifecycle /
  VoiceBridge owns routing) is sound. The bugs live in the seams, not the structure.
- Path-security helpers, the boot sequence, and the plugin manifest validation are in good shape.

## Findings by dimension

### Class 1 — settings-keyed engine readiness (context not centrally resolved)

`check_env()` may require persisted engine settings (Voxtral: Mistral API key), but every
call site must independently signature-inspect and `load_settings(plugin.plugin_dir)`. The
inspection helper is duplicated (`plugin_loader._check_env_accepts_settings` at
`app/tts_server/plugin_loader.py:37` vs `health._accepts_settings` at
`app/tts_server/health.py:70`), which is why new call sites keep regressing.

| ID | Severity | Location | Problem | Correction | Task |
|----|----------|----------|---------|------------|------|
| C1-a | major | `app/tts_server/server.py:413` | Post-pip-install recovery calls bare `check_env()`; settings-keyed engine stuck in needs_setup after dep install until restart | Use shared settings-aware helper | 001 |
| C1-b | major | `app/tts_server/plugin_loader.py:398` | Pip entry-point load path calls bare `check_env()`; settings-keyed pip plugin fails env check every boot | Use shared settings-aware helper | 001 |
| C1-c | minor | `app/engines/voice/base.py:113` | SDK docstring documents the bare-call pattern as the contract | Update docstring | 001 |

### Class 2 — `voice_profile_dir` not threaded through synthesis requests

`generate_via_bridge` (`app/jobs/handlers/bridge_helpers.py:12`) only includes
`voice_profile_dir` if the caller passes it, even though every caller passes `profile_name`
from which it is derivable via `app.db.speakers.get_profile_dir`. Plugin core never guesses
storage paths, so a missing dir fails reference-cloned voices deep in the engine.

| ID | Severity | Location | Problem | Correction | Task |
|----|----------|----------|---------|------------|------|
| C2-a | critical | `plugins/tts_xtts/plugin/studio/standard_handler.py:254-264, 266-276` | Both non-script XTTS render paths omit `voice_profile_dir` | Derive centrally in `generate_via_bridge` | 002 |
| C2-b | minor | `plugins/tts_xtts/plugin/studio/helpers.py:24-35` | `_generate_direct_xtts` — dead code with the same bare pattern, no callers | Delete | 002 |
| C2-c | major | `plugins/tts_xtts/plugin/server/engine.py:433-444` | Server-side engine silently imports `app.engines.voice_engines` as fallback — violates the SDK rule (`plugin-contract.md`: plugins must not import `app.*`) and masks C2-a | Delete fallback once 002 lands | 005 |

### Class 3 — post-success bookkeeping can flip a done job to failed

| ID | Severity | Location | Problem | Correction | Task |
|----|----------|----------|---------|------------|------|
| C3-a | critical | `app/orchestration/scheduler/orchestrator_helpers.py:141-296` | `record_render_stats_if_completed` runs ~155 lines (timing arithmetic on raw bridge-result values) *before* its try at :297; all three invocation sites (:880, :922, :945) convert an exception into `TaskResult(status="failed")` | Move the try to the top of the function body | 003 |
| C3-b | major | `app/jobs/handlers/bridge_helpers.py:66-69` | Post-success `update_job(synthesis_duration_seconds=…)` inside the synthesis try; a raise becomes `EngineBridgeError` → job failed despite audio produced | Isolate in its own swallow-and-log try | 003 |
| C3-c | major | `app/orchestration/tasks/api_synthesis.py:150-152` | Same pattern; except at :157-160 returns `failed` | Isolate | 003 |
| C3-d | major | `app/jobs/worker_metrics.py:75, 99-101` | `record_engine_sample` raises on missing duration, and the except at :99 logs "Rejected" then re-raises anyway — landmine armed for the next unwrapped caller | Log-and-return instead of raising | 003 |
| C3-e | minor | `app/orchestration/scheduler/orchestrator_helpers.py:948,951,953` | Leftover `print(f"[DEBUG] …")` in the bridge-dispatch except block | Remove | 003 |

### Class 4 — transient registry failure indistinguishable from "engine not registered"

| ID | Severity | Location | Problem | Correction | Task |
|----|----------|----------|---------|------------|------|
| C4-a | critical | `app/engines/voice_engines.py:12-26` | `_get_registry_manifests` returns `[]` on ANY exception (incl. watchdog restart of the TTS server); `normalize_tts_engine` then resolves valid persisted engines to `""` → mid-render `'Voice requests must include engine_id'` (via `plugins/synthesis_mixed/handler.py:225,403`) and shifted group boundaries → "No valid segment audio to stitch" | Last-known-good manifest cache served on transport failure | 004 |

### Class 5 — no event-ordering chokepoint

| ID | Severity | Location | Problem | Correction | Task |
|----|----------|----------|---------|------------|------|
| C5-a | major | `app/api/ws.py:315,380,429` vs `app/orchestration/progress/service.py:634` | `segments.progress` frames are emitted from five sites in two modules; the only "no frames after terminal" guard (`_should_emit`, service.py:634) covers one of them. Frontend `useSegmentHandoffQueue` keeps growing suppression rules (H7, H7-strengthened) to defend against frames the backend should never send | Per-job terminal latch at the `broadcast_job_updated` chokepoint, mirroring the `_should_emit` rule (requeue via `queued`/`preparing` stays allowed) | 006 |

## Plan reconciliation

- `design-docs/plans/final_release/09_logic_audit.md` and `design-docs/plans/final_release/audits/` predate this
  audit and cover general logic quality; nothing there contradicts these findings. This plan
  is additive and narrowly scoped to the recurring-bug classes.
- `design-docs/specs/progress-presentation.md` 1.3.0/1.3.1 (rules H7) documented the *frontend
  defense* for C5-a; task 006 adds the backend guarantee and keeps H7 as defense-in-depth —
  no spec contradiction, but `queue-jobs.md` (broadcast routing) and/or `live-events.md`
  must gain the ordering guarantee when 006 lands.
- The five fix commits themselves remain correct; no task reverts any of them.

## Open decisions for the owner

None. The one genuine fork (fix instances vs. fix classes) is resolved in favor of central
fixes, since instance-patching demonstrably did not converge.
