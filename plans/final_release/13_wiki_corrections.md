# 13 — Wiki Corrections & Additions

Fact-check results (2026-06-10) of `wiki/` against the actual code, beyond the items already in [01_discrepancies_and_corrections.md](01_discrepancies_and_corrections.md). Already fixed directly (no action): canonical bundle tree added to Voices-and-Voice-Profiles from `docs/specs/voice-bundle-template/`. **Format convention (owner ruling 2026-06-10):** voice samples/previews = MP3, chapter/book render audio = WAV, portable bundles = MP3 — an earlier `sample.mp3`→`sample.wav` wiki edit was wrong and has been reverted; see doc 01 W-2. Execute the rest before the Phase 13 docs audit. Each item: page, what's wrong, the correction.

## Incorrect content

- [ ] **W5. "Safe Mode" doesn't exist — it's "Stability Mode"** — `wiki/Settings.md`. The UI (`GeneralSettingsPanel.tsx:81`) calls it Stability Mode and it's a text-sanitization pre-pass, not engine crash recovery. Rewrite the bullet with the real name and purpose.
- [ ] **W6. Global Voxtral settings don't exist** — `wiki/Settings.md` lists "Voxtral Enabled", "Mistral API Key", "Voxtral Model" as Application Settings. The General tab has only Stability Mode, Default Engine, Default Voice; Voxtral credentials are engine-level via the TTS Engines card's schema form. Remove the three bullets; add a pointer under TTS Engines.
- [ ] **W7. Voxtral enablement steps are wrong** — `wiki/Troubleshooting-and-FAQ.md` "How to Enable Voxtral" points at the nonexistent global toggles. Correct to: Settings → TTS Engines → expand Voxtral card → enter API key in the engine form → enable the plugin.
- [ ] **W8. "Performance tab" no longer exists** — `wiki/Troubleshooting-and-FAQ.md` FAQ #4. Editor tabs are Script and Source Text (`EditorTabs.tsx`). Point to the Script view.
- [ ] **W9. Project tabs incomplete** — `wiki/Library-and-Projects.md` documents Chapters and Characters only; `ProjectDetailPage.tsx:77` has four: Chapters, Characters, **Assemblies**, **Backups**. Add sections for both missing tabs.
- [ ] **W10. VCR controls under-documented** — `wiki/Library-and-Projects.md`. `PlaybackControls.tsx` also has hold-to-skim backward/forward and a seek slider with timestamps. Document them; also state the only keyboard shortcuts are Space (play/pause) and Escape (stop) per `ChapterEditorPage.tsx:328-345` — don't imply prev/next shortcuts exist.
- [ ] **W11. Demo library is not Pinokio-only** — `wiki/Getting-Started.md`. `run.sh` auto-restores `demo/demo.zip` on any fresh install when `projects/` and `voices/` are empty (`AUDIOBOOK_STUDIO_DEMO_ZIP` overridable). Reframe.
- [ ] **W12. Job types list incomplete** — `wiki/Queue-and-Jobs.md`. Add `voice_build` (XTTS profile build) and `voice_test` (voice preview) as queue-visible job types; clarify "Baking" is the `is_bake` flag on synthesis, not a distinct kind (`app/db/models.py:5`).
- [x] **W13. RESOLVED by owner ruling (2026-06-10)** — voice samples/previews are MP3 (canonical `sample.mp3`); `app/domain/voices/bundles.py:24` accepting both `sample.mp3` and `sample.wav` is fine as a tolerant reader, mp3 is canonical. Wiki updated. Remaining: align `docs/specs/voice-bundle-template/voice.json` (`samples/preview.wav` → `preview.mp3`) — tracked in doc 01 W-2 / doc 04.

- [ ] **W20. Wiki websocket topic list incomplete** — the wiki documents 6 topics but code emits 10 stable topics + a `plugins.<id>.<area>` namespace (`chapters.lifecycle`, `segments.lifecycle`, `system.events`, `projects.lifecycle` missing). Update from the authoritative spec `docs/specs/live-events.md`; also soften the "7-step lifecycle ordering" claim to documented-intent per the spec.

## Missing coverage (features that exist but have no wiki docs)

- [ ] **W14. Settings → API tab** — local TTS API enable, API key auth, rate limit, LAN binding, queue priority mode (`ApiSettingsPanel.tsx`, `app/db/state_settings.py`). Add a section to `wiki/Settings.md`; consider a dedicated API page (Phase 13 already plans API docs — coordinate).
- [ ] **W15. Settings → About tab** — version + runtime health (`AboutSettingsPanel.tsx`). One short section.
- [ ] **W16. Project backups workflow** — Backups tab, dated ZIP snapshots with/without audio, save vs download (`app/api/routers/projects_backups.py`). Section in Library-and-Projects (pairs with W9).
- [ ] **W17. Default Engine / Default Voice selectors** — `GeneralSettingsPanel.tsx:93-146`. Add to the Settings General section.
- [ ] **W18. Per-voice plugin settings workflow** — mentioned conceptually in Voices page but no how-to: engine-declared overrides appear on the expanded variant card, stored in Studio-managed plugin data. Add the workflow.
- [ ] **W19. New pages once features land** (from doc 01): theming, responsive expectations, GitHub plugin distribution, plugin author guide (doc 03's template README seeds it). Owned by Phase 13; listed here for completeness.

*Acceptance:* every W-item's corrected text verified against the named source file at time of edit; Changelog gets an entry noting the docs accuracy pass.
