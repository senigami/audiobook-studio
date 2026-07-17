# Mastermind handoff — PR 05 / task 010: repo-ready plugin folders (locked at Checkpoint 1)

**Branch:** `studio2/standalone-plugin-repos-010` (off `studio-2.0` @ 6043b821). PR targets `studio-2.0`.
**Dispatch doc:** `design-docs/plans/pr-dispatch/05-standalone-plugin-repos-010.md`
**Authoritative plan:** `design-docs/plans/active/final_release/05_standalone_plugin_repos.md` (+ `master_fix_plan/tasks/010-standalone-plugin-repos.md` PARTIAL audit)

## Locked problem statement (user-confirmed)

Prepare `plugins/tts_xtts/` and `plugins/tts_voxtral/` to be lifted, as-is, into their own
GitHub repos later — WITHOUT doing that extraction yet, and without breaking Studio today.
The actual git-repo creation/push is a separate later step. Plugins installed from a repo
must work in Studio; this is the preliminary step.

## Decisions (user answered via AskUserQuestion)

1. **SDK boundary:** extract a REAL `studio_tts_sdk` package from `app/engines/voice/sdk.py`
   + `app/engines/voice/base.py`. `app/` re-exports from it internally; the two plugins import
   only from it. (This is the deferred PR-03 prerequisite — do it now.)
2. **tts_mixed:** stays in-tree-only. Add `"builtin": true` to its manifest; keep its `app.*`
   imports as the documented exception; exclude from repo-readiness work.
3. **Distribution blocks:** add placeholder blocks now (`audiobook-studio/tts-xtts`,
   `audiobook-studio/tts-voxtral` on github.com) so manifests are final-shape.

## Key facts already surveyed

- Both engines' `plugin/server/engine.py` import `from app.engines.voice.sdk import TTSRequest, TTSResult, VerificationResult`
  and `from app.engines.voice.base import StudioTTSEngine`; xtts also `app.engines.proc_utils.run_cmd_stream`;
  both lazily import `app.engines.audio_ops.wav_to_mp3`. `plugin/studio/*` files in both also import `app.*`.
- No standalone `studio_tts_sdk` package exists anywhere yet.
- No LICENSE files in plugin folders. XTTS manifest declares `CPML-1.0`, Voxtral `Commercial API`.
- No `distribution` blocks in manifests. `entry_class` is `interface:XttsPlugin` / `interface:VoxtralPlugin`
  (top-level interface.py), mixed is `engine:MixedPlugin`.
- Already shipped (do NOT rebuild): `app/engines/official_registry.py`, engines router,
  `OfficialRegistryPanel.tsx`, `preview_github_plugin`, paste-URL install UI foundation.
- `tts_mixed` rename (M1) already done.

## Constraints

- Zero behavior change to synthesis/queue/engine-loading. `POST /plugins/refresh` + full pytest
  (root + plugin suites) stay green.
- modular_architecture.md: INV-3 no engine-ID branches in core; import-time side effects banned;
  loader's `_validate_manifest` in `app/tts_server/plugin_loader.py` is the authoritative validator.
- Specs to bump in same change: `engines-and-plugins.md` / `install-distribution.md` + wiki changelog
  + code-map changelog-queue entry.
- Open scope items from dispatch doc also in play: SUPERSEDED banner on
  `v2_engine_bundle_github_distribution.md`; registry JSON finalize; paste-URL install finalize;
  E2E install-flow + trust-warning tests (§5.3); tts_mixed registration wiring (Group 4);
  state/docs 6.1–6.3. Post-v2 (leave out): update-flow test §5.2.

## Definition of done (user-confirmed)

- `grep -rE "from app|import app" plugins/tts_xtts/plugin plugins/tts_voxtral/plugin` → nothing
  (top-level `interface.py`/`cli.py`/`plugin/studio` treatment decided during planning — studio-side
  adapters may have a different boundary; resolve explicitly in Phase 2/3).
- Both plugins load + synthesize in-tree; LICENSE + distribution block present; suite green;
  specs/changelog updated.

## Mastermind state

- Phase 1 (understand): DONE, checkpoint 1 confirmed.
- Phase 1.5 (route): user chose Fable session orchestrator (sensitive work).
- Next: Phase 2 — fusion-reasoning on the SDK-extraction approach (package location/name,
  how plugin/studio adapters' app.* imports are handled, vendoring vs pip-installable shape,
  what the future-repo boundary means for tests/ and interface.py), then plan-architect → checkpoint 2.
