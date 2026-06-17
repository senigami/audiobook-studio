# 003 — Restore per-span voice variation so the chosen variant reaches synthesis

- **Status:** done (no fix needed — see note) · ⚠️ needs owner repro
- **Outcome:** The variant suffix (`"Speaker - Variant"`) propagates correctly end-to-end in current code (assignment → `resolve_segment_profile_name` → chunk groups → `_render_segment`/profile dir → `resolve_existing_profile_dir`). Could NOT reproduce B4 in the synthesis path. Added 5 regression-guard tests (`tests/domain/test_segment_variation_synthesis.py`) that go red if a future change strips the variant. **If variations still appear broken to you, we need the exact repro (which screen, which engine, what you select) — the break is likely in a UI selection/persistence path not covered here, not the synthesis chain.**
- **Workload:** Real-app bug fixes
- **Severity / type:** major · regression
- **Effort:** L (investigative — discovery then fix)
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal
A voice "variation" (a voice has a **default** plus named **variants** — any vocal variant, not only emotion) chosen for a span must persist on the segment **and** be carried through to the synthesis request, so the segment renders with that variation. This used to work and regressed. Step 1 is **discovery** (the grounding sweep did not fully map this path); step 2 is the fix.

## Why this matters
This is bug **B4** ([`../00-audit-report.md`](../00-audit-report.md) Track B; [`../../book_view_ia_proposal.md`](../../book_view_ia_proposal.md) §10 B4). Per-span variation is one of the redesign's headline controls (`Character ▾ · Variation ▾`, task 010). If a non-default variant silently renders as the default voice, the author's vocal direction is lost with no error. Fixing it now means the mock prototypes real behavior. Because the path is not yet mapped, this task is explicitly **discover-then-fix** and the executor must record what they find.

## Context an executor needs
Specs / rules: [`docs/specs/testing-standards.md`](../../../docs/specs/testing-standards.md) — R1 (revert-check), R2 (mock boundaries only — for synthesis, the TTS engine itself is a legitimate boundary; the request-building code under test is **not**). Voice/engine routing lives behind the engine registry + `VoiceBridge`; core code must not branch on engine IDs (modular_architecture rule).

What the grounding *does* establish (use as discovery starting points, verify each yourself — file:line may have drifted):

- **"Variation" == a named variant of a speaker, encoded in `speaker_profile_name`.** Profile names are compound: `"<Speaker> - <Variant>"`. See `app/db/speaker_naming.py`: `infer_variant_name(profile_name)` (line 12) splits on `" - "`; `is_default_variant(...)` (~line 34) treats `"Default"` / no-suffix as the default variant. `app/domain/voices/models.py` has `default_variant: str = "Default"` (line 9) and a `VariantModel` (line 14).
- **Segment storage:** a segment stores `character_id` and `speaker_profile_name` (see `app/db/segments.py` `update_segment` and `save_script_assignments` in `app/domain/chapters/operations.py:194-206`). Confirm whether the **full variant-bearing** `speaker_profile_name` is stored, or whether something collapses it to the base speaker / default variant before storage.
- **Segment → synthesis resolution:** `app/domain/chunk_groups.py` `resolve_segment_profile_name(segment, default_profile)` (line 33) picks `segment["speaker_profile_name"]` else `segment["character_speaker_profile_name"]` else the default; that resolved name then drives `resolve_profile_engine(...)` (line 60) and render grouping. This is the prime suspect for where the variant is dropped — check whether the resolved name keeps the `- Variant` suffix all the way to the engine request, or whether a downstream lookup (`app/engines/voice_engines.py` `resolve_profile_engine` ~line 125, `get_profile_wavs` / `get_profile_dir` ~line 177-182) re-resolves to the default variant's assets.
- **Synthesis request building:** `app/engines/bridge.py` (VoiceBridge — engine routing), `app/engines/bridge_remote.py`, `app/engines/tts_client.py`. Trace what voice identifier is actually sent to the TTS server and confirm it corresponds to the chosen variant, not the base speaker.
- **Frontend:** `frontend/src/utils/chapterEditorHelpers.ts` `resolveDefaultVariantName(...)` (~line 77) resolves the default variant when none is chosen; `useChapterAssignments.ts` passes `speaker_profile_name`. `frontend/src/hooks/useVariantActions.ts` and `frontend/src/pages/Voices/components/VariantEditor.tsx` manage variant definitions. Confirm a non-default variant selection is actually sent (not overwritten by `resolveDefaultVariantName`).

