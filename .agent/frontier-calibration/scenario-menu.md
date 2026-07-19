# Frontier-calibration scenario menu

Real, currently-open, hard problems in this repo suitable for benchmarking a reasoning
system (ensemble / structured-reasoning) against a single frontier model. Every candidate
below was cross-checked against live code on 2026-07-18 (not trusted from the plan docs
alone) — file/line pointers are current. None are synthetic: each is a genuine open problem
whose solution benefits the project.

**Grading legend:** `objective` = a good answer converges on a specific, checkable
conclusion the repo can confirm; `semi` = a strong answer has identifiable required
elements but also judgment; `subjective` = quality is real but not mechanically scorable.

---

## Root-cause analysis

### RC-1 — Sub-sentence spans silently collapse after "edit chapter text + save"
- **Pose:** A user assigns a second speaker to part of a sentence (a sub-sentence span),
  then later edits the chapter's manuscript text and saves. All their manual
  sub-sentence speaker assignments in that chapter revert to single narrator-owned
  sentences and the associated segment audio is invalidated. Find the root cause and name
  the exact code path and the specific condition that discards the assignments.
- **Why it's hard:** The loss is not in the obvious "resync button" path — it fires on the
  common edit-and-save flow. The mechanism is a positional-index + full-sentence-equality
  preservation test that a sentence *fragment* can never satisfy, so it needs tracing
  through three layers (persistence trigger → rebuild → equality check) to see why a
  `split_<uuid>` row is structurally incapable of surviving. A shallow read blames the
  resync endpoint and misses that any text save triggers it.
- **Benefit:** Real data-loss gap affecting the flagship sub-sentence-casting feature;
  pinpointing the cause is the prerequisite for the re-anchoring fix.
- **Brief with:** `app/db/segments.py` (`sync_chapter_segments`, esp. lines ~507, ~523,
  ~534–535, ~555–566), `app/domain/chapters/operations.py` (`_split_segment_at_offset`
  ~487, `get_resync_preview` ~270/299), `app/db/chapters.py` (`update_chapter` ~224,
  `create_chapter` ~54), `frontend/src/hooks/chapter/useChapterPersistence.ts` ~24.
  Ground truth: `design-docs/plans/proposals/span_resync_preservation.md` (withhold from
  the model under test; use to grade).
- **Gradeable:** objective (there is a specific line and a specific failing condition).

### RC-2 — Predictive progress bar "speeds up and slows down" during a render
- **Pose:** During a live render the progress bar visibly lurches — accelerating and
  decelerating — as the backend ETA fluctuates. Given the pre-fix bar component, explain
  the root cause(s) of the visible velocity jitter and why the intended low-confidence
  smoothing never engages.
- **Why it's hard:** Three interacting causes (a default weight of 1 that no caller
  overrides; confidence lerping the position anchors instead of the trust/velocity; raw
  unsmoothed ETA samples driving the lane end-time) plus a separating insight that
  *position* and *velocity* are distinct concerns and only velocity should be modulated. A
  frontier model must resist "just smooth the ETA" and find all three.
- **Benefit:** This was a real owner-reported defect; the design has since shipped, so this
  makes an unusually well-graded calibration case — the canonical root-cause writeup exists.
- **Brief with:** `frontend/src/components/progress/PredictiveProgressBar/PredictiveProgressBar.tsx`
  (esp. `evidenceWeightFraction` default ~327, lane lerp ~329–334, `shouldCorrectStart`
  re-anchor ~265–303). Ground truth (withhold): `design-docs/plans/active/final_release/15_progress_confidence_model.md`
  "Current defect" section.
- **Gradeable:** objective (three enumerable causes + the position/velocity distinction).

---

## Architecture / design decision

### AR-1 — VRAM/CPU-aware dynamic concurrency auto-throttle
- **Pose:** Each additional concurrent XTTS worker loads its own model copy into VRAM, so a
  too-high `tts_parallel_cap` risks OOM. Design a mechanism whereby the *effective*
  concurrency cap can drop below the user's configured maximum under live memory pressure
  and recover as pressure eases — deciding where sampling lives, how it feeds
  `resolve_effective_cap`, hysteresis to avoid oscillation, how a throttle-down is surfaced
  (visible, not a silent stall), and the failure mode if sampling itself fails.
- **Why it's hard:** Expensive downside on both sides — too aggressive kills throughput,
  too timid OOMs mid-render and loses work. Must respect the existing single-writer
  cap-resolution chokepoint and the module-architecture rule that importing a module must
  not start threads/sampling loops. Interacts with the per-chapter-cap idea (shared
  semaphore keyed by engine_id).
