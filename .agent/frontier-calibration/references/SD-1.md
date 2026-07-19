# SD-1 reference — engine-class admission gate: default OFF or ON?

## The question restated

`.agent/lessons/INDEX.md` (always-on lesson 1, line 7) says `_engine_class_admission_enabled()`
"still defaulted OFF … so every synthesis claim kept routing through the legacy single-flight
exclusive gate and renders stayed genuinely sequential." The live code appears to say default ON.
Which is authoritative now — is the lesson stale, or did the code regress?

## The gate's actual default (ground truth, quoted)

`app/orchestration/scheduler/resources.py:67-68`:

```python
    raw = os.environ.get("ENGINE_CLASS_ADMISSION", "").strip().lower()
    return raw not in {"0", "false", "no", "off"}
```

With `ENGINE_CLASS_ADMISSION` unset, `raw` is `""`, which is **not** in the disable set, so the
function returns **True**. The default is unambiguously **ON**. The docstring agrees
(`resources.py:52-54`): "Default ON (2026-07-06, owner directive): parallel rendering is the
shipped default end-to-end now… active unless explicitly disabled." Only an explicit
`"0"/"false"/"no"/"off"` disables it; any other value, including unset, enables it
(`resources.py:63-64`).

Therefore parallel rendering (per-engine-class semaphore admission) is **live by default**;
renders are not sequential unless someone explicitly sets the env var to a disable value.

## Verdict: stale lesson, not code regression — but read the lesson carefully

- Git dates the flip: commit `7c3d5b9d` (2026-07-06) — "fix: ENGINE_CLASS_ADMISSION now defaults
  on (owner directive)". The current default-ON logic has been in place since then (later touched
  only cosmetically by `b87e1890`, 2026-07-11, PR #126). There is no evidence of any commit
  reverting the default; the code did **not** regress.
- The lesson (dated 2026-07-06) describes the state *before* that same-day fix: `92bbb443` raised
  the cap while the gate "still defaulted OFF." That was true at the time of the debugging round
  the lesson memorializes — and `7c3d5b9d` is precisely the fix that ended it.
- Nuance: the lesson's **general point** ("a raised cap with the gate still off changes nothing —
  grep for the admission gate") is a valid, still-useful meta-lesson. What is misleading is its
  *present-tense-readable* claim that the gate "still defaulted OFF" and renders "stayed genuinely
  sequential" — a future session skimming it (as the briefing anticipates) would wrongly conclude
  parallel rendering is dark today. This is corroborated by auto-memory
  (`wpar-parallel-render-shipped`: "cap>1 is the shipped default since 2026-07-06").

**Exact correction:** in `.agent/lessons/INDEX.md` line 7, keep the meta-lesson but mark the
specific incident as resolved. E.g. change "…never did) still defaulted OFF — so every synthesis
claim kept routing…" to past tense with the resolution appended: "…had at that point never
flipped) still defaulted OFF — so renders stayed sequential regardless of the cap setting. Fixed
same day in `7c3d5b9d` (gate now defaults ON; parallel rendering is the shipped default)." The
**Apply** sentence stays as-is — it is the durable part.

The code (`resources.py`) needs no change; it is the authoritative source.

## Confidence + what would change it

**High (≈98%).** The deciding logic is two lines of trivially-evaluable Python; docstring, git
history, and project memory all agree. It would change only if some other layer forced
`ENGINE_CLASS_ADMISSION` into the disable set at boot/launch (e.g. `run.sh`, `.env`, launch
config exporting `ENGINE_CLASS_ADMISSION=0`) — a quick check for such an export would close that
residual. Nothing in the files read here sets it.

## Not determined here

- Whether any deployment/launch script or user-local `.env` sets `ENGINE_CLASS_ADMISSION` to a
  disable value (not searched exhaustively; nothing suggests it).
- Whether parallel behavior is *observably* correct at runtime (that's Plumb's domain) — this
  reference only settles the default of the admission gate.
