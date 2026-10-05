# ADR-0006: Explicit Boot Sequence (No Import-Time Side Effects)

**Date:** 2026-06-10  
**Status:** Accepted  
**Deciders:** Studio owner

## Context

Early Studio code registered listeners, started threads, and mutated global settings
at module import time. This caused several problems:

- **Test isolation failure:** importing a module in a test triggered side effects
  (thread spawns, DB writes) even when those effects were irrelevant to the test.
  Tests needed elaborate teardown to undo import-time state mutations.
- **Unpredictable startup order:** Python's import order is not always obvious, and
  modules that depend on each other's import-time side effects created fragile
  initialization races.
- **Hard-to-diagnose startup bugs:** when startup failed, the traceback pointed into
  import machinery rather than explicit initialization code.

## Decision

`app/core/boot.py` is the single place for startup wiring. `boot_studio()` runs DB
migrations then `boot_tts_server()` (orphan cleanup + watchdog start). It is called
from `app/api/web.py`'s `startup_event` in a background thread.

**The rule:** importing any module in the `app/` package MUST NOT start threads,
register listeners, mutate global settings, or reconcile state. All such side effects
belong behind `boot_studio()`.

`app/db/__init__.py` no longer auto-migrates on import. Migrations are invoked
explicitly by `boot_studio()`.

`boot_studio()` is idempotent — calling it more than once (e.g. in tests) is safe.

## Consequences

### Positive
- Tests can import any module freely without triggering side effects.
- Startup sequence is explicit, readable, and debuggable as ordinary function calls.
- Boot failures have clear tracebacks pointing to `boot.py`, not import machinery.

### Negative / Trade-offs
- Developers must remember to put new startup wiring in `boot.py`, not at module level.
  This is a convention that static analysis cannot fully enforce.
- Modules that previously "self-started" now require the caller to invoke boot.

### Neutral
- `app/core/boot.py` is the authoritative startup sequence document — reading it gives
  a complete picture of what happens at app startup.