- **Benefit:** Directly prevents OOM crashes and unlocks safe higher parallelism.
- **Brief with:** `app/orchestration/scheduler/cap_settings.py` (`resolve_effective_cap`
  ~119), `app/orchestration/scheduler/resources.py` (`get_engine_id_semaphore` /
  `get_engine_semaphore` ~397–429, `MAX_GLOBAL_CONCURRENT_SYNTHESIS`),
  `.agent/rules/modular_architecture.md`, `design-docs/plans/FUTURE_WORK.md`
  "Concurrency / rendering" section.
- **Gradeable:** semi (required elements: sampling source, hysteresis, chokepoint reuse,
  visibility, sampling-failure fallback — but the exact shape is a judgment call).

### AR-2 — Auto-isolated venv for GitHub/zip-installed plugins with conflicting deps
- **Pose:** Plugin install already works in-process (no restart) by `pip install`-ing into
  the running venv. But a newly installed plugin whose `requirements.txt` conflicts with —
  or is too heavy to share — the main venv is only handled by hand today (XTTS gets its own
  `~/xtts-env` + subprocess bridge). Design the conflict-detection heuristic and the
  decision flow: at preview time, diff the plugin's requirements against the installed set,
  decide when to offer a dedicated venv + subprocess bridge vs. shared install, and how the
  bridge is wired to mirror the XTTS pattern generically.
- **Why it's hard:** The hard part is the heuristic — "conflict" (version pins that can't
  coexist) vs. "too heavy" (torch-class deps) vs. "safe to share" is genuinely fuzzy, and a
  wrong call either needlessly fragments environments or corrupts the running venv
  irreversibly mid-session. Must generalize the one hand-built XTTS special-case into a
  contract without adding engine-ID branches in core.
- **Benefit:** Makes third-party plugin installation robust — a core Studio 2.0 promise.
- **Brief with:** `plugin_staging.confirm_staged_plugin()`, the install endpoint (`pip
  install` path), `app/tts_server/plugin_loader.py`, `app/engines/bridge.py` /
  `bridge_remote.py` / `tts_client.py` (the XTTS subprocess pattern to mirror),
  `tts_engines/tts_xtts/requirements.txt` + `~/xtts-env` provisioning in `run.sh`,
  `design-docs/specs/plugin-contract.md`, FUTURE_WORK "Plugin installation".
- **Gradeable:** semi (the heuristic can be argued; the wiring constraints are checkable).

---

## Blast-radius / refactor-risk

### BR-1 — Rename/move the `app/jobs` package (BE-6)
- **Pose:** The plan defers renaming/relocating the legacy-named `app/jobs` package as
  "the widest blast radius in this phase." Produce the blast-radius analysis: enumerate
  every module that imports it, classify which references are load-bearing runtime wiring
  vs. test monkeypatch aliases, identify the ordering hazards (import-time side-effect ban,
  the boot sequence, the `JobHandlerRegistry` still living here), and give a safe staged
  move sequence with the verification gate at each step.
- **Why it's hard:** `modular_architecture.md` forbids new modules importing the jobs
  worker loop, yet `JobHandlerRegistry` and worker helpers still live under `app/jobs`; the
  package straddles legacy and current runtime. The move can silently break test
  monkeypatch aliases (`app/api/web.py` deliberately keeps module-global path aliases) and
  reconciliation wiring. Gradeable against the actual import graph + code map.
- **Benefit:** Removes the last legacy-named chokepoint blocking the namespace-cleanup
  milestone; de-risks a change everyone is currently afraid to make.
- **Brief with:** `app/jobs/` (`registry.py`, `worker_helpers.py`, `worker_voice.py`,
  `worker_metrics.py`, `handlers/`) — currently ~10 importing files; the code map
  (`.agent/code-map/` symbol trace / blast-radius query); `.agent/rules/modular_architecture.md`;
  `app/core/boot.py`; REMAINING_TASKS "Milestone 3 simplification (005) — BE-6".
- **Gradeable:** objective-leaning semi (the import set and ordering hazards are checkable
  against the map; the staging is judgment).

### BR-2 — Give sub-sentence spans a durable structural anchor (the RC-1 fix)
- **Pose:** Fixing RC-1 means changing how `chapter_segments` rows are preserved across a
  resync — e.g. persisting parent-sentence references and/or character offsets and
  re-anchoring by text/offset match rather than positional full-sentence equality. Assess
  the blast radius of *that schema/logic change*: what breaks in `get_resync_preview`
  (which must stay consistent with the new preservation logic), the render-invalidation
  path, migration of existing rows, and the create/update/explicit-resync entry points that
  all share the rebuild.
