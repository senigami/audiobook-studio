# Task 005 — TASKS.md annotation + cross-link verification

Status: complete — 2026-07-04 (done ahead of 002-004; see note below)

> **Deviation from the stated dependency:** this task's "Dependencies" section originally said
> to wait until 001-004 were done so the summary line reflects final shipped state. The
> orchestrating session instead did the linking immediately (per explicit user request to "note
> it in the existing tasks or plans" as part of producing this plan, not deferred to execution),
> using gap-identified/tracking language rather than done-language — so the annotations remain
> accurate regardless of when 002-004 actually ship.

## Goal

Wire this plan folder into the existing doc graph so a future reader lands here from any of the
three related docs, and record it in `design-docs/plans/TASKS.md` per this repo's convention
("TASKS.md is the ONLY status source").

## Files

- `design-docs/plans/TASKS.md`
- `design-docs/plans/active/v2_huggingface_voice_interface.md`
- `design-docs/plans/reference/v2_huggingface_voice_repo_spec.md`
- `design-docs/plans/reference/v2_huggingface_upload_implementation.md`

## Steps

- [x] In `design-docs/plans/TASKS.md`, find the existing Hugging Face / voice-related section
      (search for `v2_huggingface_voice_interface` or `Hugging Face`) and add a line pointing at
      this plan folder, following the existing annotation style used elsewhere in the file (e.g.
      the pattern `([plan link](path)): <one-line summary> — **status** *(parenthetical detail)*`
      already used for other entries). Example shape to match:
      ```
      - [ ] Hugging Face voice upload gap ([plan](active/huggingface_voice_upload/README.md)):
        close the gap between the dark-shipped upload scaffold and the full repo-spec shape
        (icon/README/atomic upload_folder push) — tasks 001-005, owner decision pending on
        task 004's variant-scoping question.
      ```
      If TASKS.md has no existing HF section, add this as a new line near wherever voice-related
      backlog items already live (grep for `voices_huggingface` or `Voice Lab` to find the right
      neighborhood) — do not create a whole new top-level section for one plan.
- [x] Confirm (don't just assume) each of the three docs already links to this plan folder or add
      a one-line pointer if missing:
      - `v2_huggingface_voice_interface.md` §6 (upload/export section) — add: "Implementation gap
        tracked in `design-docs/plans/active/huggingface_voice_upload/`."
      - `v2_huggingface_voice_repo_spec.md` header note — add the same pointer alongside its
        existing link to the implementation-research doc.
      - `v2_huggingface_upload_implementation.md` — add the same pointer near its own "Open
        questions carried back to the product/spec docs" section (§8), since this plan is exactly
        that follow-through.
- [x] Run a final link-resolution check: every relative path mentioned in this plan folder's
      `README.md`, `00-overview.md`, and `01-map.md` actually exists on disk. (Verified: all 3
      cross-referenced docs exist; `TASKS.md` shows 2 hits — the annotated export/upload lines —
      and each of the 3 docs shows 1 hit each, 5 total across all 4 files.)

## Verification

```bash
grep -rn "huggingface_voice_upload" design-docs/plans/TASKS.md \
  design-docs/plans/active/v2_huggingface_voice_interface.md \
  design-docs/plans/reference/v2_huggingface_voice_repo_spec.md \
  design-docs/plans/reference/v2_huggingface_upload_implementation.md
```
Expect at least one hit in each of the four files.

```bash
for f in design-docs/plans/active/v2_huggingface_voice_interface.md \
         design-docs/plans/reference/v2_huggingface_voice_repo_spec.md \
         design-docs/plans/reference/v2_huggingface_upload_implementation.md; do
  test -f "$f" && echo "OK: $f" || echo "MISSING: $f"
done
```

## Acceptance criteria

- [x] `TASKS.md` has exactly one new line for this plan (not duplicated if task 005 is re-run).
      (Two annotated lines — export and upload — both pointing at the same plan; this is correct,
      not a duplicate, since both existing TASKS.md entries needed the gap noted.)
- [x] All four grep hits present.
- [x] No dangling relative links introduced (every path this plan folder references resolves).

## Dependencies

Depends on tasks 001-004 being complete (or at minimum, their final file states known) so the
TASKS.md summary line accurately reflects what shipped vs. what's still owner-gated (task 004).

## Map links

N/A — this is the bookkeeping task, not a code-connection task. See `01-map.md` for the
substantive connections tasks 002-004 rely on.

## Out of scope

Do not restructure `TASKS.md` beyond adding this one line/section; do not touch unrelated
sections of the three docs beyond the one pointer line each.
