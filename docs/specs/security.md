# Security

```
spec_version: 1.2.2
status: active
updated: 2026-06-21
sources:
  - app/utils/pathing.py
  - app/core/security.py
  - app/api/routers/system.py
  - app/api/web.py
  - app/api/tts_api.py
  - app/tts_server/server.py
```

> **TL;DR:** Every path from user input is untrusted and MUST pass through a recognized barrier helper; API key checks use timing-safe comparison; exception text never reaches HTTP responses.

## Changelog

| Version | Date       | Change                  |
|---------|------------|-------------------------|
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
- MUST NOT use `Path.resolve().is_relative_to()` as the **primary** containment barrier for direct file I/O on untrusted strings (CodeQL will flag it as unsanitized). It is PERMITTED as a **secondary / defense-in-depth** check after a primary barrier has already been applied — for example, as a post-extraction walk guard after a zip or clone staging operation. Accepted call sites: `app/tts_server/server.py:928`, `app/tts_server/server.py:1087`, `app/api/tts_api.py:161`, `app/api/tts_api.py:251`.
- The recognized pattern MUST appear between the untrusted value and any I/O operation on that value.

---

## API Key Authentication

### Scope

`verify_api_key()` is an HTTPBearer FastAPI dependency applied to the external TTS API sub-app (`/api/v1/tts`) only. It is NOT applied to Studio's own internal routes.

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

Plugin zip archives submitted to the TTS server go through a two-phase validation in `app/tts_server/server.py`.

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

## LAN Binding Protection

`lan_protection_middleware` in `app/api/web.py` guards the external TTS API against unintended LAN exposure.

| Setting | Behavior |
|---------|----------|
| `lan_binding_enabled` = `False` (default) | External TTS API (`/api/v1/tts`) rejects requests from non-localhost origins |
| `lan_binding_enabled` = `True` | LAN clients permitted to reach the external TTS API |

### Invariants

- MUST check `lan_binding_enabled` at request time (not cached at startup).
- MUST NOT apply LAN protection to Studio's own internal UI/API routes — only to the external TTS gateway sub-app.
- Default MUST be `False` (closed by default; user opts in to LAN exposure).

---

## CodeQL Compliance

CI runs CodeQL security scanning (`.github/workflows/codeql.yml`). The shape described in this spec — `safe_join` / `secure_join_flat` / `find_secure_file` barriers, `hmac.compare_digest`, fixed-literal error messages — MUST be preserved to keep CodeQL clean. Deviating from recognized barrier patterns will produce `py/path-injection` findings.
