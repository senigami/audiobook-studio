# AD-2 reference — adversarial read of the `resolve_effective_cap` clamp chain

## Question restated

Hostile end-to-end read of cap resolution + admission: (a) silent-clamp UX bugs, (b) stale
default / gate mismatch between docs/lessons and `_engine_class_admission_enabled`, (c)
off-by-one or keying bugs in the per-engine-id semaphore (shared across chapters), (d) any
path where a requested cap setting has no observable effect.

## What I examined

- `app/orchestration/scheduler/cap_settings.py:56-156` — `DEFAULT_GLOBAL_CAP`,
  `get_global_parallel_cap`, `get_engine_caps`, `_coerce_engine_caps`, `resolve_effective_cap`.
- `app/orchestration/scheduler/resources.py:44-68` (global backstop const + admission gate),
  `169-330` (`EngineClassSemaphore.try_acquire`/`release`/`ensure_min_cap`), `336-429`
  (class + per-engine-id semaphore registries), `569-761` (`reserve_task_resources`),
  `764-799` (`release_task_resources`).
- `app/orchestration/tasks/synthesis.py:29-113` — `_manifest_resource_claim` (claim builder,
  incl. the fail-safe fallback).
- `app/orchestration/scheduler/orchestrator_helpers.py:1968-1990` — `_claim_to_dict`
  (confirms `engine_id`/`manifest_max` are propagated into claims).
- `.agent/lessons/INDEX.md:7` — the "default raised but gate still OFF" always-on lesson.
- `design-docs/plans/FUTURE_WORK.md:61-65` — "Settings UI silent-clamp warning".
- `app/api/routers/engines_registry.py:43-74` — the read-side surface that exposes
  `effective_cap` (relevant to whether the clamp is observable anywhere).

## Findings

### F1 — Silent clamp: confirmed, acknowledged, and silent even in logs
`app/orchestration/scheduler/cap_settings.py:148-156`.
Trigger: user sets `tts_parallel_cap` (or `tts_engine_caps[engine]`) above the engine's
manifest `max_concurrent_workers`, e.g. cap 8 on an engine declaring 2; or above the
process-wide backstop `MAX_GLOBAL_CONCURRENT_SYNTHESIS` (`resources.py:44-46`, default 8,
import-time env read).
Wrong outcome: `resolve_effective_cap` returns `max(1, min(requested, manifest_ceiling))`
with no log, no warning, no return signal distinguishing "clamped" from "honored". The
settings write succeeds; observed concurrency never changes. The backstop clamp is worse:
it isn't even in `resolve_effective_cap` — it bites later at `resources.py:676-690` as a
generic "denied" with a waiting_reason string the user never sees in Settings.
Mitigation that exists: `app/api/routers/engines_registry.py:65-74` does expose
`effective_cap` next to `manifest_max` per engine, so a UI *could* show the clamp — but
nothing warns at write time, matching `FUTURE_WORK.md:61-65`'s open item exactly.
Severity: low-medium (UX, known/accepted debt, not a correctness bug).
Confidence: high — demonstrable from code; the FUTURE_WORK entry corroborates it as
still-open.