- **Why it's hard:** Three write entry points share one rebuild function; the preview path
  duplicates the equality logic and must not drift from it; audio state
  (`audio_status`/`audio_file_path`) is coupled to segment identity. A change here can
  invalidate audio or desync the warning modal from reality.
- **Benefit:** Turns the known data-loss gap into a scoped, gradeable change with a mapped
  risk surface before anyone writes it.
- **Brief with:** same pointers as RC-1, plus `app/api/routers/chapters.py`
  (`api_sync_segments` ~259), `app/api/routers/chapters_production.py` (~35–38),
  `design-docs/specs/data-model.md`, `design-docs/specs/text-processing.md`.
- **Gradeable:** semi.

---

## Adversarial review

### AD-1 — Word-boundary snapping: two hand-mirrored implementations with no parity test
- **Pose:** The snapping algorithm exists twice — `_snap_offset_to_word_boundary`
  (Python, authoritative, `app/domain/chapters/operations.py` ~468) and
  `snapOffsetToWordBoundary` (TypeScript, UX preview,
  `frontend/src/pages/ChapterEditor/components/ScriptView.tsx` ~48), kept in lockstep only
  by comments and *parallel* per-language tests with no shared golden fixture. Do a hostile
  read: find inputs where the two diverge (a known one: JS `/\s/` vs Python
  `str.isspace()` at exotic whitespace codepoints), judge whether the "backend snaps last
  and authoritatively" safety argument actually holds for every path, and check the
  `showSafeText` offset-fidelity concern (selection offsets index rendered
  `sanitized_text`, not raw `text_content`).
- **Why it's hard:** Requires reasoning across two languages about Unicode whitespace
  semantics and DOM-offset mapping, and adjudicating a safety claim rather than just noting
  a smell. Flagged by a prior adversarial review as the change's most fragile assumption.
- **Benefit:** Prevents a future silent divergence in a data-integrity-sensitive path and
  scopes the parity-test follow-up.
- **Brief with:** the two files above; `design-docs/plans/proposals/span_resync_preservation.md`
  "Related maintenance risk" + "showSafeText" sections (use to grade, or withhold to test
  discovery).
- **Gradeable:** semi (the whitespace divergence is objectively demonstrable; the safety
  verdict is judgment).

### AD-2 — Adversarial read of the `resolve_effective_cap` clamp chain
- **Pose:** `resolve_effective_cap` silently returns a lowered value when a requested
  concurrency setting is clamped by a manifest ceiling or the global backstop, and the
  engine-class admission gate (`_engine_class_admission_enabled`, default now ON) gates
  which semaphore path a claim takes. Hostile-review the cap-resolution + admission chain
  for: silent-clamp UX bugs, a stale default/gate mismatch (see SD-1), off-by-one or
  keying bugs in the per-engine-id semaphore (shared across chapters), and any path where a
  requested cap has no observable effect.
- **Why it's hard:** The "raised default but gate still off" class already cost a full
  debugging round once (lessons INDEX); the interaction of user setting → manifest ceiling
  → global backstop → admission gate → semaphore keying is exactly where an observable-vs-
  configured mismatch hides.
- **Benefit:** This subsystem has a documented history of silent no-op bugs; a hostile pass
  is high-value.
- **Brief with:** `app/orchestration/scheduler/cap_settings.py` (~119),
  `app/orchestration/scheduler/resources.py` (~49–68 gate, ~397–429 semaphores, ~657, ~783),
  `.agent/lessons/INDEX.md` (the "default raised" lesson), FUTURE_WORK "Settings UI
  silent-clamp warning".
- **Gradeable:** semi.

---

## Planning / decomposition

