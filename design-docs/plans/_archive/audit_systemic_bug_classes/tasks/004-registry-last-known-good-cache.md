# 004 — Serve last-known-good registry manifests on transport failure

- **Status:** done
- **Workload:** Workload 1 — Central fixes
- **Severity / type:** critical · correctness
- **Effort:** S
- **Blocked by:** nothing
- **Blocks:** nothing

## Goal

A transient registry/discovery failure (TTS server restarting under the watchdog, HTTP
error) no longer makes valid persisted engines resolve to `""` mid-render; the last
successful `describe_registry` result is served instead.

## Why this matters

`a39b3a24` fixed one trigger (same-thread recursion guard blocking concurrent threads) but
not the root cause: `_get_registry_manifests` returns `[]` on ANY exception, and
`normalize_tts_engine` cannot distinguish "registry unavailable" from "engine not
registered". During a watchdog restart, a mixed render rebuilding chunk groups
(`plugins/synthesis_mixed/handler.py:225` at start, `:403` at stitch) gets `""` engines →
`'Voice requests must include engine_id'` failures, or shifted group boundaries → "No valid
segment audio was available to stitch".

## Context an executor needs

- `app/engines/voice_engines.py:12-26` — `_get_registry_manifests`: thread-local recursion
  guard (keep it), `bridge.describe_registry()` with bare `except Exception → []`.
- Consumers: `list_tts_engines()` (:75), `normalize_tts_engine` (:77+),
  `get_profile_engine` (`app/db/speakers.py:273`), `resolve_profile_engine`
  (`app/domain/chunk_groups.py:60`).
- Import-side-effect rule (`.agent/rules/modular_architecture.md`): module import must not
  trigger discovery; the cache must populate lazily on first successful call only.
- Recursion-guard return (`[]` when re-entrant) must NOT poison the cache.

## Target shape / contract

```python
_LAST_GOOD_MANIFESTS: list[dict] | None = None   # guarded by _DISCOVERY_LOCK

def _get_registry_manifests() -> list[dict]:
    # re-entrant call → [] (unchanged, never cached)
    # success → update _LAST_GOOD_MANIFESTS, return fresh result
    # exception → return _LAST_GOOD_MANIFESTS if set, else []
```

An empty-but-successful registry (no plugins installed) is a valid result and may be cached;
only *exceptions* fall back. Cache write/read under the existing `_DISCOVERY_LOCK`.

## Steps

1. Implement the cache in `app/engines/voice_engines.py` as above.
2. Tests (R1, mock `create_voice_bridge` per R2), beside
   `tests/engines/test_voice_engines_discovery.py`:
   - bridge succeeds once, then raises → second call returns the cached manifests (red pre-fix);
   - `normalize_tts_engine('voxtral')` resolves correctly during the simulated outage (red pre-fix);
   - no prior success + failure → `[]` (unchanged behavior);
   - re-entrant guard still returns `[]` and does not overwrite the cache.
3. Ensure test isolation: reset the module cache in test setup/teardown (the conftest resets
   state stores, not module globals — expose a small `_reset_registry_cache_for_tests()` or
   reset via monkeypatch).

## Acceptance criteria

- [ ] New tests red pre-fix, green post-fix; existing discovery-race tests
      (`tests/engines/test_voice_engines_discovery.py`) still pass.
- [ ] Full backend suite green (watch for cross-test leakage via the new module global).

## Out of scope

Changing `normalize_tts_engine`'s validation semantics; watchdog restart logic; making
`describe_registry` itself retry.
