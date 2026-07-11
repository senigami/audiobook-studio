# Mixed-Engine Model-Load Progress/ETA — Fused Root-Cause & Fix Proposal

> **TL;DR:** Studio already has the right *design* for excluding model-load time and showing a "preparing" state — but for **mixed** renders it silently no-ops. The linchpin is an **engine-id / timing-marker mismatch**: a mixed job runs as `engine_id="mixed"`, whose manifest declares no `timing_markers`, so marker parsing falls back to defaults that never match the active child engine's stdout (e.g. XTTS's unbracketed `"Loading XTTS model..."`). Model-load is therefore never recognized → its time leaks into synthesis-duration/ETA, and the per-segment frame is published as `running` (not preparing) with an ETA that never clears. The fix is **not** a global queue pause and **not** loading every model up front; it is: resolve markers per *active group engine*, suspend the per-group ETA clock during load (treating it as between-time), keep the durable job status monotonic while adding a per-group **phase** the UI reads as *Preparing…*, and make the orchestrator the sole metrics writer on a synthesis-only clock.

This proposal **fuses** three analyses: two prior plans (≈ Antigravity: backend timing + durable-status regression; ≈ Codex: per-group phase, ETA clearing, frontend threading) and an independent code-grounded RCA. Those prior plans have been deleted; all relevant decisions and reconciliation are captured below. Where they conflicted, the resolution and its reasoning are recorded below.

---

## Problem statement

Mixed-engine chapter synthesis groups a chapter's segments into render groups; different groups can use different engines. **Voxtral** (web/API) renders immediately. **XTTS** (local) must load its base model (~30–36 s cold) before its first group, and the warm model is evicted after ~300 s idle (`plugins/tts_xtts/settings_schema.json`, warm-worker path). Observed symptoms:

1. The chapter-segment progress bar is "confused about when to update" (jumps/animates during load).
2. The **segment bar shows "working" during the XTTS model-load window** while the queue appears to keep advancing.
3. **Model-load time pollutes render-duration capture / ETA** (calibration data shows synthesis time exceeding wall time — invalid).

**Owner's desired end state:** do *not* rely on loading all models up front (warm models evict, and future engines have their own lifecycles); instead **suspend the queue/ETA accounting during model load** (count it as between-group time, excluded from render-ETA duration capture), and show the segment bar as **Preparing**, not Working.

---

## Fused root cause (layered)

The behavior is the product of four independent layers. Layer 1 is the novel linchpin neither prior plan identified; it is verified against current code.

### Layer 1 — Engine-id / timing-marker mismatch (primary, verified)
A mixed job is dispatched with `engine_id="mixed"`. `plugins/tts_mixed/manifest.json` declares **no `behavior.timing_markers`**, so `get_timing_markers("mixed")` returns `DEFAULT_TIMING_MARKERS` ([app/engines/behavior.py:401](../../../../app/engines/behavior.py)), where `ENGINE_ACTIVITY_STARTED = ["[ENGINE_ACTIVITY_STARTED]"]`. XTTS prints the **unbracketed** `"Loading XTTS model..."` ([plugins/tts_xtts/plugin/core/xtts_inference.py:634](../../../../plugins/tts_xtts/plugin/core/xtts_inference.py)) — which only matches under the **XTTS** manifest's marker (`"Loading XTTS model..."`), never under `"mixed"`. So in the orchestrator's `log_listener`, `match_timing_marker("mixed", line)` never recognizes the load line → the `ENGINE_ACTIVITY_STARTED` branch never fires → `timing["engine_activity_started_at"]` / `model_load_seconds` are **never captured** for mixed ([app/orchestration/scheduler/orchestrator_helpers.py](../../../../app/orchestration/scheduler/orchestrator_helpers.py), marker resolution keyed once on the static job engine-id). **The existing load-exclusion design is correct but unreachable for mixed.**

