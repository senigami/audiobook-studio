# Master Fix Plan — Overview

**Created:** 2026-06-19 · **Status:** proposed (planning only — no code changes) · **Branch:** `studio2/phase-12.4-polish-and-cleanup`

## What this is

A single, consolidated map of **everything that still needs fixing/finishing** before (and a little
after) the Studio 2.0 v2.0.0 release, built from this session's findings plus the still-open backlog
scattered across the existing plans. It is an **umbrella**: it does not re-document work that an
existing plan folder already specifies in task-level detail — it **maps the workstreams together,
orders them, and resolves overlaps** so an executor never loses the connections between them.

The companion narrative of what's *already done* is [../COMPLETED_WORK_REPORT.md](../COMPLETED_WORK_REPORT.md);
the per-plan status index is [../README.md](../README.md). This folder is the forward-looking twin:
**what's left.**

## Goal & success criteria

**Done =** every outstanding fix item surfaced this session is captured exactly once in this plan,
wired to the parts it touches, ordered by dependency, and pointed at its authoritative source — such
that any executor can open one task file + [01-map.md](01-map.md) and act without re-deriving context.
Specifically:
- No item is duplicated across workstreams (overlaps resolved by the supersession rule below).
- Every "lost functionality" item the owner confirmed (2026-06-19) is planned for restoration **before**
  the dead-code that contains it is deleted.
- The release-gating sequence is preserved (owner-run gates stay owner-run).
- Specs stay jointly authoritative (every behavior change bumps its `docs/specs/` spec).

## Scope boundary

- **In scope:** documenting and ordering all fix/finish work. Reconciling overlapping plans.
- **Out of scope:** executing any of it. Re-planning work that an existing folder already details
  (this plan *references* `simplification/`, `final_release/`, `book_view_redesign/`, etc.).
- **Explicitly excluded from consolidation:** today's `simplification/` is treated as an authoritative
  *input* (newest), not re-written; the in-progress style-guide work is left alone.

## The supersession rule (owner directive: newer modified file wins)

When two plans cover the same ground, **the more recently modified file is authoritative** and the
older one's overlapping items are folded into it (not planned twice). Resolved overlaps:

| Topic | Authoritative (newest) | Folded / superseded (older) |
|-------|------------------------|------------------------------|
| Dead code, dead deps, code-org cleanup | **`simplification/`** (06-19) | `final_release/06` (06-14), `final_release/09` D1–D4/R1–R5 (06-14), `file_split_plan` (06-12), parts of `organizational_cleanup` (06-14) |
| Styling separation / tokens | **`simplification/03`** (06-19) | `final_release/07` (done), `final_release/10` U3/U9/U10 (06-12) |
| Lost functionality / restoration | **`simplification/07`** (06-19) | *(new — not previously planned)* |
| Large-file splits | **`simplification/04`** (06-19) | `file_split_plan` split #5 + backend seams (06-12) |
| Book/Chapter IA design | **`book_view_ia_proposal`** (06-17) | `book_chapter_ia_proposal` (06-16), `book_chapter_ia_options` (archived) |
| IA live-app port | **`book_view_redesign/`** (06-17) | `site_redesign_rollout` Track A (demo-mock only) |
| Audio player (segment-aware + tape) | **`simplification/07` RST-8** (06-19) + **`audio_player_waveform_scrubber/`** (06-16) | `audio_player_scrubbing_waveform_proposal` (superseded) |
| Progress / ETA | **DONE** — `progress_routing_unification` (archived) | `v2_progress_tracking`, `final_release/15`, `phase_4` (all superseded) |
| Voice taxonomy v2 (Phase G) | **`final_release/04`** Phase G + `phase_12_polish` (06-15) | — |
| Standalone plugin repos | **`final_release/05`** (06-15) | `v2_engine_bundle_github_distribution` (archived) |
| Localization | **`phase_12_multilingual_interface_plan`** (06-14) | — (deferred post-v2) |
| Release gating | **`road_to_v2`** + `final_release/08` (06-15/06-12) | — |
| Backend namespace rename | **`master_agnostic_tasks`** (06-14) | — |

## How to read this folder

1. [01-map.md](01-map.md) — the workstreams as parts, the connections between them, the invariants
   that hold across all of them, and the risks. **The centerpiece.**
2. [02-roadmap.md](02-roadmap.md) — ordered workloads + dependency graph + the release-gate sequence.
3. `tasks/NNN-*.md` — one consolidated task per workstream: its authoritative source, the open items,
   what it supersedes, dependencies, and map links.
