# Roadmap

## Dependency graph

```
001 (doc fix: WAV→MP3)         ── independent, no deps ──────────────────┐
                                                                          │
002 (export: icon + README)    ── independent of 003 ─────┐              │
                                                            │              │
003 (upload: upload_folder)    ── independent of 002,      │              │
                                   but verify together ────┤              │
                                                            ▼              ▼
004 (engine assets — owner-gated)  ── depends on 002 (needs the enriched  │
                                       export path to attach assets to) ─┤
                                                                          │
005 (TASKS.md + cross-links)   ── depends on 001-004 all being final ────┘
```

002 and 003 touch different functions (`export_hf_voice_bundle` vs `HFHubClient.upload_files`)
and can run in parallel if desired, but both touch
`app/api/routers/voices_huggingface.py` (002 touches `/export`, 003 touches `/upload`) — if run
concurrently by two different agents/sessions, treat that router file as a serialization point
(same convention as this repo's `.agent/rules/modular_architecture.md` contested-surface
handling): land 002 first, then 003, rather than truly parallel edits to the same file.

Note (added 2026-07-04, Fable accuracy review): "land 002 first" is not only about file
contention — it's a soft correctness dependency. Task 003 deletes the
`ModelCard.from_template(...).push_to_hub(...)` tag fallback, after which tags reach the Hub
only via the generated `README.md`'s YAML frontmatter, which task 002 puts into the bundle. If
003 shipped alone, uploads would lose tag propagation entirely until 002 landed.

## Workloads

**Workload 1 — Doc correctness (no code)**
- Task 001: fix the WAV/MP3 discrepancy in `v2_huggingface_voice_repo_spec.md`.

**Workload 2 — Bundle content (export path)**
- Task 002: `export_hf_voice_bundle()` gains icon + generated README.

**Workload 3 — Upload mechanism (transport path)**
- Task 003: `HFHubClient.upload_files()` switches to `upload_folder()`, one atomic commit,
  structure-preserving.

**Workload 4 — Engine assets (owner-gated)**
- Task 004: `assets/<engine_id>/` inclusion — implements the default-variant behavior, flags the
  variant-scoping decision explicitly before merging.

**Workload 5 — Wiring & bookkeeping**
- Task 005: `TASKS.md` annotation + verify all cross-links resolve.

## Milestones

- **M1 (after 001-003):** A published voice on Hugging Face shows an icon (if set), a playable
  sample widget, and correct tags — the core "actually works on the Hub page" goal. This is the
  meaningful, demoable milestone even if 004 is deferred.
- **M2 (after 004):** Voices with a precomputed engine asset (e.g. XTTS latents) publish that
  asset too, enabling "instant use, no local clone" for whoever downloads it — per repo spec §6.
- **M3 (after 005):** Plan fully wired into the doc graph and `TASKS.md`; folder ready to archive
  once M1/M2 ship.