### Layer 2 — Duration capture leaks the load window
With Layer 1 in place, load time is counted as synthesis time via two further paths:
- The mixed handler writes its **own** `synthesis_duration_seconds` measured as wall time around each `_render_segment` bridge call — **including** model load ([plugins/tts_mixed/handler.py](../../../../plugins/tts_mixed/handler.py) ~lines 365–369, 450). This value is later **preferred** by `_record_render_stats_inner` over the orchestrator's clock.
- At `SEGMENT_SAVED`, the orchestrator's duration falls back to the **announce** timestamp when engine confirmation is missed (`segment_starts.get(leader) or segment_announced.get(leader)`), folding the pre-render load window into render time.
Result: duplicate sample writes and `synthesis_duration_seconds > wall time` (Codex captured 63.05 s synthesis vs ~40.8 s wall) → inflated `seconds_per_char` → all future ETAs polluted ([app/db/performance.py](../../../../app/db/performance.py), `record_render_sample`).

### Layer 3 — Presentation: "running" + uncleared ETA, no per-segment "preparing"
- The orchestrator publishes the per-segment announce frame with `status="running"`, `active_segment_id=<sid>`, `reason_code="SEGMENT_PENDING"`, before any render clock exists ([orchestrator_helpers.py](../../../../app/orchestration/scheduler/orchestrator_helpers.py)). Per spec, `SEGMENT_PENDING` is **announcement-only** ([design-docs/specs/live-events.md:343](../../../specs/live-events.md)) and must not start pacing — implementation drift.
- A **null ETA does not clear** the prior ETA: `orchestrator_publish.py` persists `eta_seconds` only when non-null, so the queue/segment bar keeps animating the last positive ETA through the entire load window.
- **Frontend has no "preparing" tier at segment granularity.** `ScriptView` span vocabulary is only `rendering | queued | pending | rendered | idle`, and a span flips to `rendering` purely on `active_segment_id` *presence* — `reason_code` is ignored ([frontend/src/pages/Book/studio/useStudioChapter.ts](../../../../frontend/src/pages/Book/studio/useStudioChapter.ts), [frontend/src/pages/ChapterEditor/components/ScriptView.tsx](../../../../frontend/src/pages/ChapterEditor/components/ScriptView.tsx)). The chapter/job-level bar *does* have a `preparing`/`LOADING_MODEL` indeterminate state, but `ChapterHeader.tsx:561` drops `reasonCode`, and `predictiveProgressBarHelpers.ts:214` deliberately labels every indeterminate/preparing bar **"Working…"** with a synthetic 120 s lane.

### Layer 4 — Resource ownership (secondary)
Mixed tasks claim `ResourceClaim.none()` even when a child group uses the XTTS GPU ([app/orchestration/tasks/synthesis.py:88](../../../../app/orchestration/tasks/synthesis.py)). So during a mixed job's load/synthesis the scheduler can admit *other* GPU jobs — a genuine cross-job contention gap, distinct from the within-chapter presentation symptoms.

> **Reframe of "pause the queue":** within a mixed job the groups are already serialized — the handler loop is synchronously blocked during the bridge call ([handler.py](../../../../plugins/tts_mixed/handler.py) ~line 331). So the job's own groups do **not** advance during load; what "keeps going" is the **predictive ETA presentation**. The correct "pause" is therefore (a) **suspend the per-group ETA clock** + show Preparing (Layers 1–3), and (b) for *cross-job* contention, give mixed a real **resource claim** (Layer 4) — not a global queue freeze.

---

## Reconciliation of the two prior plans