## Target shape / contract
- A segment assigned a **non-default** variant (e.g. `"Aria - Whisper"`) persists that exact `speaker_profile_name`.
- When that segment is rendered, the synthesis request uses the **variant's** voice parameters/assets (the whisper variant), not the speaker's default.
- The default-variant path is unchanged.
- No engine-ID branching introduced in core code; resolution stays behind the voice bridge / profile resolution helpers.

## Steps
1. **DISCOVERY (record findings).** Trace the path end to end and write down, in the eventual commit/PR body and as a short note appended to this file's eventual implementation, *where the variant is dropped*:
   - `grep -rniE "variant|variation" app frontend/src` — confirm the model above.
   - Storage: does the assignment path store the full `"Speaker - Variant"` in `chapter_segments.speaker_profile_name`? (Inspect a row after assigning a non-default variant, or read `save_script_assignments`.)
   - Resolution: step through `resolve_segment_profile_name` → `resolve_profile_engine` / `get_profile_wavs` / `get_profile_dir` → the actual request payload in `bridge_remote.py` / `tts_client.py`. Identify the exact line where the variant suffix is lost or re-resolved to default.
   - Confirm whether this is backend (resolution/synthesis drops it) or frontend (selection never sent / overwritten by `resolveDefaultVariantName`). Most likely backend resolution, but verify.
2. **Write the revert-checked test first** at the layer where the drop happens (TDD):
   - **Backend (preferred if the drop is in resolution/synthesis):** in `tests/` (extend the closest existing `test_*chunk_group*` / `test_*synthesis*` / `test_*bridge*`, else create `tests/domain/test_segment_variation_synthesis.py`). Set up a speaker with a default and one named variant (distinct voice assets/params). Create a segment whose `speaker_profile_name` is the non-default variant. Drive the real resolution/request-building code and assert the synthesis request (or resolved profile) carries the **variant's** parameter, not the default. Mock only the TTS engine boundary (R2) — never the resolution function under test.
   - **Frontend (if the selection is dropped client-side):** assert the assignment request body carries the chosen variant's `speaker_profile_name`; mock only `api.*` (R2); fake timers, no sleeps (R4).
3. Run the test → confirm **red** on current code; record the exact failing assertion and the line where the variant is lost.
4. **Fix** at the identified point — restore propagation of the chosen variant from segment storage through resolution into the synthesis request. Keep resolution behind the existing helpers / voice bridge; do not add engine-ID branches. If the frontend overwrites the choice with the default, stop that overwrite while preserving default-when-unset behavior.
5. Re-run → green. **Revert-check:** stash the fix (keep the test), confirm red, restore.
6. Verify: `./venv/bin/python -m pytest -q` + `ruff check .` (backend) and/or `npm -C frontend run test -- --run` + `npm -C frontend run build` (frontend), per where the fix landed.

## Acceptance criteria
- [ ] Discovery findings recorded: the exact file:line where the variant was being dropped, and whether the fix is backend or frontend.
- [ ] A segment assigned a non-default variant persists that `speaker_profile_name`.
- [ ] Rendering that segment produces a synthesis request using the **variant's** voice parameters/assets, not the default.
- [ ] Default-variant behavior unchanged; no engine-ID branching added to core code.
- [ ] Test mocks only the boundary (TTS engine / `api.*`), not the resolution/request-building code under test (R2); no sleep-based timing (R4).
- [ ] **Revert-check: test fails on pre-fix code** (fix stashed → red → restored → green).
- [ ] Relevant suite green (`pytest -q` + `ruff` and/or frontend `test --run` + `build`).

## Out of scope
- The `Character ▾ · Variation ▾` mock UI (Track A task 010) — this task restores the underlying real behavior only.
- Adding *new* variant kinds or a variant authoring flow (variant definition already exists in `VariantEditor`).
- B1/B2/B3 (tasks 001/002/004).