### PL-1 — Executable plan for ACX loudness QA + normalization
- **Pose:** Turn the one-line backlog item ("ffmpeg `loudnorm` analysis per chapter,
  pass/warn/fail column, optional EBU R128 normalize at assembly, in
  `app/engines/audio_qa.py` + assembly option") into a self-contained implementation plan:
  the analysis pass, where it hooks into the existing `wav_to_mp3`/`export_chapter_audio`
  /assembly chain, the data model for pass/warn/fail results, the manifest/settings
  surface, the UI column, and the test strategy (including R1 revert-check discipline).
- **Why it's hard:** Must land inside real existing chokepoints (assembly, export chain)
  without a resurrected legacy task class, honor the WAV-render / MP3-export format rule,
  and decompose into slices a mid-tier executor can run without losing the whole picture.
- **Benefit:** Highest-ranked product opportunity for the target audience (makes output
  Audible/ACX upload-ready).
- **Brief with:** FUTURE_WORK "Product opportunities" #1 + "Audio loudness normalization";
  `app/orchestration/tasks/assembly.py`; the export/`wav_to_mp3` path;
  `design-docs/specs/audio-player.md`, `design-docs/specs/testing-standards.md`;
  CLAUDE.md audio-format conventions.
- **Gradeable:** semi (required slices and hook points are checkable; sequencing is
  judgment).

### PL-2 — Executable plan: standalone plugin repo extraction + install E2E (doc 010)
- **Pose:** Produce the plan to extract XTTS (and Voxtral) into their own installable
  repos, with an E2E acceptance test for the install flow + trust-warning test, the
  `synthesis_mixed` registration items, and state/docs updates — decomposed with the SDK
  inversion (already shipped, PR #140) as the foundation.
- **Why it's hard:** Cross-repo extraction with a live in-process install path, a
  trust-warning security surface, and a plugin contract that must not regress; the plan has
  to sequence "extract without breaking the bundled default" carefully.
- **Benefit:** Realizes the Studio 2.0 plugin-marketplace promise and is a named
  release-gating Stage 4 item.
- **Brief with:** `design-docs/plans/active/final_release/05_standalone_plugin_repos.md`,
  `stage3_sdk_migration_plan.md`, `studio_plugin_sdk/`, `tts_engines/tts_xtts/`,
  `design-docs/specs/plugin-contract.md`, `design-docs/specs/install-distribution.md`,
  REMAINING_TASKS "010 standalone plugin repos".
- **Gradeable:** semi.

---

## Spec-vs-code drift

### SD-1 — Always-on lesson says admission gate defaults OFF; code says ON
- **Pose:** `.agent/lessons/INDEX.md`'s first always-on lesson states the engine-class
  admission gate `_engine_class_admission_enabled()` "still defaulted OFF … so every
  synthesis claim kept routing through the legacy single-flight exclusive gate and renders
  stayed genuinely sequential." The live code
  (`app/orchestration/scheduler/resources.py:49–68`) documents and implements **default
  ON** since 2026-07-06 ("any other value, including unset, enables it"). Determine which is
  authoritative now, and whether the lesson is stale (misleading future sessions into
  believing renders are still sequential) or the code regressed.
- **Why it's hard:** The lesson is *auto-loaded every session* and reads as current
  operational truth; distinguishing "historically accurate but now superseded" from "still
  true" requires reading the gate's actual default logic, not the prose. A model that trusts
  the always-on lesson gets the system's real behavior backwards.
- **Benefit:** A stale always-on lesson actively misleads every future session about
  whether parallel rendering is live — worth correcting at the source.
- **Brief with:** `.agent/lessons/INDEX.md` (line ~7), `app/orchestration/scheduler/resources.py`
  (~49–68). Both current on disk.
- **Gradeable:** objective (the code default is unambiguous; the drift is factual).

### SD-2 — CLAUDE.md orchestration-task inventory vs. actual `tasks/` modules
- **Pose:** CLAUDE.md's Architecture section lists the orchestration task modules as
  "`synthesis`, `api_synthesis`, `assembly`, `bake`, `export`, `sample_build`,
  `sample_test`." The actual `app/orchestration/tasks/` directory contains
  `api_synthesis.py, assembly.py, base.py, sample_build.py, sample_test.py,
  segment_synthesis.py, synthesis.py` — no `bake.py`, no `export.py`, and an undocumented
  `segment_synthesis.py`. Separately, REMAINING_TASKS still tracks a `mixed.py` →
  `composite.py` rename, but there is no `mixed.py` in `tasks/`. Reconcile: which of these
  are real modules under different names/locations, which are stale doc entries, and which
  are genuinely-missing task types.
- **Why it's hard:** "bake"/"export" may exist as capabilities routed elsewhere (not as a
  named task module), so the answer isn't "the docs are wrong" — it requires tracing where
  bake/export actually execute and whether the doc names a module that never existed vs. one
  that moved. The `mixed`→`composite` note compounds it.
- **Benefit:** CLAUDE.md is the binding onboarding doc; an inaccurate module inventory
  misroutes every new contributor and agent.
- **Brief with:** `CLAUDE.md` (Architecture → "Task orchestration" bullet list), actual
  `app/orchestration/tasks/` listing, `grep` for bake/export task handling,
  REMAINING_TASKS "Backend namespace (006)" `mixed.py`→`composite.py` line.
- **Gradeable:** objective (module existence is checkable; the routing tracing is
  verifiable).

---

## Coverage note

All six requested activity types have at least two genuine, verified candidates (12 total).
No type required invention or padding. The two areas richest in real material were
concurrency/cap-resolution (a subsystem with a documented history of silent no-op bugs) and
the sub-sentence-span / resync data-loss gap (a well-evidenced, still-unbuilt correctness
problem) — several candidates deliberately draw on those because they are where the repo's
hardest open reasoning genuinely lives.
