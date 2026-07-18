# 21 — Release consolidation ledger

**What this is.** The single working record for the release doc reduction: a fuller per-item summary
of every shipped workstream, tracked against where its history and user-facing docs live, plus what
source plan each item lets us retire. Use it to **verify then delete** — confirm the wiki changelog
and user docs actually cover a shipped item, *then* delete its source plan; sort anything not shipped
into **do-now** (pre-release) or **future**.

**Relationship to the other docs.** This is the working ledger; it is deleted at the tag with the
rest of `final_release/`. Its permanent residue is the lean [COMPLETED_WORK.md](../../COMPLETED_WORK.md)
(what shipped) + [`wiki/Changelog.md`](../../../../wiki/Changelog.md) (the narrative history). The
deletion mechanics (spec repoints for provenance-cited plans) live in
[20_stale_docs_retirement.md](20_stale_docs_retirement.md); this doc is the *justification and
verification* that precedes those deletions.

**Verify legend.** `CL` = covered by a `wiki/Changelog.md` dated section. `UD` = user-facing doc
coverage (wiki concept page / handbook). `✓` verified present · `⚠` gap — needs a doc fix (→ do-now)
· `—` internal-only, no user doc expected · `?` not yet spot-checked.

> **How to run the pass:** for each row, open the named changelog section and user-doc page, confirm
> they describe the shipped behavior, tick `Verify`. Any `⚠` becomes a do-now doc fix. When a row is
> fully verified, its source plan (the "Retires" column) is safe to delete per doc 20.

---

## Part 1 — Shipped (verify → then delete source plan)

### Progress / ETA · Parallel rendering
| Item | CL section | UD | Retires | Verify |
|---|---|---|---|---|
| W-MIX mixed-engine progress/ETA (no fabricated numbers, load-aware ETA, end-game clipping) | 2026-06-29, 07-02 ✓ | Queue-and-Jobs `?` | `active/` mixed-synthesis plan residue | [ ] |
| W-PAR parallel segment rendering (cap>1 default, monitor, multi-job rows) | 2026-07-03, 07-04 ✓ | Queue-and-Jobs `?` | `active/parallel-segment-rendering/` | [ ] |

### Visual redesign · Foundation · IA
| Item | CL section | UD | Retires | Verify |
|---|---|---|---|---|
| W-QS Quiet Studio redesign (token re-skin, forms, status/progress, glass audit) | 2026-06-20, 07-11 (North Star parity) ✓ | Getting-Started/Concepts `?` | `reference/quiet_studio_migration/`, `reference/site_redesign_rollout/`, `reference/site_experience_north_star.md` (B1 — repoint specs first) | [ ] |
| Milestone 1 foundation cleanup | 2026-06-20 ✓ | — | `master_fix_plan/tasks/001` | [ ] |
| Milestone 2 two-level IA (Book/Chapter shell, Cast 3-tier, Review, bookmarks, RST suite, lexicon, per-span assignment) | 2026-07-09/10/11, word-boundary 07-17 ✓ | Library-and-Projects, Concepts `?` | `active/book_view_ia_proposal.md`, `book_chapter_ia_proposal.md`, `reference/book_view_redesign/` | [ ] |
| Audio player + waveform scrubber (scope-agnostic player, tape, peaks sidecar, block nav) | 2026-07-03, 07-10, 07-11 ✓ | Concepts/Getting-Started `?` | `active/audio_player_completion_004/`, `proposals/audio_player_scrubbing_waveform_proposal.md` (B1) | [ ] |

### Simplification · Namespace
| Item | CL section | UD | Retires | Verify |
|---|---|---|---|---|
| Milestone 3 code simplification (dead-code, styling split, large-file splits, text-ops pkg) | 2026-07-16 close-out, 07-04 sweep ✓ | — | `active/simplification/` (minus deferred LF-6/BE-6 — those → do-now) | [ ] |
| Backend namespace `plugins/`→`tts_engines/` + code-org | 2026-07-16 ✓ | — | `active/master_agnostic_tasks.md` (namespace parts) | [ ] |

