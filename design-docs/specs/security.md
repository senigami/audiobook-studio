# Security

```
spec_version: 1.4.0
status: active
updated: 2026-08-25
sources:
  - app/utils/pathing.py
  - app/core/security.py
  - app/api/routers/system.py
  - app/api/web.py
  - app/api/tts_api.py
  - app/tts_server/server.py
  - app/tts_server/plugin_staging.py
  - tts_engines/tts_xtts/plugin/core/xtts_inference.py
  - app/domain/voices/bundles.py
  - app/api/routers/projects_assembly.py
  - app/orchestration/tasks/assembly.py
  - app/utils/text/textops_helpers.py
  - app/api/routers/voices_metadata.py
  - app/api/routers/voices_huggingface.py
```

> **TL;DR:** Every path from user input is untrusted and MUST pass through a recognized barrier helper; API key checks use timing-safe comparison; exception text never reaches HTTP responses.

## Changelog

| Version | Date       | Change                  |
|---------|------------|-------------------------|
| 1.4.0   | 2026-08-25 | **S16 (assembly output-path escape, #218):** an untrusted project display name flowed unsanitized into the assembly output filename (`app/api/routers/projects_assembly.py`) and from there into ffmpeg's read directory (`app/orchestration/tasks/assembly.py`, `input_folder = output_path.parent`) — a `../`-laden or absolute project name could steer both outside the project's storage root. Fixed with a new path-safe-stem helper (`safe_path_stem`, `app/utils/text/textops_helpers.py`) feeding the existing `secure_join_flat` barrier for the on-disk filename only — the display title itself keeps flowing unsanitized into job/queue metadata — plus a defense-at-the-point-of-action containment check in `AssemblyTask.run()` via `StorageManager.is_safe()` immediately before ffmpeg is invoked, regardless of who built `output_path`. **S17 (plugin zip-bomb ceilings, #219a):** `/plugins/import` and `/plugins/preview` (`app/tts_server/server.py`, `app/tts_server/plugin_staging.py`) had no size ceiling anywhere on the upload path — an unbounded `file.read()` followed by `extractall()` with no cap on declared uncompressed size or member count. Added three named ceilings (200 MB upload / 2 GB uncompressed / 10,000 members), enforced before extraction, rejecting with 413 (see Plugin Zip Import Security below). **S18 (error-body path leak, #219b):** `str(OSError)` embeds the full filesystem path it failed on; the icon-save handler in `app/api/routers/voices_metadata.py` forwarded it directly into the HTTP response, violating the existing Status Payload Rule below. Fixed there, plus two latent sites of the same shape (`voices_metadata.py`'s metadata-patch handler and `voices_huggingface.py`'s import handler, both wrapping the same `update_voice_metadata` `RuntimeError`) that are not currently leaking a path but were one message change away from it. |
| 1.3.0   | 2026-07-16 | **S13 (deserialization RCE):** the XTTS engine loaded latent `.pth` files with `torch.load(..., weights_only=False)` at four sites (`tts_engines/tts_xtts/plugin/core/xtts_inference.py`), unpickling arbitrary objects from attacker-supplied voice-bundle `latent.pth` → RCE on first synthesis. All four now use `weights_only=True`. **S14 (LAN gating of management writes):** `lan_protection_middleware` extended beyond `/api/v1/tts` to gate the dangerous mutating management endpoints (voice-bundle import, HuggingFace import, settings writes) for non-loopback clients unless `lan_binding_enabled`; reads/UI stay reachable. Reverses the prior "internal routes never LAN-gated" invariant. **S15 (voice_ref hardening):** `_validate_voice_ref` (`app/api/tts_api.py`) now uses the realpath-resolving `safe_join` barrier (was lexical `normpath`, which missed symlink escape) and rejects caller-supplied `.pth` refs (defense-in-depth for S13). |
| 1.2.4   | 2026-07-09 | S12: `/api/v1/tts/docs` and `/api/v1/tts/openapi` were reachable without `verify_api_key`/`rate_limit` (FastAPI's auto-generated docs/openapi routes bypass constructor-level `dependencies=[...]`). Fixed by disabling the auto-generated routes and serving them as ordinary router routes on the sub-app, which do inherit the dependencies. Scope note added above. |
| 1.2.3   | 2026-06-21 | S6: Added WebSocket Origin check to `/ws` to prevent cross-site WebSocket hijacking (CSWSH). Absent Origin → allowed (non-browser clients); present Origin → allowed only if host is localhost/127.0.0.1/[::1] or matches the server's own Host header; otherwise close(1008). LAN exposure note documented. |
| 1.2.2   | 2026-06-21 | Documented the rate limiter's known limitations (S7): in-memory/per-process (resets on restart, not shared across workers) and IP-keyed (shared behind NAT, no per-API-key bucketing). Behavior unchanged — documentation only. |
| 1.2.1   | 2026-06-16 | Code brought into compliance with the no-path-leak invariant: plugin import/preview/install error bodies (`app/tts_server/server.py`) no longer echo the submitted zip member name, `engine_id`, or target folder path — they now return generic messages. (Invariant text unchanged.) |
| 1.2.0   | 2026-06-16 | Recognized-barrier section updated to acknowledge both normpath+startswith and abspath(realpath)+startswith forms; `is_relative_to` carve-out added permitting it as secondary/defense-in-depth barrier |
| 1.1.0   | 2026-06-15 | Added GitHub plugin repository preview security invariants |
| 1.0.0   | 2026-06-10 | Initial canonical spec  |

---

## Path Safety

### Threat model

Any value originating from request data, database columns, uploaded filenames, or user-editable names MUST be treated as untrusted. An attacker-controlled path component can escape the intended storage root via `../` sequences or absolute prefixes.

### Recognized barrier patterns

Two forms are accepted and considered CodeQL-safe:

**Form A — normpath + startswith** (used by `contained_path` at `app/utils/pathing.py:13–15`):

```python
os.path.normpath(candidate).startswith(base + os.sep)
```

**Form B — abspath(realpath) + startswith** (used by `safe_join` at `:40–44`, `secure_join_flat` at `:84–86`, and `find_secure_file` at `:68–70`):

```python
base_dir = os.path.abspath(os.path.realpath(root))
candidate = os.path.abspath(os.path.realpath(os.path.join(base_dir, value)))
candidate.startswith(base_dir + os.sep)
```

Both forms are recognized by CodeQL's `py/path-injection` model as sanitizers when the result is used as a barrier between the untrusted value and any I/O operation.

### Path helper functions (`app/utils/pathing.py`)

| Helper | Input contract | Raises on violation |
|--------|---------------|---------------------|
| `contained_path(base, *parts)` | Joins parts under base; rejects escape | `ValueError` |
| `safe_basename(value)` | Extracts filename only; rejects empty/dot | `ValueError` |
| `safe_join(root, value)` | Joins relative path under root with containment check | `ValueError` |
| `safe_join_flat(root, value)` | Single filename only; rejects `/` or `\` | `ValueError` |
| `find_secure_file(directory, filename)` | Enumerates via `iterdir()`; matches by `entry.name` | Returns `None` |
| `secure_join_flat(root, filename)` | Single filename; explicit containment check | `ValueError` |

### Invariants

- MUST use a helper from `app/utils/pathing.py` before constructing any filesystem path from untrusted input.
- MUST NOT call `open()`, `os.path.join()`, or `Path()` directly on untrusted input without first passing through a barrier helper.
- MUST NOT use `Path.resolve().is_relative_to()` as the **primary** containment barrier for direct file I/O on untrusted strings (CodeQL will flag it as unsanitized). It is PERMITTED as a **secondary / defense-in-depth** check after a primary barrier has already been applied — for example, as a post-extraction walk guard after a zip or clone staging operation. Accepted call sites: `app/tts_server/server.py:928`, `app/tts_server/server.py:1087`, `app/api/tts_api.py:161`, `app/api/tts_api.py:251`, `app/orchestration/tasks/assembly.py` (`AssemblyTask.run()`, via `StorageManager.is_safe()`).
- The recognized pattern MUST appear between the untrusted value and any I/O operation on that value.
- An untrusted **display** value that must also appear in an on-disk filename (e.g. a project/book title feeding an assembly output name) MUST be reduced to a path-safe stem — see `safe_path_stem` (`app/utils/text/textops_helpers.py`), which composes the existing `safe_filename` with stripping of `:` and `os.sep`/`os.altsep` — before that stem is handed to a barrier helper. The untrusted value itself MUST NOT be mangled where it only ever flows into metadata/display fields (job titles, queue rows) — sanitize the filename derivation, never the display copy.
- A task or handler that executes I/O against a path it did not itself build (e.g. an `output_path` constructed by an upstream router) SHOULD re-verify containment immediately before that I/O, rather than relying solely on the barrier the caller already applied — defense at the point of action. `AssemblyTask.run()` does this via `StorageManager.is_safe()` before invoking ffmpeg.

---

## API Key Authentication

### Scope

`verify_api_key()` is an HTTPBearer FastAPI dependency applied to the external TTS API sub-app (`/api/v1/tts`) only. It is NOT applied to Studio's own internal routes.

This scope includes the sub-app's own OpenAPI docs (`/api/v1/tts/docs`) and schema (`/api/v1/tts/openapi`). FastAPI's `docs_url`/`openapi_url` auto-registered routes are added via plain Starlette `add_route()`, which bypasses the FastAPI dependency-injection system — `dependencies=[...]` passed to the `FastAPI()` constructor does **not** protect them. `app/api/tts_api.py` therefore disables the auto-generated routes (`docs_url=None`, `openapi_url=None`, `redoc_url=None`) and serves `/docs`/`/openapi` itself as ordinary routes on the sub-app's router, so they inherit `verify_api_key` + `rate_limit` like every other route (found + fixed 2026-07-09; see `design-docs/plans/active/final_release/12_security_and_opportunities.md` S12).

### Behavior

| Condition | Result |
|-----------|--------|
| `tts_api_enabled` setting is `False` | 403 — checked at request time, not import time |
| `tts_api_key` setting is empty | Open access (local-only default; no key required) |
| Key present but does not match (or missing when a key is configured) | 401 |
| Key matches | Pass through to handler |

### Invariants

- MUST compare keys using `hmac.compare_digest()`.
- MUST NOT use `==` for API key comparison (timing oracle).
- `tts_api_enabled` MUST be read from current settings at request time, not cached at startup.

---

## Identifier Validation

`validate_safe_identifier(*, value, field_name)` (keyword-only args) enforces the pattern `^[a-z0-9_-]{1,64}$` and raises `ValueError` on mismatch.

- MUST be applied to any identifier that reaches a filesystem path component (engine IDs, plugin IDs, voice bundle names).
- MUST NOT be used as a substitute for path containment checks — use both when applicable.

---

## Rate Limiting

`rate_limit()` is a FastAPI dependency using a sliding-window algorithm.

| Parameter | Value |
|-----------|-------|
| Window | 60 seconds |
| Limit | 30 requests per client IP |
| Exceeded response | HTTP 429 |

### Documented limitations (S7)

Acceptable for the local-first 2.0 release; **not** a substitute for an edge rate limiter if Studio is exposed publicly:

- **In-memory, per-process.** Counters are **reset on restart** and are **not shared** across worker processes — a restart (or multi-worker deployment) clears/splits the limit.
- **Keyed by client IP.** Callers behind one NAT/proxy/VPN share a bucket (one client can throttle neighbours); a client rotating IPs is not effectively limited. There is no per-API-key bucketing.

### Invariants

- MUST be applied to all external TTS API routes.
- MUST NOT be applied to Studio's own UI routes (no user-facing rate cap on local traffic).

---

## Settings Redaction

`_redact_settings()` in `app/api/routers/system.py` censors sensitive settings values before they are returned to the frontend.

### Redaction rules

Redaction is driven by an explicit allowlist of field names, `_SECRET_FIELDS` (currently `{"tts_api_key"}`) — not by substring matching on key names.

| Trigger | Replacement |
|---------|-------------|
| Field name is in `_SECRET_FIELDS` and value is non-empty | `"***"` |
| Field name is in `_SECRET_FIELDS` and value is empty | Empty string `""` |

### Invariants

- MUST NOT write the redacted placeholder `"***"` back to the settings store (round-trip guard).
- Any settings write endpoint MUST discard incoming values that equal `"***"`.

---

## Plugin Zip Import Security

Plugin zip archives submitted to the TTS server go through validation in `app/tts_server/server.py` and `app/tts_server/plugin_staging.py`.

### Phase 0 — size ceilings (before anything else touches the archive)

Named module-level constants in `app/tts_server/plugin_staging.py`:

| Check | Ceiling | Constant | Action on failure |
|-------|---------|----------|--------------------|
| Upload body size | 200 MB | `MAX_PLUGIN_UPLOAD_BYTES` | 413, enforced by reading capped at `MAX_PLUGIN_UPLOAD_BYTES + 1` bytes so an oversized upload is never fully buffered |
| Total declared uncompressed size | 2 GB | `MAX_PLUGIN_UNCOMPRESSED_BYTES` | 413, checked (`_reject_oversized_zip`) before `extractall()` |
| Member count | 10,000 | `MAX_PLUGIN_ZIP_MEMBERS` | 413, checked before `extractall()` |

The uncompressed-size check sums `ZipInfo.file_size` (the central-directory declared size) across `zf.infolist()`. This is a real bound, not just a heuristic: Python's `zipfile` module enforces `file_size` as the stop condition when reading/extracting a member, so a member cannot decompress to more than its declared size through this module. Both `import_plugin_zip` and `preview_plugin_zip` (the /plugins/import and /plugins/preview code paths) call `_reject_oversized_zip()` immediately after opening the archive, before `manifest.json` or any other member is read.

### Phase 1 — member name validation (before extraction)

| Check | Action on failure |
|-------|------------------|
| Member name starts with `/` | Reject entire zip |
| Member name contains `\` | Reject entire zip |

### Phase 2 — post-extract containment walk

After extraction to a staging directory, every extracted file MUST have its resolved path verified to start with `staging_dir`. Any file that escapes the staging root causes the entire import to be aborted and the staging directory deleted.

### Error message policy

| Destination | Allowed content |
|-------------|----------------|
| HTTP response body to caller | Generic fixed-string error only (no paths, no exception text) |
| Server log (`logger.exception`) | Full exception details permitted |
| `dev.enabled=True` manifest (localhost only) | Full exception details permitted for plugin authors |

### Invariants

- MUST NOT include filesystem paths in any HTTP error response from plugin import.
- MUST NOT include `type(exc).__name__` or `str(exc)` in any HTTP error response from plugin import.
- Post-extract walk MUST happen even if phase 1 passed (defense in depth).
- MUST reject an oversized upload or zip bomb with 413 (not 500, and not a silent hang) before extraction runs.

## Plugin GitHub Repository Preview Security

GitHub repository plugin previews submitted to the TTS server go through a clone-and-stage
flow in `app/tts_server/server.py`.

### URL validation

| Check | Action on failure |
|-------|------------------|
| URL is not `https://github.com/<owner>/<repo>` or `.git` | Reject request |
| URL contains credentials, query string, or fragment | Reject request |
| URL points to another host or protocol | Reject request |

### Clone and staging

| Check | Action on failure |
|-------|------------------|
| `git clone --depth 1` exits non-zero | Delete staging directory and reject request |
| Clone exceeds timeout | Delete staging directory and reject request |
| Cloned repository contains any symlink | Delete staging directory and reject request |
| Manifest fails the loader's manifest contract | Delete staging directory and reject request |

### Invariants

- MUST NOT import or execute plugin code before the user confirms the trust modal.
- MUST validate the preview manifest with the same contract used by plugin discovery.
- MUST NOT return raw subprocess output, filesystem paths, or exception-derived manifest
  details in HTTP response bodies.
- MAY log controlled diagnostic details server-side for local debugging.

---

## Status Payload Rule

Exception-derived content MUST NOT flow into HTTP status payloads anywhere in the application.

**Forbidden patterns in response bodies:**

```python
# MUST NOT do this
{"status": "error", "message": str(exc)}
{"status": "error", "message": type(exc).__name__}
```

**Required pattern:**

```python
logger.exception("Descriptive context message")
return {"status": "error", "message": "A fixed literal string"}
```

This rule applies to all routers, task handlers, and middleware. It is not scoped to plugin import alone.

---

## WebSocket Origin Check (S6)

The `/ws` WebSocket endpoint in `app/api/web.py` enforces an Origin check on upgrade to prevent cross-site WebSocket hijacking (CSWSH).

### Behavior

| Condition | Result |
|-----------|--------|
| `Origin` header absent | ALLOW — non-browser clients (native apps, CLI tools) do not send Origin; the CSWSH attack requires a browser |
| `Origin` host is `localhost`, `127.0.0.1`, or `[::1]` | ALLOW |
| `Origin` host matches the server's own `Host` header host | ALLOW (same-origin request) |
| `Origin` present and host does not match any of the above | REJECT — `close(code=1008)` and return before accepting |

### Implementation

`_ws_origin_allowed(origin, host_header)` parses the Origin URL with `urllib.parse.urlparse`, extracts the hostname, and compares against the loopback set and the server's own Host header (port stripped).

### LAN exposure note

Studio is a local-first app designed to listen on loopback. When `lan_binding_enabled` is `True` (LAN mode), the server may bind on a LAN address. In that case, the server's own `Host` header received from a LAN client will carry the LAN hostname/IP, which is permitted by the "matches server's Host header" rule. A page served from a different LAN origin is still blocked. The Origin check does **not** replace network-level access controls for a public deployment.

### Invariants

- MUST check Origin on every `/ws` upgrade, before `manager.connect()`.
- MUST allow absent Origin (non-browser clients).
- MUST close with code 1008 (policy violation) on a rejected cross-origin request.
- MUST NOT hardcode an explicit allowlist beyond loopback — same-origin is determined dynamically from the `Host` header.

---

## LAN Binding Protection

`lan_protection_middleware` in `app/api/web.py` guards both the external TTS API and a small set of dangerous mutating management endpoints against unintended LAN exposure. The socket may still bind `0.0.0.0` (so the UI and read endpoints remain reachable from other machines); protection is enforced per-request at the application layer, not by changing the bind host.

The LAN-gated management prefixes (`_LAN_GATED_MGMT_PREFIXES`) are the untrusted-input write paths — voice-bundle import (the S13 RCE vector), HuggingFace import (remote fetch + write), settings writes, and the **entire `/api/engines/` mutating surface** (import/preview/preview_github/confirm install and execute plugin code inside the TTS server — an RCE unmitigated by `weights_only`; install/delete/settings/calibrate/test/verify are engine-admin ops). The whole `/api/engines/` prefix is gated rather than enumerating individual routes, so no dynamic-path member (e.g. `/api/engines/{engine_id}/install`) can slip the matcher. All prefixes are gated only for **mutating methods** (POST/PUT/PATCH/DELETE); GET/read traffic is never gated.

| Setting | Behavior |
|---------|----------|
| `lan_binding_enabled` = `False` (default) | Non-loopback clients are rejected (403) on the external TTS API (all methods) AND on mutating requests to the gated management prefixes. Reads/UI remain reachable. |
| `lan_binding_enabled` = `True` | LAN clients permitted to reach the external TTS API and the gated management endpoints. |

### Invariants

- MUST check `lan_binding_enabled` at request time (not cached at startup).
- MUST gate the external TTS gateway sub-app (all methods) and the mutating management write endpoints in `_LAN_GATED_MGMT_PREFIXES`; MUST NOT gate read (GET) traffic or the general UI/API surface (so a LAN operator can still browse).
- Loopback clients (`127.0.0.1`, `localhost`, `::1`, `testclient`) are never gated.
- Default MUST be `False` (closed by default; user opts in to LAN exposure).

---

## Deserialization Safety (S13)

Voice bundles are untrusted input (a `.voice.zip`/`.asvoice` a user may receive and import), and `import_voice_bundle` (`app/domain/voices/bundles.py`) writes their `latent.pth` payload to disk. `latent.pth` is a pickle; loading it with `torch.load(..., weights_only=False)` unpickles arbitrary objects and executes any `__reduce__` payload — an RCE the first time the imported voice is synthesized.

### Invariants

- Any `torch.load` of a `.pth`/`.bin` that could originate from an imported bundle, an API-supplied ref, or any non-self-produced source MUST pass `weights_only=True` (or use `safetensors`). `weights_only=False` is prohibited on those paths.
- XTTS latent payloads are dicts of tensors (`gpt_cond_latent`, `speaker_embedding`) plus an optional `profile_fingerprint` string — all supported by `weights_only=True`, so the safe loader does not break legitimate bundles.
- API-supplied `voice_ref` values MUST NOT carry a `.pth` extension (the engine resolves latent files internally; a caller never needs to name one).
- **Future:** migrate the on-disk latent format to `safetensors` (structurally incapable of code execution) under a versioned voice-bundle contract bump. Tracked as a follow-up; `weights_only=True` is the interim guarantee.

## CodeQL Compliance

CI runs CodeQL security scanning (`.github/workflows/codeql.yml`). The shape described in this spec — `safe_join` / `secure_join_flat` / `find_secure_file` barriers, `hmac.compare_digest`, fixed-literal error messages — MUST be preserved to keep CodeQL clean. Deviating from recognized barrier patterns will produce `py/path-injection` findings.
