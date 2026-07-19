# RC-1 Task 1 — code-review comparison (Phase 4, first test case)

Three independent code reviews of the same real diff (`app/db/segment_alignment.py` +
`tests/db/test_segment_alignment.py`), all blind to each other, all reviewing against the same
twice-plan-reviewed invariants.

## Verdicts as submitted

- **Fable: needs changes — blocker.** Hand-traced a concrete input and confirmed a deterministic,
  always-reachable data-loss bug in the shipped code.
- **Constance: algorithm sound; tests incomplete — don't treat as proven.** Explicitly tried to
  construct a cross-match against I1/I2/I3 and reported she couldn't find one.
- **Petra: approve with required follow-ups.** Flagged the same area (duplicate × fragment-run
  intersection) as the plan's own named #1 risk, untested — but did not construct a concrete
  failing input.

## The gap, stated plainly

**Fable found and proved a real bug. Both twins independently flagged the exact same risk area as
under-tested, but neither one actually constructed the failing case.** This is the clearest,
least-ambiguous Fable-vs-twins gap across the whole calibration program to date — and it's the
opposite direction from every plan-review round, where the twins matched or exceeded Fable.

**Verified, not just relayed:** I ran Fable's exact reproduction before treating it as fact —
`align_segments([frag1("Re"), frag2("peat."), whole2("Repeat.")], ["Repeat.", "Repeat."])` — a
chapter resave with **zero edits** — and confirmed all three rows were destroyed. This was a real
bug in code I had already committed, not a hypothetical.

## Why the gap happened (worth carrying into the mechanism catalog)

Both twins reasoned about the *shape* of the risk correctly (the plan's own R1 names this exact
intersection) but stopped at "this needs a test," not "let me construct the adversarial input
myself." Fable's review explicitly did the latter: built a concrete scenario, hand-traced it against
the literal control flow line-by-line, and verified the result against what the code would actually
do — the same discipline the reasoning-analyst design asks of Constance/Petra, but this round they
described the risk rather than exercising it.

**Durable takeaway for the reasoning-analyst profiles:** "flag an untested risk area" is not
equivalent to "construct and trace an adversarial input against it." The latter is what caught the
bug. Consider adding this as an explicit step to the twins' code-review discipline: for any risk the
plan names as its own top concern, don't just check test coverage exists — build the specific input
that would break it and trace it by hand before signing off.

## Fix applied (verified before committing)

A genuine multi-row fragment run (≥2 rows) is exempted from the duplicate-sensitivity gate — a
multi-row split is an explicit user action, categorically different from a naturally-occurring
duplicate whole sentence. A length-1 match stays gated (same ambiguity as the single-row case).
Confirmed this preserves every prior test's outcome and added 2 new regression tests reproducing
both Fable's exact scenario and a reordered variant. Also fixed the whitespace-falsifier test both
Fable and Constance independently flagged as not exercising what it claimed — verified the corrected
version genuinely fails without the strip step before treating it as fixed.

**9/9 tests pass, ruff clean, all fixes independently verified (not just applied on trust).**

## Standing policy going forward (owner-directed)

Fable signs off on code changes when available; the twins sign off regardless. Compare every time.
This round's result: **do not treat "twins approved" as sufficient on its own when Fable is
available** — route consequential diffs through both, the same discipline Phase 3 already
established for plans. When Fable isn't available, the corrective is process, not luck: require the
twins to construct an adversarial input for any risk the plan itself names as its top concern,
not just confirm test coverage exists.
