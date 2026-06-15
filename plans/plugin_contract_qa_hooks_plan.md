# Plan — sanitize_text categories & check_output interface (plugin contract QA hooks)

*Status: HISTORICAL DESIGN CONTEXT. The release board records sanitize categories/overrides and check_output as complete in `plans/final_release/road_to_v2.md` Stage 3. Keep this file as rationale and implementation-order history, not as an active checklist.*

---

## Item 1 — Per-category `sanitize_text`

### Current reality (verified)

- `sanitize_text()` in `app/utils/text/textops_cleaning.py:200-229` is monolithic; it calls `clean_text_for_tts()` and then hardens (ASCII-strip, terminal punctuation). Six de-facto categories are embedded: **quotes** (curly→straight→strip doubles), **acronyms** (dot collapsing), **fractions** (`3/4`→"3 out of 4"), **dashes-ellipses** (em-dash→comma, …→period), **punct-spacing**, **unicode-ascii** + **terminal-punct** hardening.
- Engines opt in via the manifest feature flag `"sanitize_text"` (only XTTS declares it — `plugins/tts_xtts/manifest.json:31`), applied all-or-nothing behind `has_behavior(engine_id, "sanitize_text")` at `app/api/routers/generation.py:198-199` and `plugins/tts_xtts/plugin/studio/standard_handler.py:85-86`, gated by the job's `safe_mode`.
- The only user control is the binary `safe_mode` toggle (`plugins/tts_xtts/settings_schema.json:47-52`).
- The SDK plan (`plans/final_release/02_plugin_communication_contract.md:572`) wraps it as `ctx.sanitize_text(text)` — still category-blind.

### Design

**1. Decompose into named category functions** (`textops_cleaning.py`, pure refactor first):
```python
SANITIZE_CATEGORIES = {
    "quotes":        _sanitize_quotes,
    "acronyms":      _sanitize_acronyms,
    "fractions":     _sanitize_fractions,
    "dashes":        _sanitize_dashes_ellipses,
    "punct_spacing": _sanitize_punct_spacing,
    "ascii":         _sanitize_ascii,           # unicode strip
    "terminal":      _ensure_terminal_punct,
}
DEFAULT_CATEGORY_ORDER = ("quotes","acronyms","fractions","dashes","punct_spacing","ascii","terminal")

def sanitize_text(text: str, categories: Sequence[str] | None = None) -> str:
    # None → all categories in order (exact current behavior — golden tests must prove equality)
```
Red-first golden test: a corpus of ~20 nasty strings through old vs new `sanitize_text()` must be byte-identical (write the corpus + expected outputs BEFORE refactoring, from current behavior).

**2. Manifest declaration.** Extend the behavior block (validated by `plugin_loader._validate_manifest`):
```json
"behavior": { "features": ["sanitize_text"],
              "sanitize_categories": ["quotes","dashes","ascii","terminal"] }
```
Semantics: feature flag = participates in safe-mode sanitization; `sanitize_categories` = which categories (absent → all, preserving today's XTTS behavior). Unknown category name → manifest load error (fail-loud per versioned-contracts directive). Bump plugin-contract spec (`docs/specs/plugin-contract.md`) minor version + changelog row; manifest stays `studio_tts_manifest: "1.0"` (additive optional field — confirm spec's compat rule allows additive at 1.0, else bump to 1.1 and update `SUPPORTED_MANIFEST_VERSION` to accept both).

**3. Resolution chokepoint** (`app/engines/behavior.py` — the existing behavior registry, NOT the callers): new `get_sanitize_categories(engine_id) -> tuple[str,...] | None` reading the manifest. The two call sites change from `sanitize_text(t)` to `sanitize_text(t, get_sanitize_categories(engine_id))`. Mixed handler already routes per-group by engine — each group sanitizes with its own engine's categories (today it uses the group engine's flag; keep that, add categories).

