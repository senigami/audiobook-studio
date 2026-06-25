# 17 · "Brendan Walsh" — Local Sysadmin  ☆ INFERRED

**Identity:** "Brendan needs Studio to be honest about its own state — running, broken, or partially started — and easy to fully reset without losing project data, because he is never the person who caused the problem and he is always the person who has to fix it."

## Goals
- Start and stop the app cleanly from the command line, with a reliable signal for when it is actually ready versus still initializing
- Diagnose startup failures (port conflict, stale subprocess, missing dependency, broken plugin) without reading application source code
- Update the app and its plugins during off-hours without leaving the system in a half-migrated state
- Recover from a crash — including a half-started TTS server, a stale lock file, or an orphaned subprocess — without touching project data
- Know which processes belong to Studio and which ports they hold so he can kill the right things and nothing else

## Context & environment *(INFERRED)*
- Shared office Mac (macOS Sequoia), managed via a standard admin account; other team members run Studio under their own user accounts
- Came to the role when the team lead handed him a README and said "keep this running"; he has read `run.sh` but not the Python application code
- Interacts with the app almost entirely via Terminal and Activity Monitor; opens the browser UI only to confirm the app is serving a response
- Works in reactive sessions: investigates a startup failure, applies a fix, confirms the app is running, and hands it back — he does not use the app's features himself

## Key workflow moments
- **Normal startup:** Runs `./run.sh` from the repo root; expects a clear log line indicating the app is accepting connections (not just that uvicorn started — the TTS server subprocess must also be ready), with a port number he can verify
- **Diagnosing a startup failure:** `run.sh` exits non-zero or hangs; Brendan needs the error output to tell him what failed (port in use, plugin failed to load, `~/xtts-env` missing) without grepping through a wall of uvicorn startup logs
- **Killing a stale session:** After a crash, `run.sh` fails because port 8123 is already bound; Brendan needs to find and kill the stale process — ideally a single command the README tells him to run, not a multi-step lsof investigation
- **Updating the app:** Pulls new commits, runs `./run.sh --setup-only` to reprovision; needs the provisioner to be idempotent — rerunning it on an already-provisioned machine should not break the existing environment
- **Recovering a bad plugin install:** A new plugin was dropped into `plugins/` but has a broken manifest; the TTS server fails to start; Brendan needs to identify the offending plugin from the startup log and disable it without touching the others

## Top friction points *(INFERRED)*
- **F1 — TTS server readiness is not surfaced to the operator:** `tts_server.py` prints `READY:{port}` to stdout for the watchdog, but this signal is not echoed clearly in `run.sh` output; Brendan sees uvicorn start and assumes everything is ready, but the TTS subprocess may still be initializing or have silently failed
- **F2 — Stale subprocess trees survive crashes:** If uvicorn is killed with SIGKILL (e.g., force-quit), the TTS server subprocess it spawned may keep running; on the next `run.sh`, the app starts cleanly but the old TTS server is still bound to its port, causing the watchdog to fail health checks against the wrong process
- **F3 — Port conflict error is buried in logs:** When port 8123 is already in use, uvicorn emits an OS-level bind error inside a Python traceback; the actionable information (which PID holds the port) is not in the log and Brendan has to run `lsof -i :8123` himself
- **F4 — Plugin failure takes down the whole TTS server:** A single broken plugin manifest causes `plugin_loader.py` to raise during TTS server startup; the entire server fails to start, taking down synthesis for all other engines, with no fallback degraded mode
- **F5 — No clean reset command:** After a bad update or crash, Brendan wants a single `./run.sh --reset` or equivalent that clears lock files, kills stale subprocesses, and leaves project data untouched — this does not exist, so he assembles the reset steps manually each time

## What they need from the studio
- A startup readiness log line that is unambiguous: `Studio ready — web :8123, TTS server :PORT` only after both processes are accepting connections
- A documented one-liner to kill all Studio-related processes by name or port, safe to run after any crash
- An `--idempotent` or `--repair` mode for `run.sh` that re-provisions without destroying an existing working environment
- Isolated plugin failure handling: a plugin that fails to load is skipped with a warning, not a hard crash; the remaining engines stay available
- A `--status` flag or health endpoint that reports the state of each component (web server, TTS server, loaded plugins, active queue) as structured output Brendan can read at a glance

## Review lens — questions they ask of any screen
- "If I run this command on a machine where Studio is already running, will it break the running instance?"
- "How do I tell whether the TTS server subprocess is actually ready versus still starting up?"
- "If a plugin fails to load, does the rest of the app still work?"
- "What is the exact command to find and kill every process that belongs to this app?"
- "Will rerunning `--setup-only` after a partial provisioning run leave the environment in a consistent state?"
- "Does the app write any lock files or PID files, and if so, where are they and when is it safe to delete them?"
- "If I pull new commits and restart, will in-progress jobs in the queue survive the restart or silently disappear?"

## Red flags that make them quit or distrust the app
- The app appears to start successfully but synthesis silently fails because the TTS server subprocess crashed after the readiness signal
- A second `run.sh` invocation starts a second Studio instance instead of detecting and refusing the conflict
- `./run.sh --setup-only` on an already-provisioned machine overwrites or corrupts `~/xtts-env`
- No way to distinguish "app is starting" from "app is stuck" — Brendan waits two minutes before realizing he needs to Ctrl-C
- A crash that writes a corrupt `state.json` that then prevents the app from starting on any subsequent boot, with no documented recovery path

**Evidence basis:** INFERRED. Interview IT staff or self-hosting engineers at small production companies who manage shared local AI tools (Automatic1111, LM Studio, ComfyUI) and ask specifically about the startup failure modes they encounter most often and what information they wish the app had logged.
