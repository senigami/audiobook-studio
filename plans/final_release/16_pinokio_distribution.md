# 16 — Pinokio Distribution Wrapper

Audit (2026-06-10) of the Pinokio wrapper that installs/launches Audiobook Studio one-click. The wrapper lives at `/Users/stevendunn/pinokio/api/audiobook-studio.pinokio.git/` (it should become its own public GitHub repo for release — Pinokio installs apps by cloning a `*.pinokio.git` repo URL). It wraps this repo by cloning `https://github.com/senigami/audiobook-studio.git` into `app/` and driving `run.sh` / `run.ps1`.

**Owner context:** the demo bundle (`demo/demo.zip`) is a required feature for Pinokio and fresh installs — an optional demo book + voices so users can jump straight in. XTTS ships installed by default (initial default engine) and "Studio Voice" (the owner's personal voice) ships as the free default starting voice. The wrapper deliberately minimizes new terminal spawns to speed installation — preserve that property in any restructuring.

## 1. Current shape (verified)

| File | Purpose |
|---|---|
| `pinokio.js` | Menu builder; state detection (installed/running); exposes Install/Start/Update/Reset + app URL button |
| `install.js` | Clone-if-missing (`app/.git` check), then one shell run of `run.ps1 -SetupOnly` / `run.sh --setup-only`, then chains `script.start(start.js)` |
| `start.js` | Daemon; runs `run.ps1 -NoReload` / `run.sh --no-reload`; regex-captures `Uvicorn running on (http://…)`; health-waits on `/api/home` then `/` |
| `update.js` | `git -C app pull --ff-only` + setup-only re-run |
| `reset.js` | Removes `app/` and `env/` |
| `pinokio_meta.json`, `README.md`, `icon.png`, `assets/` | Listing metadata + docs |

**Terminal-minimization design (keep):** entire install = one shell session (clone + setup in a single `shell.run`), then `script.start` chaining instead of new process spawns; the heavy XTTS venv lives at `$HOME/xtts-env` outside the wrapper instance so resets don't force a multi-GB re-download.

Demo flow (verified): `install.js`/`start.js` export `AUDIOBOOK_STUDIO_INSTALL_DEMO=1`; `run.sh`/`run.ps1` call `python -m app.demo_bundle status/restore`, which extracts a whitelist (`audiobook_studio.db`, `projects/`, `voices/`) with path-traversal protection.

## 2. Release blockers

- [ ] **PK1. Pin the Coqui fork.** `requirements-xtts.txt` line 2 installs `git+https://github.com/idiap/coqui-ai-TTS.git@main` — unreproducible and breaks if upstream moves. Pin to a specific tag or commit SHA. (This file is in THIS repo, not the wrapper — fix here, wrapper inherits.)
  _Acceptance: `requirements-xtts.txt` references an exact tag/SHA; fresh `--setup-only` run installs successfully._
- [ ] **PK2. Torch backend selection.** `requirements-xtts.txt` has bare `torch>=2.10.0` — no CUDA/MPS/CPU differentiation. Windows/Linux users with NVIDIA GPUs may get CPU-only wheels (or the wrong CUDA), Apple Silicon gets MPS only if the default wheel supports it. Add platform detection in `run.sh`/`run.ps1` setup: detect `nvidia-smi` → install the matching CUDA index URL (`--index-url https://download.pytorch.org/whl/cu1xx`); Darwin arm64 → default wheel (MPS included); else CPU wheel. Log the chosen backend.
  _Acceptance: on this Mac, setup logs MPS/default; `python -c "import torch; print(torch.backends.mps.is_available())"` true in the xtts venv. Document the CUDA path for Windows testers._
- [ ] **PK3. Wrapper as a public repo.** Extract `api/audiobook-studio.pinokio.git/` contents (the JS scripts, meta, README, icon, assets — NOT the cloned `app/` working copy) into a clean GitHub repo `senigami/audiobook-studio-pinokio` (or Pinokio-conventional name). Add `app/` and `env/` to its `.gitignore`.
  _Acceptance: a fresh Pinokio install from the public repo URL completes on this machine with zero manual steps._
- [ ] **PK4. `condarc` machine path is NOT shippable state — verify it's Pinokio-generated.** `/Users/stevendunn/pinokio/condarc` lines 8–9 hardcode `/Users/stevendunn/pinokio/bin/miniconda/...`. This file sits at the Pinokio *root* (generated per-machine by Pinokio itself), not inside the wrapper repo — confirm nothing from the wrapper repo references it; if the wrapper repo contains its own copy, delete it.
  _Acceptance: the published wrapper repo contains no absolute paths (`grep -rn "/Users/" <wrapper repo>` empty)._

## 3. Robustness improvements (post-blocker, pre-release preferred)

- [ ] **PK5. Update flow hardening.** `git pull --ff-only` fails silently-ish on local modifications and has no rollback. Improve `update.js`: `git -C app fetch` + status check; on dirty tree, stop with a clear message ("Reset to update, or stash changes"); after pull, if setup fails, report the previous SHA for manual rollback. Also surface "restart required" if the app is running during update.
- [ ] **PK6. Reset/uninstall completeness.** `reset.js` leaves `$HOME/xtts-env` (potentially 10+ GB) and cache dirs orphaned. Add an optional "Deep reset (also removes XTTS environment)" menu entry that deletes `$HOME/xtts-env` — keep the default reset shallow since the venv is expensive to rebuild. Document leftover cache locations in the wrapper README.
- [ ] **PK7. Demo refresh for 2.0.** Regenerate `demo/demo.zip` from a Studio 2.0-format project once the 2.0 data model is final (voice metadata schema from doc 04, v2 DB schema), including the "Studio Voice" default voice. The restore whitelist in `app/demo_bundle.py` must match any new top-level dirs.
  _Acceptance: fresh install + demo restore yields a loadable demo project and at least one working voice (Studio Voice) on the default XTTS engine; demo chapter renders end-to-end._
- [ ] **PK8. First-run defaults.** Verify that after a fresh Pinokio install: default engine = XTTS (bundled `tts_xtts` plugin discovered via the out-of-process loader), default voice = Studio Voice, and the demo prompt honors `AUDIOBOOK_STUDIO_INSTALL_DEMO`. Wire this into doc 08's release checklist as a manual smoke test on macOS + Windows.
- [ ] **PK9. Version pinning policy for `requirements.txt`.** Core deps (`fastapi`, `uvicorn`) are unpinned. For release, generate a constraints file (`pip freeze` from a known-good env → `requirements.lock`) and have `run.sh`/`run.ps1` install with `-c requirements.lock`, keeping `requirements.txt` loose for dev.
- [ ] **PK10. Bash-only assumption.** `run.sh` requires bash (fine on macOS/most Linux; fails on minimal sh-only systems). Low priority — document bash as a requirement in the wrapper README rather than rewriting.

## 4. Structuring notes (owner asked for best-practice guidance)

The current structure is already close to Pinokio best practice, and the one-shell install is a genuine strength. Recommendations, in order of value:

1. **Keep setup logic in `run.sh`/`run.ps1` (app repo), not in the JS.** This is the right split: the wrapper stays a thin launcher (~150 lines total), and CLI users get the identical install path. Resist moving pip/npm steps into `install.js`.
2. **One daemon, one URL regex** (current `start.js`) is the canonical Pinokio pattern — no change needed. Consider also matching `Application startup complete` as a fallback if uvicorn's log format changes.
3. **GPU selection belongs in the setup scripts** (PK2), not Pinokio's `torch` helper script, because the XTTS venv is custom. This keeps behavior identical for non-Pinokio installs.
4. **Cross-platform test matrix before release:** macOS arm64 (this machine), Windows 11 + NVIDIA, Ubuntu + NVIDIA, and one CPU-only box. The wrapper has never been exercised beyond macOS — budget a real pass in doc 08 Stage 6.

## Sequencing

PK1–PK4 are release blockers (doc 08 Stage 6 gate). PK7 depends on doc 04 (voice schema) and the 2.0 data model freeze. PK8 is the final smoke test. PK5/PK6/PK9 should land before release if time allows; PK10 is docs-only.