**4. User per-category overrides — DECIDED 2026-06-11: per-engine granularity.** Settings-schema injection: the loader synthesizes a `sanitize_overrides` object property into each declaring engine's settings schema (checkbox per declared category, default on), stored in the engine's settings store; resolution order = manifest categories ∩ user-enabled. UI comes through `JsonSchemaForm`.

**5. Tests:** golden equality (step 1); per-category unit tests (each category transforms its target and ONLY its target); manifest validation (unknown category rejected); behavior resolution (declared subset honored, absent → all); mixed-render integration (two engines, different categories, each group sanitized accordingly — extend `plugins/synthesis_mixed/tests/test_mixed_handler.py`).

**Execution order:** 1 (refactor+golden) → 2 (manifest+spec) → 3 (resolution) → 4 (overrides+UI). All decisions for this item are resolved; each step is a checkpoint commit.

---

## Item 2 — `check_output` engine QA hook

### Current reality (verified)

- Specified in the contract plan (`plans/final_release/02_plugin_communication_contract.md:175-201`): optional server-side method `check_output(req: TTSRequest, result: TTSResult) -> tuple[bool, str]`, default accept-all, intended for duration/silence/truncation/speaker-mismatch QA.
- Today's post-render "validation": file-exists + move in `app/jobs/handlers/bridge_helpers.py:81-99`, duration probe via `app/engines/audio_ops.py:52` (returns 0.0 on failure — silent). Phase-12 plan (`plans/phases/phase_12_polish_and_cleanup.md:47-48`) wanted reconcile to call it.

### Design

**1. SDK surface** (`app/engines/voice/base.py` + types in `sdk.py`): add `check_output(self, req, result) -> tuple[bool, str]` to the engine ABC with the default accept-all implementation, exactly per the contract doc. Bump `docs/specs/plugin-contract.md` (additive optional method; same version rule as above).

**2. Server invocation point** — `app/tts_server/server.py` `/synthesize`, immediately after a successful `synthesize()`: call `plugin.engine.check_output(req, result)`; on `(False, reason)`:
- delete the rejected artifact (it must never enter the validated-artifact cache — immutability rule),
- return a structured failure `{ok: false, error: "output_rejected", reason}`.
Failure-isolate the hook itself (a crashing `check_output` logs + accepts — QA must never convert a good render into a failure by raising; mirror the `record_engine_sample` isolation pattern).

**3. Studio-side handling** (`bridge_helpers.generate_via_bridge`): map `output_rejected` to a distinguishable `EngineBridgeError` subclass so the orchestrator can mark the job failed with the engine's reason verbatim (no automatic re-queue in v1 — **DECIDED 2026-06-11: fail-with-reason, no auto-retry**; original note: auto-retry-once on rejection is tempting but risks loops; my lean is fail-with-reason first, add bounded retry as a follow-up once we see real rejection reasons).

**4. First real implementation — XTTS duration sanity** (proves the hook): reject if output duration is 0, or < `chars / 60` seconds (absurdly fast = truncation; threshold conservative, configurable via plugin settings). Voxtral/mixed keep the default.

**5. Tests:** ABC default accepts; server rejects + deletes artifact on (False, reason) (R1: assert pre-hook code shipped the bad artifact); crashing hook isolated; XTTS duration rule unit tests with synthetic WAVs (fixtures exist in plugin tests); end-to-end through the bridge mock asserting the error class + reason propagation.

**Execution order:** 1 (ABC+spec) → 2 (server) → 3 (studio error path) → 4 (XTTS impl) → 5 woven throughout. The retry policy is resolved: fail with reason, no automatic retry in v1.

---

## Shared notes

- Both changes are **additive** to the plugin contract — existing third-party plugins keep working untouched (defaults preserve current behavior). That's the versioned-contracts directive working as intended.
- Neither touches the orchestrator's marker pipeline (recently stabilized) — invocation points are the TTS server and the bridge edge.
- Combined estimate: sanitize categories ≈ one evening; check_output hook ≈ one evening. No owner-gated questions remain in this plan.
