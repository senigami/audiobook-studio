# Review — 05a_standalone_plugin_repos_addendum.md (built from PL-2)

**Verdict: APPROVE.** The addendum's already-shipped/genuinely-open split matches disk, and all
5 new/corrected items check out against the actual code, re-verified independently below (not
just re-asserted from PL-2.md's own claims).

## What I checked (fresh, against disk — not just re-citing PL-2.md)

- `scripts/validate_plugin_manifests.py` — exists (`_check_manifest_schema`,
  `_is_forbidden_import`, `_check_ast_imports`, `validate_plugins`) but has **no** logic touching
  `distribution`, `git_url`, or the registry — confirms item 3's claim that no mechanical
  in-tree/registry sync check exists today.
- `tts_engines/tts_xtts/manifest.json` — `entry_class: "interface:XttsPlugin"`. Traced
  `app/tts_server/plugin_loader.py` `_validate_manifest`/`_CALLABLE_RE` handling (lines ~504-528):
  splits on `:`, validates the module part as an importable name, resolves it relative to the
  plugin dir. `interface` passes this cleanly — confirms item 1: the doc 05 §4.2 rename
  instruction is genuinely dead weight, not a plausible-sounding shortcut.
- `tts_engines/tts_mixed/manifest.json` — key is `built_in` (confirmed via earlier PL-2 pass);
  doc 05 body text says `builtin` at lines 329, 338, 411, but its own 2026-07-16 status banner
  (line 354) already self-corrects to `built_in`. Item 5 is accurate but slightly overstates the
  gap — one part of doc 05 (the banner) already has it right; only the older §4.4/Group-4 body
  text is stale. Worth a one-line refinement, not a blocker.
- `design-docs/plans/active/final_release/05_standalone_plugin_repos.md` lines 228 and 441 both
  say `Memory/state.json` — confirms item 4 verbatim; that directory was retired 2026-07-04 per
  CLAUDE.md, so both references are dead.
- Re-ran the Group 4 acceptance greps myself (`built_in` key, folder `tts_engines/tts_mixed/`,
  engine_id `mixed`) — matches the "already shipped, do not re-plan" list.

## Assessment of the 5 items

1. **X2 module-rename supersession — correct**, and independently re-derivable from the loader
   code without trusting the prior write-up.
2. **New Slice 0 (residue + license)** — correctly scoped as two separate blocking owner
   decisions, not conflated. Accept-and-document default for the `app.*` residue is a reasonable
   call (matches stage3's own wrapper-boundary precedent for in-tree plugins), clearly labeled
   as a default rather than a foregone conclusion.
3. **New Slice 4 (sync-guard)** — real gap, correctly identified, appropriately small (extend an
   existing script rather than invent new infra).
4. **Stale `Memory/state.json` reference** — correct, both citations found.
5. **`builtin` vs `built_in`** — correct in substance; minor overstatement addressed above.

## What the addendum missed

- **No cross-reference to `design-docs/specs/plugin-contract.md`'s own version number.** The
  addendum (and PL-2.md) cite plugin-contract.md as "1.5.0 per stage3 notes" but neither
  independently confirmed the file's current `spec_version` header. If doc 05's Group 6 spec-sync
  step fires, whoever executes it needs the actual current version to bump from — worth a
  one-line note in the addendum so the executing agent doesn't skip verifying it.
- **The addendum doesn't flag that doc 05's own body text (§4.4, line 329) still needs a second,
  independent fix beyond the `built_in` key** — it says `"builtin": true` should be *added*,
  but that field is already present (as `built_in`) and already true; the actual remaining doc
  fix is wording-only, not a to-do checkbox that should stay unchecked. Minor, but an executor
  skimming doc 05's checklist could still try to "add" a field that's already there.
- No new risk surfaced beyond what PL-2.md already flagged (residue + org-URL drift) — I found
  nothing outside those two that the addendum should have caught and didn't.

## Bottom line

The addendum is faithful to PL-2's findings, each of the 5 items independently re-verifies
against current code/docs, and it correctly declines to re-derive the full slice plan (defers to
PL-2.md, which is appropriate scoping for an addendum). Only gap: it should note that
plugin-contract.md's current version needs a fresh check at execution time rather than trusting
the cited "1.5.0," and that the `built_in` doc-05 fix is a wording correction, not a missing
field.