### F2 — Stale always-on lesson: the admission gate now defaults ON; the lesson describes the pre-fix world
Code: `app/orchestration/scheduler/resources.py:49-68` —
`raw = os.environ.get("ENGINE_CLASS_ADMISSION", "").strip().lower(); return raw not in
{"0","false","no","off"}`. Unset ⇒ **enabled**. The docstring dates the flip to 2026-07-06
(owner directive), and the module header (`resources.py:14-18`) agrees ("Admission is on by
default").
Lesson: `.agent/lessons/INDEX.md:7` states the gate "still defaulted OFF … renders stayed
genuinely sequential regardless of the cap setting" — true as a 2026-07-06 incident
narrative, false as a description of current code. A reader applying the lesson literally
would conclude the cap setting is dead; it is not.
Wrong outcome: doc/lesson drift, not a code bug. The code is authoritative here; the lesson
is a dated snapshot of the bug that *motivated* the flip.
Severity: low (documentation), but exactly the trap the briefing asks about.
Confidence: high — the code default is unambiguous.

### F3 — Gate toggled mid-flight leaks semaphore slots (reserve/release read the env independently)
`resources.py:657-670` (reserve reads `_engine_class_admission_enabled()` per call) vs
`resources.py:783-785` (release re-reads it).
Trigger: `ENGINE_CLASS_ADMISSION` flips between a task's reserve and its release — the
docstring (`resources.py:65`) explicitly advertises per-call reads "so tests can toggle it
without re-importing", so this is a designed-in dynamic toggle, not a never-happens env.
- Flip ON→OFF while a task is running: reserve took the class semaphore + per-engine-id
  semaphore + `_global_cap_gate` (`resources.py:677`, `698-706`); release routes down the
  ships-dark branch (`:783-784`) and releases only `_exclusive_gate` — the class, engine-id,
  and **global backstop** slots leak permanently. Enough leaked tasks (8, the backstop cap)
  and every future synthesis is denied at `:677` until process restart / `reset()`.
- Flip OFF→ON: reserve held `_exclusive_gate`; release goes down the class path and never
  releases it — all ships-dark traffic wedges behind a phantom holder.
Wrong outcome: permanent slot leakage / wedged queue with no error, only debug logs.
Severity: medium (real deadlock mechanism; narrow trigger — env toggles are test-time or
operator action in a live process, and most deployments never flip it).
Confidence: high that the code path is as described (traced both branches); medium that it
matters in practice. Cheapest fix would be recording which path was taken in the
reservation result and releasing by that record, not by re-reading the env.

### F4 — Per-engine live limit is applied to the *shared class* semaphore, letting a sibling engine's activity deny an idle engine (latent keying bug)
`resources.py:698-699`: `sem = get_engine_semaphore(engine_class, cap);
sem.try_acquire(task_id, limit=live_limit)` — `live_limit` is
`resolve_effective_cap(engine_id, manifest_max)` (`:626-631`), i.e. a *per-engine* number,
but it is used as the admission threshold against the class semaphore's *total* active
count (`try_acquire` at `:226-227`: `effective = max(1, min(self._cap, limit)); if
len(self._active_ids) < effective`), where `_active_ids` mixes every engine in the class.
Trigger (latent): two engines resolve to the same class — e.g. a future GPU-class plugin B
(effective cap 1) beside XTTS (effective cap 3, 2 tasks active). B's claim hits the class
semaphore with `limit=1` while class active count is 2 ⇒ denied at the class gate even
though B's own per-engine-id semaphore (`:705-706`) is empty and the class structural cap
(grown to 3) has room. B is starved for as long as any sibling task is running; B's
requested/effective cap of 1 has, in that state, *no path to admission at all*.
Not live today: XTTS is the only "gpu" engine, and voxtral/mixed are both "cloud" at
manifest_max=1, where the wrong math coincides with the right answer (limit=1 == class
structural cap 1). The module's own comment block (`resources.py:380-396`) shows the
per-engine-id gate was added precisely to separate per-engine from per-class accounting —
this call re-couples them from the other direction (sibling inflation was fixed; sibling
*starvation* was introduced).
Severity: medium latent / none live. This is also the closest thing to the briefing's
"off-by-one or keying bug in the per-engine semaphore": the limit is keyed to the wrong
semaphore, not off by one.
Confidence: high on the mechanism (arithmetic is direct); high that it is not observable
with today's three engines.

### F5 — Clearing per-engine overrides via settings cannot override a set env var (no-effect path)
`cap_settings.py:94`: `if isinstance(raw, dict) and raw:` — an *empty* `tts_engine_caps`
dict in settings is treated as absent, falling through to the `TTS_ENGINE_CAPS` env var
(`:97-104`).
Trigger: operator launched with `TTS_ENGINE_CAPS='{"tts_xtts":1}'`, later clears the
override in Settings (stores `{}`) expecting the global cap to apply again.
Wrong outcome: the env override keeps winning; the settings change has no observable
effect. Violates the documented "settings-then-env precedence" (`cap_settings.py:25-29`)
for the delete/clear case. Same shape, smaller, at `:72-77`: a malformed
`tts_parallel_cap` value in settings silently falls through to env/default rather than
erroring — a stored-but-ignored setting.
Severity: low (requires the env var to be in use; `state_settings` normalization makes the
global-cap variant mostly theoretical, per `cap_settings.py:31-37`).
Confidence: high on code behavior; medium on real-world reachability.

### F6 — Sound axes (what I could NOT break)
- **Clamp arithmetic**: `resolve_effective_cap` (`cap_settings.py:148-156`) — no off-by-one;
  `len(active) < effective` (`resources.py:227`) admits exactly `effective` tasks; floors
  (`max(1, …)`) are consistent everywhere. Sound.
- **Live-limit freshness (M7)**: the limit is re-resolved on every admission attempt
  (`resources.py:626-631`) and never mutates the semaphore (`:226`), so lowering a cap does
  gate *new* admissions without restart; the `try_acquire` docstring's race argument
  (`:209-213`) is correct — the comparison and grant are atomic under the lock. Sound,
  resting on the assumption that a lowered cap need not preempt in-flight tasks (it
  doesn't, by design — `ensure_min_cap` warns instead of shrinking, `:314-329`).
- **Per-engine-id keying across chapters**: the id-semaphore is keyed by `engine_id` only
  (`resources.py:420-423`) and task_ids are the members — sharing one engine's budget
  across chapters is the intended semantics, and release is idempotent (`:252-271`), so the
  documented double-release at `:709-719` is genuinely harmless. The set-based accounting
  does mean a second `try_acquire` with the *same* task_id is a free no-op admission
  (`set.add` dedups), but the orchestrator reserves once per task, and idempotent re-reserve
  after crash recovery is arguably desirable. No off-by-one found here.
- **Rollback path**: when the id-gate denies after the class gate admitted
  (`:707-719`), both the class slot and the global-backstop slot are released. Sound.

Strongest assumption the whole chain rests on: reserve and release for a given task see the
same value of `ENGINE_CLASS_ADMISSION` (F3 is exactly the failure of that assumption), and
one engine per engine-class (F4 is the failure of that one).

## Confidence summary

| Finding | Verdict | Confidence |
|---|---|---|
| F1 silent clamp (UX) | demonstrable, known debt | high |
| F2 stale lesson vs default-ON gate | demonstrable doc drift; code authoritative | high |
| F3 mid-flight gate toggle leaks slots | demonstrable code path; narrow trigger | high (mechanism) / medium (practical) |
| F4 per-engine limit applied to class semaphore | demonstrable latent starvation; not live today | high |
| F5 empty-dict settings can't clear env override | demonstrable; low reachability | high / medium |
| F6 arithmetic, freshness, keying, rollback | sound | high |

## Could not determine here

- Whether any test toggles `ENGINE_CLASS_ADMISSION` around a live reservation (would make
  F3 observable in CI rather than only in theory) — did not sweep the test suite.
- Whether the Settings UI already renders `engines_registry`'s `effective_cap` field
  (would partially mitigate F1) — backend surface exists; frontend usage unverified.
- Whether the orchestrator can ever call `reserve_task_resources` twice for one task_id
  without an intervening release (would make the set-dedup note in F6 load-bearing) — did
  not trace the orchestrator retry paths.