### Plugin SDK · Engines · API
| Item | CL section | UD | Retires | Verify |
|---|---|---|---|---|
| Plugin SDK Stage 3 (`studio_plugin_sdk` real package, liftable engines, install/trust E2E) | 2026-07-16 ✓ | plugin-sdk handbook `?` | `reference/v2_plugin_sdk.md`, `reference/v2_engine_bundle_github_distribution.md` (B1) | [ ] |
| Standalone plugin repos — registry JSON + paste-URL install UI (extraction itself → do-now) | 2026-07-16 ✓ | plugin-sdk `?` | — (plan `active/final_release/05` stays; extraction open) | [ ] |
| External TTS Gateway API (queued download, input hardening) | 2026-07-16 ✓ | studio-as-tts-gateway `?` | — | [ ] |
| Video sample export | 2026-07-16 ✓ | user-guide `?` | — | [ ] |

### Voices · Casting
| Item | CL section | UD | Retires | Verify |
|---|---|---|---|---|
| Voice taxonomy v2 Phase G (`language`/`style`, Edit Metadata UI, HF tag maps, schema 2.0) | 2026-07-03 ✓ | Voices-and-Voice-Profiles, `user-guide/voice-tags-icons.md` `?` | `reference/v2_voice_tag_taxonomy.md` (B1) | [ ] |
| Voice-variant version history + A/B panel | 2026-07-15 ✓ | Voices `?` | — | [ ] |
| Voice variant tagging + catalog IA redesign | 2026-07-15 ✓ | Voices `?` | — | [ ] |
| HuggingFace voice browse + upload | ✓ **written 07-18** (CL 2026-07-12, import note 07-03) | Voices `?` | — | [x] CL |
| AI casting + voice metadata UI ("Suggest voices for character") | ⚠ **HELD — no clean landing date/spec row for the "Suggest voices" action; product-scope (release vs fast-follow) undecided.** Needs sourcing + owner scope call before a public CL entry | Voices `?` | — (blocked: CL entry + scope decision) | [ ] |
| Recording cue & persona sample expansion (mad-lib composer, 103-archetype library, portraits) | ✓ **written 07-18** (CL 2026-07-17, PR #146) | Recording-Guide `?` | `active/chapter_editor_catalog_completion/` (recording-cue parts) | [x] CL |

### Chapter editor · Reader · Misc
| Item | CL section | UD | Retires | Verify |
|---|---|---|---|---|
| Director's Console (Cast/Booth/Revise/Write) | 2026-07-10 ✓ | user-guide/chapter-editor `?` | `active/chapter_editor_catalog_completion/` (scaffold parts; polish backlog → do-now) | [ ] |
| Read-along reader (player-piano sync + timing sidecar + backup restore) | 2026-07-17 ✓ | Concepts `?` | `active/` synced_reader residue (already deleted per #153) | [ ] |
| Series suggestions on project create/edit | 2026-07-11 ✓ | Library-and-Projects `?` | `active/library_project_usability/` (series parts) | [ ] |
| Security hardening (fable Tier 0/1) | 2026-07-16 ✓ | — | `master_fix_plan/tasks/009` | [ ] |
| Interactive demo reconciled to shipping app | 2026-07-16 ✓ | Live-Demos `?` | — | [ ] |
| Cleanup-along-the-way (demo_bundle path bug, Export/Bake delete + M4B fix, video util) | 2026-07-04/16 ✓ | — | — | [ ] |

## Part 1b — User-doc (UD) verification pass (spot-checked 2026-07-18)

Checked each shipped feature against the wiki concept page that should describe it for users.

**Covered ✓** (wiki page has a real section): Director's Console (`Library-and-Projects` §Chapter
Workspace), variant version history + A/B (`Voices` §Variant Version History), variant tags/switcher
(`Voices` §Variant Tags), taxonomy/tags/icons (`Voices` §Tags), series suggestions
(`Library-and-Projects`), recording-cue "Suggest From Voice Qualities" (`Recording-Guide` — describes
the compose-from-tags mechanism), **AI casting suggestion panel** (`Voices` line 132: "scored
recommendations in the Casting stage's voice suggestion panel" — so the *user doc* covers it even
though its changelog entry is held), interactive demo (`Live-Demos`), TTS gateway (`Settings`
§API/Integrations + `docs/plugin-sdk/studio-as-tts-gateway.md`).

**User-doc gaps ⚠ (→ do-now):**
- **Parallel rendering** — `Queue-and-Jobs.md` has no mention of cap>1 / concurrent segments /
  the render monitor, though it's the shipped default and a user-facing settings lever.
- **Waveform tape / scrubber** — `Concepts.md` §Player Bar describes the bar but not the waveform
  tape, zoom/minimap, or scrubbing.
- **Video sample export** — "Export Video Sample" isn't in `File-Formats-and-Audio-Guidance.md` or
  the user guide.
- **Read-along reader (partial)** — `Library-and-Projects.md` §Booth describes the *old* Review
  follow-along; the new dedicated player-piano reader (timing sidecar, auto-advance, click-to-seek,
  card→expanded→fullscreen, its own `/reader` URL) isn't described.
- **HuggingFace import/publish (partial)** — `Voices` documents the bundle *format*'s HF
  compatibility, but not the user *actions* (import a voice from the Hub; publish your voice via
  Voice Lab → Settings token).

## Part 2 — Do now (pre-release, open — from REMAINING_TASKS)

- **Owner visual checks** (code shipped, only live observation missing): Stage-1 render verification;
  W-PAR render-monitor live checks (008/011/012/013/015); audio player + waveform sign-off; styling
  re-skin sign-off; recording-cue/persona end-to-end + portrait generation; demo + screenshot refresh.
- **Code still to write:** LF-6 `enrich()` extraction; BE-6 `app/jobs` package move; span-resync
  preservation; four-way input-class consolidation + U10 z-index; U4/U13 first-run onboarding;
  standalone repo extraction (X1-X6/V1-V3) + trust-warning E2E; Director's Console per-mode polish
  catalog; voice namespace rename + doc-06 infra stub decisions.
- **Doc reduction (this workstream):**
  - **Missing wiki changelog entries** (spot-checked 2026-07-18): **HuggingFace voice** and
    **recording-cue/persona** entries were written 07-18 (done). **AI casting** is HELD — no clean
    landing date or spec row for the "Suggest voices" action, and its release-vs-fast-follow scope is
    an open owner decision; it needs sourcing + that scope call before a public CL entry. Its source
    plan must not be deleted until then.
  - Then doc 20 §B1 (repoint + delete shipped-feature provenance) and delete verified source plans.
  - CL spot-check: **done** (Part 1). User-doc spot-check: **done** (Part 1b).
  - **Fill the 5 user-doc gaps** (Part 1b): parallel rendering (`Queue-and-Jobs`), waveform scrubber
    (`Concepts`), video sample export (`File-Formats`/user-guide), read-along reader
    (`Library-and-Projects` or `Concepts`), HF import/publish workflow (`Voices`). These are
    user-facing product prose — owner's voice; hand-list vs. Tess-drafts is an owner call.
- **Owner design decisions blocking work:** W-PERF AI pipeline schedule-or-hold; HF/AI-casting scope
  (at release or fast-follow); backend namespace `mixed.py`→`composite.py` + registry decisions.

## Part 3 — Future (post-2.0 — from FUTURE_WORK, condensed)

Localization impl · sub-sentence resync/undo/auto-detect · North Star Phase D (review annotations→
re-render, loudness QA) · art-program post-v2 tool slots · async MP3 export · VRAM-aware auto-throttle
· per-chapter cap · silent-clamp warning · auto-isolated plugin venv · **product opportunities**
(ACX loudness QA, A/B audition, keyboard render loop, silence trim, pronunciation lexicon, diff-aware
re-render, dialogue detection, onboarding tour, insights dashboard, listening-review annotations,
project templates, export presets, crash-recovery checkpoints, SSML-lite). All held as
design sources under `proposals/`/`reference/` where an active spec cites them (doc 20 §B2).

---

*When every Part-1 row is verified and its source plan deleted, and Part 2 clears, this ledger and
the rest of `final_release/` are deleted as the final pre-tag step — leaving `COMPLETED_WORK.md` +
the wiki as the permanent record.*
