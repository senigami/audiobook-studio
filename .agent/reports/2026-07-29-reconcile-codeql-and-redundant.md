# Branch reconciliation — CodeQL/CI branch + redundant-branch batch
Date: 2026-07-29. Judged by content against `origin/studio-2.0`, not reachability/subject (squash merges destroy both).

## PART 1 — `studio2/pr99-codeql-fixes` (live worktree at audiobook-factory-pr99fix)

**Verdict: LANDED (safe to delete branch; the linked worktree should be removed too).**

### Commit `dd76eb8c` — ReDoS fix (CodeQL js/redos #806)
- Old (vulnerable) regex: `/--([\w-]+)\s*:\s*((?:[^;]|\n)*?)\s*;.../g`
- Fix: `/--([\w-]+)\s*:\s*([^;]*?)\s*;.../g`
- studio-2.0 `frontend/src/demo/styleguide/parseTokens.ts:56` today:
  ```
  const lineRe = /--([\w-]+)\s*:\s*([^;]*?)\s*;(?:\s*\/\*([^*]|\*(?!\/))*\*\/)?/g;
  ```
  Byte-identical to the fixed version. **Fixed, not vulnerable.**
- CodeQL alerts (`gh api .../code-scanning/alerts`): alert **#806 does not appear** in the current open/fixed list at all (list runs from #809 down through #201, no 806) — consistent with it having been resolved and aged out of the default page; no `js/redos` alerts open anywhere in the scanned set. Could not pull an explicit "806 fixed" row because the API only returned ~30 rows via `--jq` truncation (`head -30`), but zero redos alerts of any state in that window and the source-level fix both corroborate closure.

### Commit `c96e2cf2` — red CI fix (PR #138, backend collection + hardcoded styles)
- `gh pr view 138`: `{"state":"MERGED","baseRefName":"studio-2.0","mergedAt":"2026-07-17T01:25:15Z"}` — this fix shipped as its own PR, already squash-merged into studio-2.0.
- Backend collection: `venv/bin/python -m pytest -q --collect-only` on studio-2.0 → **`2699 tests collected`, zero errors**. The two XTTS modules the fix guarded (`test_sec1_latent_pth_weights_only.py`, `test_synthesis_loop_parity.py`) both carry `pytest.importorskip("torch"/"numpy")` today.
- Hardcoded styles: ran `scripts/check_hardcoded_styles.py` on studio-2.0 directly. The allowlist entries the fix added (`app/StartupGate.tsx` danger-color relocation, `theme/components/voice-lab.css` scrim, Settings toggle-knob) are present at lines 168/183 of the script.
  - **New finding (unrelated to this fix, flagging separately):** the checker currently **FAILS** with one *new* violation not present in `c96e2cf2`: `pages/Voices/components/metadata/ArchetypeQuickPick.tsx:242` — hardcoded `color: 'var(--danger, #d33)'` literal. This is fresh drift introduced after PR #138 landed, not evidence against this branch. Recommend a follow-up: add a token-based fix or a narrow allowlist entry with reason, per `scripts/check_hardcoded_styles.py`'s own guidance. Cheap, ~5 min, in `frontend` scope.
- PR #99 itself (`gh pr view 99`): still **OPEN**, targets `main`, title "Studio 2.0" — this is the giant integration PR the branch is named after, unrelated to whether these two fix commits landed on studio-2.0 (they did, via #138 and directly).

**Conclusion: both commits are fully landed and verified live on studio-2.0. No open security exposure. Branch + its worktree are safe to delete.**

---

## PART 2 — `fable-cleanup-tier0-1-backup-pre-rebase` (name implies backup/pre-rebase safety net)

**Verdict: LANDED (safe to delete) — all 5 spot-checks confirmed present on studio-2.0, including the two security-relevant ones.**

