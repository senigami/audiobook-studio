# AR-2 — Auto-isolated venv for GitHub/zip-installed plugins with conflicting deps

Gold-standard reference design. Written 2026-07-19 from the code on `studio-2.0`, not from the scenario menu's hints.

## 1. Question restated

Plugin install already works live, no restart: the two-phase preview/confirm flow stages a zip or GitHub repo and `confirm_staged_plugin()` moves it into `tts_engines/` and re-runs `load_plugins()` in-process; the dependency-install endpoint `pip install`s the plugin's `requirements.txt` into the *running* TTS Server venv. The gap: nothing detects when a new plugin's requirements **conflict with** or are **too heavy to share** the server venv — today that case is handled by exactly one hand-built special case (XTTS's `~/xtts-env` + subprocess workers). Design (a) the conflict-detection heuristic run at preview time, (b) the decision flow (shared install vs. dedicated venv + subprocess bridge), and (c) how the bridge generalizes the XTTS pattern without engine-ID branches in core.

## 2. What I examined

- `app/tts_server/plugin_staging.py:202-433` — `preview_plugin_zip()` / `preview_github_repo()` already parse `requirements.txt` (`_parse_requirements`, :65) and return `{engine_id, requirements, staging_token}` to the UI **before** anything installs. `:436-478` — `confirm_staged_plugin()` renames `.preview_<token>` → `tts_<engine_id>` and calls `server.load_plugins()`. This is the natural hook point: the decision must be made and surfaced here.
- `app/tts_server/server.py:393-470` — `install_dependencies()`: runs `[sys.executable, -m, pip, install, -r, requirements.txt]` into the **server's own venv**, then re-runs `_check_dependencies` and attempts plugin recovery. `:403-411` — already refuses (400) for `dependency_check: "external"` manifests, with the exact rationale this design generalizes ("would install into the server's venv instead").
- `app/tts_server/plugin_manifest.py:303-350` — `_check_dependencies()`: name-only presence check via `importlib.metadata.distribution()` against the server interpreter; **does not check version specifiers at all**, so a pin conflict is invisible today.
- `app/api/routers/engines_plugins.py:34-192` — the app-side routes; every operation goes through `create_voice_bridge()` → HTTP, i.e. all install machinery lives server-side.
- `app/engines/bridge.py` / `bridge_remote.py:154-156` / `tts_client.py:271` — the "XTTS subprocess pattern" hinted by the menu is **not** here. This layer is the Studio↔TTS-Server HTTP bridge and is already engine-agnostic; it needs no change.
- `tts_engines/tts_xtts/plugin/core/implementation.py:18-23,59-120,160-180` — the real isolation pattern: `XTTS_ENV_PYTHON` (env-var-overridable path into `~/xtts-env`), filesystem-only readiness (`xtts_env_ready()`, keyed on the `coqui_tts-*.dist-info` completion marker, not the package dir), and inference shelling out to that interpreter.
- `tts_engines/tts_xtts/plugin/core/warm_worker.py:60-115,300-390` — the reusable half of the pattern: `Popen([env_python, script, "--serve"])`, JSON-over-stdio, single persistent reader per stream (the documented per-job-reader corruption bug), `start_new_session=True`, lazy pool with idle reaping.
- `tts_engines/tts_xtts/manifest.json:16` — `"dependency_check": "external"`; `tts_engines/tts_xtts/requirements.txt` header — the whole file goes to xtts-env only, and its comment documents the "two packages happen to also exist server-side, incidental" hazard.
- `run.sh:6,172-177,318` — `sync_python_requirements "$TTS_ENV_DIR" ...`: the hand-provisioning being generalized (`python -m venv` + `pip install -r`, with torch extra-args).
- `design-docs/specs/plugin-contract.md` v1.8.0 changelog + §"Optional `dependency_check` field" (:311-344) — the existing contract: `"bundled"` (default, name-check vs server venv) vs `"external"` (opt-out, plugin's `check_env()` fully responsible); **documented known limitation**: the opt-out is all-or-nothing across the whole `requirements.txt`.
- `design-docs/plans/FUTURE_WORK.md:67-78` — the captured gap, unscoped, "needs a design pass on the conflict-detection heuristic first."

## 3. Design

### 3.1 Where the decision lives

At **preview time**, server-side, as an extension of the existing preview response. The two-phase flow was built exactly for "show the user what they're trusting before it lands"; requirements are already extracted there. Add a `dependency_analysis` block to the `preview_plugin_zip` / `preview_github_repo` return value, and make `confirm_staged_plugin()` accept an `env_mode` chosen by the caller. Nothing installs during preview — analysis is read-only against the running venv.

### 3.2 Conflict-detection heuristic (three-tier, resolver-backed)

Classify each staged plugin into one of `shared | isolated | blocked`, from three independent signals, most-authoritative first:

**Signal 1 — manifest declaration (authoritative).** Extend the versioned manifest field: `dependency_check: "bundled" | "external" | "managed"` (contract bump to 1.9.0). `"managed"` means "Studio owns a dedicated venv for me" — the plugin author's own declaration always wins, in either direction. `"external"` keeps its current hand-provisioned meaning (XTTS today). This is also how the design stays free of engine-ID branches: core keys off the manifest field, never the id.

**Signal 2 — real resolver check (conflicts).** The current `_check_dependencies` name-only check cannot see pin conflicts. Don't reimplement a resolver: run
`[sys.executable, -m, pip, install, --dry-run, --quiet, --report, <tmp.json>, -r, staged/requirements.txt]`
in the server venv (pip ≥ 23, offline-tolerant: on network failure, degrade to Signal 2b). Outcomes:
- resolver succeeds and the report shows **no already-installed package would change version** → no conflict;
- resolver succeeds but would **upgrade/downgrade an installed package** (compare report entries against `importlib.metadata.version()`) → CONFLICT — this is precisely the "corrupts the running venv mid-session" hazard, because the *current* server process already imported the old version;
- resolver fails (ResolutionImpossible) → CONFLICT.

*Signal 2b (fallback, no network / old pip):* per-requirement specifier check — reuse the name-extraction in `plugin_manifest.py:320-337`, then `packaging.specifiers.SpecifierSet.contains(installed_version)`. Installed-and-violates → CONFLICT; not installed → unknown-transitives (counts as "uncertain", see 3.3). This misses transitive conflicts, which is why it's the fallback, not the primary.

**Signal 3 — weight heuristic ("too heavy to share").** Two checks, either trips:
- a **known-heavy family list** shipped as data, not code (e.g. `app/tts_server/heavy_packages.json`: torch/torchvision/torchaudio/torchcodec, tensorflow, jax/jaxlib, onnxruntime-gpu, coqui-tts, nemo-toolkit, paddlepaddle, ctranslate2, vllm) — matched against the extracted package names, including transitives from the Signal-2 report when available. XTTS's own requirements (torch, coqui-tts, transformers) validate the list against the one real case;
- an **aggregate download-size threshold** from the pip `--report` (wheel sizes are in it): total > ~500 MB → heavy. Size is the tiebreaker for packages the list doesn't know.

**Decision table:**

| Signals | Verdict |
|---|---|
| manifest says `managed` | isolated (no further questions) |
| manifest says `external` | isolated-external (current XTTS path: refuse server-side install, per `server.py:403`) |
| CONFLICT (either resolver outcome) | **isolated** — never offer shared |
| heavy, no conflict | **isolated recommended**, shared allowed with explicit override |
| no conflict, not heavy, all resolvable | **shared recommended**, isolated allowed |
| resolver unavailable AND fallback saw pins it couldn't verify | **isolated** (uncertainty rule) |

**Uncertainty rule (the load-bearing asymmetry):** a wrong "isolate" costs disk and a few minutes of provisioning — fully recoverable. A wrong "share" can upgrade a package the live server process has already imported, corrupting the running venv irreversibly mid-session (the scenario's own words, confirmed by `server.py:424` installing into `sys.executable`'s env with no snapshot/rollback). Therefore every ambiguous case resolves to *isolated*, and the override direction is one-way: the user may always escalate shared→isolated, but isolated-because-CONFLICT can never be forced to shared through the UI (only by editing the plugin).

### 3.3 Decision flow (preview → confirm → provision)

1. **Preview** (`preview_plugin_zip`/`preview_github_repo`) additionally returns:
   ```json
   "dependency_analysis": {
     "verdict": "shared" | "isolated" | "isolated_required",
     "conflicts": [{"package": "transformers", "installed": "5.1.0", "required": "<5.0.0"}],
     "heavy_packages": ["torch", "coqui-tts"],
     "estimated_download_mb": 3200,
     "resolver": "pip-report" | "specifier-fallback"
   }
   ```
2. **UI** shows the verdict with evidence in the existing staging card; user picks (default = recommendation, constrained per the table). This is a trust decision like the staging flow itself — never silently auto-provision a multi-GB env.
3. **Confirm** (`POST /plugins/confirm/{token}`) gains a body `{"env_mode": "shared"|"isolated"}` (absent = analysis default, keeping the endpoint backward-compatible). For `shared`, behavior is today's: move dir, `load_plugins()`, then the existing install endpoint. For `isolated`:
   - move dir as today, but the loader marks the plugin `needs_setup` with a "provisioning environment" state;
   - stamp the choice into the installed plugin dir (`.studio/env.json`: `{"mode": "managed", "env_dir": ...}`) — the manifest belongs to the author, the choice belongs to this installation; the loader treats a `managed` manifest **or** an `env.json` stamp identically;
   - kick off provisioning as a background task (it's minutes-long; the confirm response returns immediately with the plugin in `needs_setup`, matching how heavy work is handled elsewhere).
4. **Provisioning** (new `app/tts_server/env_provisioner.py`, mirroring `run.sh:160-180`): `python -m venv <env_dir>` → `pip install --upgrade pip` → `pip install -r requirements.txt`, streaming progress; on success write a **completion marker file** (`.studio-env-complete` with the requirements hash) — adopting the XTTS lesson (`implementation.py:23`) that keying readiness on package dirs flaps mid-install. Env location: `<AUDIOBOOK_BASE_DIR>/engine-envs/<engine_id>/` (per-install state belongs under the app's storage root per `app/core/config.py` conventions, not `$HOME`; `engine_id` is already regex-constrained at `plugin_staging.py:155,253`, so it's path-safe). Failure → plugin stays `needs_setup` with the pip tail as `setup_message` (same shape as `server.py:432-440`); retry = re-hit the install endpoint, which for managed plugins targets the env's python instead of refusing.

### 3.4 Generalizing the XTTS bridge — what it actually is, and where the generic version goes

The menu's pointer to `bridge.py`/`bridge_remote.py`/`tts_client.py` is a red herring on inspection: that layer is the **Studio↔TTS-Server** HTTP bridge and is already engine-agnostic — it carries preview/confirm/install calls unchanged and needs zero modification. The XTTS isolation pattern lives **inside the plugin**: plugin code (light, importable) runs in the server venv, and only inference shells out to the isolated interpreter via `Popen([env_python, worker_script, "--serve"])` with JSON-over-stdio (`warm_worker.py`). That split is the thing to generalize:

- **Core provides the interpreter, nothing else.** The loader (`plugin_loader.py`), for any managed plugin, resolves `env_python = env_dir / ("Scripts/python.exe" if nt else "bin/python")` (same dual-platform shape as `implementation.py:20`) and exposes it to the plugin via the SDK context (e.g. `ctx.env_python: Path | None`) — a versioned SDK addition, not an env var, so it's discoverable and testable. Core never knows what the plugin runs there.
- **SDK ships the worker harness.** Extract `warm_worker.py`'s engine-neutral machinery into `studio_plugin_sdk` (e.g. `studio_plugin_sdk.subprocess_worker`): `WarmWorker`/`WarmWorkerManager` with the persistent-single-reader-per-stream design (the file's own docstring documents why per-job readers corrupt job 2+), `start_new_session=True`, lazy pool capped by `behavior.max_concurrent_workers`, idle reaping. A third-party author writes a `worker.py` speaking the documented stdio protocol and instantiates the manager with `ctx.env_python` — mirroring XTTS generically instead of by copy-paste.
- **Readiness.** For managed plugins, `_check_dependencies` (`plugin_manifest.py:303`) checks the *managed env's* marker + hash instead of the server interpreter — which also fixes plugin-contract 1.8.0's documented all-or-nothing limitation: the loader itself owns the external-env readiness check, so `check_env()` no longer has to.
- **XTTS migration is optional and orthogonal.** `~/xtts-env` stays `dependency_check: "external"` (hand-provisioned by `run.sh`, torch extra-args and all) until deliberately migrated; nothing in this design forces it. The GPU-flavored-torch problem (`run.sh:318` passes `$XTTS_TORCH_ARGS`) is real for managed provisioning too — allow an optional manifest `install_args` list, validated against an allowlist (`--index-url`, `--extra-index-url` to known hosts only), since arbitrary pip args from an untrusted manifest are an injection surface.

**Spec/contract obligations (binding per CLAUDE.md):** same-commit bumps to `plugin-contract.md` (new `dependency_check` value, `env.json` stamp, SDK context field), SDK version, and the preview/confirm API shape; `env.json` carries its own schema version.

## 4. Confidence + what would change it

**High confidence** (directly evidenced): the preview hook point; that shared-venv install is genuinely live-corrupting (in-process `sys.executable` pip with no rollback); that the current dep check is name-only and conflict-blind; that the reusable XTTS pattern is plugin-internal subprocess workers, not the app/engines bridge; the uncertainty-→-isolate asymmetry; manifest-field (not engine-ID) keying.

**Medium confidence** (defensible calls that could reasonably go other ways):
- `pip --dry-run --report` as the primary conflict detector — if the owner requires fully-offline preview, the specifier-fallback becomes primary and more cases resolve to "isolate by uncertainty";
- the 500 MB threshold and the heavy-list contents — tunable data, and deliberately shipped as data;
- background provisioning at confirm vs. a separate explicit "provision" step — I chose background-with-needs_setup to match existing long-work shapes, but an always-explicit second click is equally consistent with the trust-flow philosophy;
- env location under `AUDIOBOOK_BASE_DIR` vs. `$HOME` (XTTS precedent is `$HOME`, but that predates the storage-root conventions).

**Would change the design:** evidence that the TTS Server is expected to run on machines where spawning `python -m venv` is unavailable (frozen/embedded distribution) would force a different isolation mechanism entirely; a decision to sandbox plugin *code* (not just deps) would move the whole plugin — not just inference — into the subprocess and reshape the SDK contract.

## 5. What I couldn't determine

- Whether `pip >= 23` (for `--report`) is guaranteed in provisioned venvs — `run.sh:172` upgrades pip in xtts-env but I didn't verify the server venv's floor; the fallback path covers it either way.
- Windows parity beyond the interpreter path: whether `rename()` semantics and long-path issues in `confirm_staged_plugin` behave identically for a plugin dir that later grows an env stamp (env dir itself lives outside the plugin dir, so likely moot).
- Owner's disk-budget appetite (multiple torch installs at ~5 GB each) — the design surfaces `estimated_download_mb` at preview so the human decides, but no eviction/GC policy for orphaned `engine-envs/` dirs is specified beyond "delete with the plugin"; a sweep like `sweep_orphaned_staging_dirs` (`plugin_staging.py:75`) for envs whose plugin dir is gone is the obvious follow-up.
- Whether any second real plugin (beyond XTTS) with heavy/conflicting deps exists yet to validate the heuristic against — `tts_voxtral`'s requirements were not examined; the heavy-list should be checked against it before shipping.
