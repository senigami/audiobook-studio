# 18 · Cross-Platform Installer  ☆ INFERRED

**Identity:** "A QA contractor who validates that installation actually works on the machines real users have — not just the dev's MacBook — and will not ship until every platform has a clean, recoverable setup story."

## Goals
- Install Audiobook Studio on Windows, macOS, and Linux without hand-editing scripts or config files
- Understand what each platform actually needs (CUDA drivers, compilers, Homebrew deps) before the script fails
- Recover cleanly from an interrupted or partially-completed setup without needing to manually scrub state
- Confirm that `~/xtts-env` handling is correct when a previous failed install left a broken environment in place
- Validate that paths containing spaces, non-ASCII characters, or user-home variations do not silently corrupt setup

## Context & environment *(INFERRED)*
- Tests on VMs: Windows 11 (no GPU, restricted PowerShell execution policy), macOS 13 (M2, Homebrew absent), Ubuntu 22.04 (no CUDA, standard user, no sudo for system packages)
- Found Audiobook Studio via a QA engagement — not a day-to-day user of the finished app
- Works through a checklist: fresh VM, clone repo, run setup script, observe every printed line, capture the failure mode, document the next-step guidance (or its absence)
- Retests after each fix; marks a platform green only when setup completes, server starts, and the frontend loads

## Key workflow moments
- **Pre-flight audit:** Reads `run.sh` and `run.ps1` line by line before running them to understand what they will touch on the filesystem
- **Restricted-permission run:** Executes setup under a user account without sudo or admin rights; watches for silent failures that succeed with elevated rights but leave a broken venv without one
- **Interrupted install recovery:** Kills the setup script mid-XTTS-env-build, reruns it, and verifies the script detects the broken state and rebuilds rather than assuming it is complete
- **Path-with-spaces test:** Clones the repo into `~/My Projects/audiobook factory/` and runs setup; expects explicit quoting everywhere or a clear upfront rejection
- **Cross-script drift check:** Compares behavior between `run.sh` and `run.ps1` for the same scenario — missing dep, existing `~/xtts-env`, port already bound — and flags wherever one handles it gracefully and the other silently fails

## Top friction points *(INFERRED)*
- **F1 — Silent venv reuse:** `run.sh` checks whether `~/xtts-env` exists and skips setup if it does — even if the previous setup failed partway through. There is no validity check, so a broken env is silently reused and the TTS server fails later with a confusing import error.
- **F2 — Platform-specific dep gaps:** The script prints a generic "missing dependency" error without naming the platform-specific package that satisfies it (e.g., `libsndfile1-dev` on Ubuntu, `libsndfile` via Homebrew on macOS, a prebuilt wheel on Windows).
- **F3 — PowerShell execution policy wall:** On a default Windows install, `run.ps1` fails immediately with an execution-policy error and no recovery instruction. The user has to know to run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` themselves.
- **F4 — Port-conflict silence:** If port 8123 is already bound (e.g., a previous uvicorn still running), the script exits with a uvicorn traceback rather than a human-readable "port in use" message with a `--port` hint.

## What they need from the studio
- A pre-flight check that names every missing system dependency with the platform-appropriate install command
- A `--clean` flag (or equivalent guidance) that scrubs `~/xtts-env` and the project venv before re-running setup
- Explicit `~/xtts-env` validity check: if the env exists but is incomplete or the wrong Python version, say so and offer to rebuild
- PowerShell setup instructions in the README that include the execution-policy step before any script invocation
- Consistent behavior across `run.sh` and `run.ps1` for the same failure scenarios; divergence should be documented, not silent

## Review lens — questions they ask of any screen
- "If I kill this process now and rerun it, will I end up with a working install or a silently broken one?"
- "Does this error message tell me what to do next, or does it just tell me something went wrong?"
- "Is this step different on Windows, and if so, does the script handle that automatically or does the user have to know?"
- "What happens when `~/xtts-env` already exists — does the script verify it or blindly skip it?"
- "Does this path handling break if my home directory contains a space or a non-ASCII character?"
- "Can a user without admin/sudo rights complete this step, and if not, is that stated upfront?"
- "After an interrupted install, is the system in a state I can recover from without reading the source?"

## Red flags that make them quit or distrust the app
- Setup completes with exit code 0 but the server fails to start on the first run
- A failure on one platform produces a different error message than the same failure on another — inconsistent surface
- The script modifies system-wide paths or configs without warning (e.g., writes to `/usr/local/lib` or modifies `~/.bashrc` silently)
- No indication of what step the script is on — a long silent pause before a failure with no context
- `~/xtts-env` from a failed install causes a second run to silently succeed setup but fail at inference time

**Evidence basis:** INFERRED. Interview QA contractors or early adopters who attempted install on non-developer machines; key open question is whether `run.sh`'s existing-env detection is a real user-facing pain point or an edge case limited to power users.