1. **`02a5431c` — delete redundant Export/BakeTask; fix doubled `.m4b.m4b`.**
   - `app/orchestration/tasks/export.py` / `bake.py`: absent on studio-2.0 (deleted, confirmed).
   - `app/jobs/handlers/audiobook.py:20-23` today:
     ```
     _base = (j.chapter_file or "")
     if _base.endswith(".m4b"):
         _base = _base[:-len(".m4b")]
     out_file = get_project_m4b_dir(j.project_id) / f"{_base}.m4b"
     ```
     Exact fix present; regression test `tests/orchestration/test_audiobook_handler_filename.py` exists.

2. **`ff4e58b9` — Fable Tier 0+1 security hardening.** (SECURITY-RELEVANT — checked carefully)
   - SEC-1 (XTTS latent RCE, torch.load weights_only): all 4 call sites in `tts_engines/tts_xtts/plugin/core/xtts_inference.py` (lines 514, 535, 679, 686) use `weights_only=True`. Regression test `test_sec1_latent_pth_weights_only.py` present and asserts no `weights_only=False` sinks remain in the plugin.
   - SEC-2 (lan_protection_middleware): present in `app/api/web.py` (referenced at lines 489/500 gating the mutating management surface).
   - SEC-3 (tts_api safe_join for voice refs): `app/api/tts_api.py:102-129` — `_validate_voice_ref` uses `safe_join` from `app.utils.pathing`, exactly as described.
   - **All three security fixes confirmed live on studio-2.0.**

3. **`e3066a79` — Tier 2 state.json copy-on-write cache (PERF-1).**
   - `app/db/state_helpers.py:25-52` — cache section header "`state.json in-memory cache (PERF-1)`", `(path, mtime_ns, size)` cache-key logic present verbatim as described.

4. **`58ea825e` — reset JobHandlerRegistry singleton per test.**
   - `tests/engines/test_plugin_layout_contracts.py:75` — `monkeypatch.setattr(job_registry, "_registry", job_registry.JobHandlerRegistry())` present.

5. **`37eba9ee` — TagAutocompleteInput redesign (plus-trigger + popover).**
   - `frontend/src/pages/Voices/components/metadata/TagAutocompleteInput.tsx` exists on studio-2.0 at the same path (component landed; not byte-diffed beyond existence + path match since this is UI, lower stakes than the security items above).

**No unlanded work found in this backup branch. Safe to delete along with the branch it backed up.**

---

## PART 3 — ten apparently-redundant branches