| Question | `progress-fix` (Antigravity) | `preparing-state` + Codex RCA | Fused decision |
|---|---|---|---|
| Durable job status during load | **Regress** `running→preparing` via `allow_progress_regression` | Keep status **monotonic**; use a separate per-group **phase** | **Keep monotonic + per-group phase.** Regressing durable status violates the documented lifecycle (`queue-jobs.md`, `live-events.md`), risks other status consumers, and only *incidentally* suppresses pacing. Codex wins. |
| Why duration is polluted | Subsequent-segment loads fold into `synthesis_duration_seconds` after `render_started_at` | Handler times whole bridge call as synthesis + duplicate sample writes | **Both are real, but downstream of Layer 1.** The engine-id mismatch is *why* load is never separated at all for mixed; fix it first, then the handler/announce-fallback paths. |
| Queue pause | Presentation-only "pause" (status regression) | No global pause; clear ETA + per-group phase | **No global pause; suspend ETA clock + phase.** Plus fix Layer-4 resource claim for cross-job contention. |
| Frontend work | Assumed "preparing" already renders (**unverified, wrong**) | Thread `reasonCode`, add preparing label, kill 120 s lane | **Codex is right** — there is no segment-granularity preparing tier; frontend work is required. |
| Resource claim (Layer 4) | Out of scope | RCA recommends fixing; plan defers | **Owner decision point** (see Scope). |

**Unique contribution of the independent RCA (not in either plan):** Layer 1 (engine-id/marker mismatch) and the fact that the frontend keys span-rendering on `active_segment_id` presence while ignoring `reason_code`. These are the mechanisms that make both plans' fixes incomplete on their own — e.g. Codex's "split the clocks" cannot capture `model_load_seconds` for mixed until marker resolution is fixed.

---

## Decisions (resolved contradictions)

1. **Durable job status stays monotonic.** Introduce/propagate a per-group **phase** (`preparing` vs `synthesizing`) the UI reads; do not regress `running→preparing`.
2. **No global queue pause; no eager load-all-models.** Suspend the per-group ETA clock during load; rely on existing serialization within a job.
3. **Resolve timing markers + progress patterns by the *active group's* engine**, not the static `engine_id="mixed"`. Do this without engine-ID branching in core (`modular_architecture.md`): the group entry already carries its engine (`group["engine"]`); core resolves markers from that engine's manifest. Optionally also have the mixed handler emit an explicit bracketed per-group load marker so detection does not depend on matching engine stdout strings (robust to warm-vs-cold worker differences).
4. **Orchestrator is the sole, idempotent metrics writer** on a synthesis-only clock; the mixed handler stops writing a load-inclusive `synthesis_duration_seconds`.
5. **Null ETA must clear** the persisted ETA during preparation.
6. **Frontend gains a segment-granularity "preparing" tier**, reads `reason_code`, and relabels the load window (e.g. "Preparing… / Loading voice model…").

---

## Scope

**In scope (core fix):** Layers 1–3 — marker resolution per active engine, synthesis-only duration capture (sole writer), ETA suspension + clearing during load, and the frontend preparing presentation. **Owner decision (resolved): the frontend change is the FULL per-group phase model** (a first-class preparing/synthesizing phase the UI reads), chosen over minimal `reason_code` threading for robustness to future engines and mid-render warm-model eviction/reload.

**Out of scope — deferred (Layer 4 / W5, resolved):** the mixed `ResourceClaim.none()` fix is **deferred** to separate follow-up work. It addresses cross-job GPU contention, which is real but distinct from the reported within-chapter symptoms.

---

## Success criteria

Reproduce order **Voxtral → cold XTTS → warm XTTS** and assert:
1. During the XTTS load window the segment/queue bar shows **Preparing** (not Working) and its ETA is **suspended/cleared**, not animating.
2. On engine confirmation the bar resumes pacing from a fresh, valid ETA.
3. The recorded render sample's `synthesis_duration_seconds` **excludes** model-load time (≤ wall time); `model_load_seconds` is captured; exactly **one** sample is written per group.
4. Future ETA (`seconds_per_char`) is computed from synthesis-only time.
5. Durable job status never regresses (`running` stays `running`); the preparing state is carried by the per-group phase/`reason_code`, per `live-events.md`.
