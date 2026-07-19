# Plan — auto-isolated venv for conflicting/heavy plugin dependencies

**Status:** DRAFT — awaiting twin + Fable plan review. No code changes made producing this plan.
**Feeds from:** `.agent/frontier-calibration/references/AR-2.md` (Fable design reference,
2026-07-19) — that reference is a complete design; this plan formalizes it into task slices.

## Problem

Plugin install works live (two-phase preview/confirm, `pip install` into the running TTS Server
venv). Nothing detects when a new plugin's requirements conflict with, or are too heavy to share,
that venv — today only XTTS's hand-built `~/xtts-env` + subprocess bridge handles this. A shared
install that upgrades an already-imported package can corrupt the live server process mid-session,
with no rollback.

## Design (see AR-2.md for full rationale)

1. **Decision point: preview time**, server-side. Extend the preview response with a
   `dependency_analysis` block; nothing installs during preview.
2. **Three-tier conflict/weight heuristic**, most-authoritative first:
   - Manifest declaration (`dependency_check: "managed"`, new contract value) — author's own call,
     always wins.
   - Real resolver check: `pip install --dry-run --report` in the server venv, comparing against
     installed versions (the current name-only check can't see pin conflicts) — with a
     specifier-based fallback if the resolver/network isn't available.
   - Heavy-package-list + aggregate download-size heuristic (data file, not code) as the
     "too heavy to share" tiebreaker.
3. **Uncertainty always resolves to isolate** — a wrong "isolate" costs disk/time (recoverable); a
   wrong "share" can corrupt the running server process (not recoverable). One-way override: user
   may escalate shared→isolated, never force isolated-because-conflict back to shared.
4. **Provisioning**: a new `env_provisioner.py` (mirrors `run.sh`'s xtts-env provisioning) —
   `python -m venv` → `pip install -r requirements.txt`, background task, completion marker file
   (not a package-dir existence check — the XTTS pattern's own documented lesson about flapping
   mid-install).
5. **Generalizing XTTS's bridge — the real target, and what ISN'T the target**: `app/engines/bridge.py`
   is already engine-agnostic HTTP plumbing and needs no change. The actual reusable pattern is
   `tts_xtts/plugin/core/warm_worker.py`'s stdio worker harness — extract it into
   `studio_plugin_sdk.subprocess_worker`, with the loader providing `ctx.env_python` to any managed
   plugin. Core never knows engine IDs; it keys off the manifest field.

## Tasks

1. **Contract bump**: add `dependency_check: "managed"` to the plugin-contract spec (v1.9.0),
   plus the `env.json` installation-local stamp schema and the SDK context field
   (`ctx.env_python`). Same-commit spec/changelog updates per the mandate.
2. **Resolver-backed conflict detection**: implement the `pip --dry-run --report` check plus the
   specifier-based fallback, in the preview path. Test: a staged plugin whose requirements would
   downgrade an installed package → CONFLICT verdict; a clean plugin → no-conflict; resolver
   unavailable → falls back correctly.
3. **Heavy-package heuristic**: the data-file heavy-list + size threshold. Test: XTTS's own
   requirements trip "heavy" (validates the list against the one real case); validate the list
   against `tts_voxtral`'s requirements too (the reference flagged this as unchecked).
4. **Preview response + UI**: add `dependency_analysis` to the preview endpoint; surface verdict +
   evidence in the staging card; user picks env mode within the allowed constraints (never force
   shared over a CONFLICT verdict).
5. **`env_provisioner.py`**: venv creation, requirements install, completion-marker-based readiness
   (not package-dir existence). Background task with `needs_setup` state during provisioning,
   `setup_message` surfacing pip failure tails on error.
6. **Extract the SDK worker harness**: `studio_plugin_sdk.subprocess_worker` from
   `warm_worker.py`'s engine-neutral machinery (persistent single-reader-per-stream, lazy pool,
   idle reaping — the file's own docstring documents why per-job readers corrupt job 2+). Test that
   a synthetic managed plugin using the extracted harness works end-to-end.
7. **Loader wiring**: for managed plugins, `_check_dependencies` checks the managed env's marker
   file, not the server interpreter — this also closes plugin-contract 1.8.0's documented
   all-or-nothing external-check limitation.
8. **Orphan cleanup**: a sweep for `engine-envs/` dirs whose plugin no longer exists (mirrors the
   existing `sweep_orphaned_staging_dirs` pattern) — flagged by the reference as the obvious
   follow-up with no disk-budget/GC policy specified otherwise.

## Open items for the owner/engineer

- `install_args` allowlist validation (GPU-flavored torch installs need extra pip args; arbitrary
  args from an untrusted manifest are an injection surface — validate against a known-host
  allowlist, e.g. `--index-url`/`--extra-index-url`).
- Env location: `<AUDIOBOOK_BASE_DIR>/engine-envs/<engine_id>/` (per-install state, matches storage
  conventions) vs. XTTS's `$HOME` precedent (predates those conventions) — recommend the former for
  new managed plugins; XTTS migration is optional and orthogonal, not forced by this plan.
- Background provisioning vs. an explicit second confirm click — either is defensible; plan
  recommends background-with-needs_setup to match existing long-work UX shapes.

## Out of scope

Migrating XTTS itself to the new managed-env mechanism — stays `dependency_check: "external"`,
hand-provisioned, unless deliberately migrated later.