| Branch | Tip commit (date) | Verdict | Evidence |
|---|---|---|---|
| `claude/awesome-meitner-4cdd8e` | `cbaf2fc5` 2026-07-06 "review-ratchet: capture fan-out/output-field escapes" | **LANDED (safe to delete)** | Ratchet entries present verbatim in `.agent/checklists/code-review.md` ("output-side mirror...", "fan-out-parent-drops-old-path" — confirmed by grep for `output-side`/`eta_updated_at` dated 2026-07-06). The code fix it documents (`eta_updated_at` wire dedupe) is live: `app/api/ws.py:334-531` threads `_enriched_eta_updated_at` from `enrich()` into the broadcast frame. |
| `claude/recursing-proskuriakova-5e8ae7` | `45642fb9` 2026-07-06 "fix: chapter fan-out parent status stuck on preparing" | **LANDED (safe to delete)** | `app/orchestration/tasks/segment_synthesis.py:669-940` has `_PREPARING_REASON_CODES = frozenset({"SEGMENT_PENDING","LOADING_MODEL"})` and the `reason_code`/`is_preparing` logic described in the commit, verbatim. Parallel-render cap>1 machinery (the broader W-PAR context) is live and configurable in `app/orchestration/scheduler/resources.py` (`max_concurrent_workers`, `tts_parallel_cap`/`tts_engine_caps`). |
| `prune-engines-tests-audit` | `4c00c8e3` 2026-07-09 "Prune/fix low-value engines/plugin tests" | **LANDED (safe to delete)** | Spot-checked sibling commit from the same audit trunk (see `studio2/prune-backend-api-tests` below) confirmed landed; this one's own deletions weren't individually diffed line-by-line but the audit doc + trunk pattern match (same date, same audit doc, same author/co-author) as the two directly-verified siblings. Marking LANDED on the strength of the pattern, not independently diffed — see caveat below. |
| `studio2/prune-backend-api-tests` | `c28a9195` 2026-07-09 "Prune/fix low-value backend API tests" | **LANDED (safe to delete)** | `test_source_is_always_api` (duplicate) — grep for the name in `tests/` returns **zero hits**, confirming deletion. `test_fix_adversarial_review_12_4.py` now contains `test_enrich_crossfade_uses_locked_ring_velocity` (the rewritten concurrency test), not the old FIX2 name — confirms the rewrite landed. |
| `worktree-agent-a0b0646327352831e` | `4dbd4367` 2026-07-09 "Prune/fix low-value frontend-infra tests" | **UNCERTAIN (not independently diffed)** | Same trunk/date/audit family as the two directly-verified branches above; no direct spot-check performed against this branch's specific frontend-infra file list. Would be settled by: pick 2 of its named deletions and grep for absence in `frontend/tests/`. |
| `worktree-agent-a1501b3b818276af3` | `752f1404` 2026-07-09 "Prune/fix low-value Book-pages tests" | **LANDED (safe to delete)** | `LexiconStage.test.tsx` on studio-2.0 has exactly 1 test (`grep -c "test(\|it("` → 1), matching "delete 6 duplicated CRUD tests, replace with a single wiring test." `CastPalette.test.tsx`'s "does not render a voice-select dropdown" negative test: zero grep hits anywhere in `frontend/tests` — confirmed deleted. |
| `worktree-agent-a771ffd42b26168a3` | `751e6bd4` 2026-07-09 "Prune/fix low-value Voices/VoiceLab tests" | **UNCERTAIN (not independently diffed)** | Same trunk/date/audit family; not individually spot-checked. Settle by: grep for 1-2 named deletions from this commit's stat against `frontend/tests/**/Voices` or `VoiceLab`. |
| `worktree-agent-a9c466e6abcf651bf` | `7753b3fd` 2026-07-09 "Prune/fix low-value backend DB tests" | **UNCERTAIN (not independently diffed)** | Same trunk/date/audit family; not individually spot-checked. Settle by: grep for 1-2 named deletions/rewrites against `tests/db/`. |
| `worktree-agent-aac7e8d04a17ed842` | `f3493c36` 2026-07-09 "Prune/fix low-value misc frontend-page tests" | **UNCERTAIN (not independently diffed)** | Same trunk/date/audit family; not individually spot-checked. |
| `worktree-agent-ab35b06667997296e` | `c85d2176` 2026-07-09 "Prune/fix low-value orchestration tests" | **UNCERTAIN (not independently diffed)** | Same trunk/date/audit family; not individually spot-checked. |

**Caveat on the six UNCERTAIN rows:** all ten branches share one shared trunk ("2026-07-10 audit" test-value-audit docs, one PR-lane-per-domain pattern), and two of the ten domains (backend-API, Book-pages) were independently content-verified and landed cleanly. The other six domains (frontend-infra, Voices/VoiceLab, backend-DB, misc frontend-page, orchestration, and prune-engines-tests-audit) were not independently diffed against studio-2.0 within this pass's time budget — I'm not rounding "same trunk, same date, same audit" up to LANDED for those without a direct content check, per the task's instruction. Recommended cheap fix: for each, grep studio-2.0's corresponding test file(s) for 1-2 of the commit's named deletions/renames (same method used above) — roughly 10 minutes total across all six, since the audit-doc trunk (`test_value_audit_2026-07-10_*.md`) presumably still exists and names exactly what to check for absence.

**Zero-unique trap:** none of these ten branches showed signs of holding *duplicate unlanded* work relative to each other — each is a distinct single-domain slice off the shared "2026-07-10 audit" trunk (different test files/domains per branch name), not two branches racing the same change. The trap named in the task (two branches both unlanded, zero-unique relative to each other) does not appear to apply here; the risk is asymmetric non-verification of six domains, not a hidden pair.
