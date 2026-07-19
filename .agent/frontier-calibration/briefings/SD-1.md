# Calibration briefing — SD-1: does the admission gate default OFF or ON?

**Activity:** spec-vs-code drift · **Gradeable:** objective

## The task

Two sources in this repo describe the engine-class admission gate
(`_engine_class_admission_enabled()`) differently:

- `.agent/lessons/INDEX.md`'s first always-on lesson states the gate "still defaulted OFF … so
  every synthesis claim kept routing through the legacy single-flight exclusive gate and renders
  stayed genuinely sequential."
- The live code in `app/orchestration/scheduler/resources.py` (~49–68) documents and appears to
  implement **default ON**.

Determine which is **authoritative now**: read the gate's actual default logic and decide whether
the always-on lesson is **stale** (misleading every future session into believing renders are
still sequential) or whether the **code regressed** from what the lesson describes.

## Read (reason from these, not from memory of the repo)

- `.agent/lessons/INDEX.md` (the always-on lesson, ~line 7)
- `app/orchestration/scheduler/resources.py` (~49–68) — the gate's actual default logic
- The code-map / git history on that gate if useful for dating the behavior.

## Produce

- A definitive verdict: what the gate actually defaults to today, quoted from the code (`path:line`),
  and therefore whether parallel rendering is live or sequential by default.
- Which source is authoritative and which needs correcting, with the exact correction.
- Whether this is stale-doc drift or a code regression, with the evidence for which.

## Discipline

- The code's actual default logic is the ground truth — read it, don't infer from the prose.
- Quote the deciding lines. State it plainly; this one has a checkable answer.
- If the code's default is genuinely ambiguous, say exactly what makes it so.
