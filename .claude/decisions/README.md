# Orchestration decisions — `OD-NNNN`

Append-only record of the rulings behind this repo's orchestration layer: `CLAUDE.md`'s orchestrator
section, the seat profiles under `.claude/agents/`, the shared crew doctrine, and `roster.json`.

**Why this exists.** Those files are auto-loaded every session, which makes them the most expensive text
in the repo — and they grow monotonically, because a mandate is usually the only durable place to record
*why* a rule exists, so no line ever feels safe to cut. This log gives the *why* its own home so the spec
can stay lean permanently. The spec keeps its rules and gets compressed; it never becomes a table of
contents.

**`OD-NNNN`, never `ADR-NNNN`.** The product's architectural decisions live in `design-docs/decisions/`
as `ADR-NNNN`. Two series both starting at `0001` is a citation collision, and remapping them afterward
is its own disaster — every wrong citation still names a real record and still resolves, so structural
checks pass on all of them. Always cite with the prefix. (A third series, `GD-NNNN`, is the owner's
user-global log at `~/.claude/decisions/`; it is not this one.)

## The rules

- **Query the log on write.** Before adding a rule to `CLAUDE.md`'s orchestrator section or any seat
  profile, grep `INDEX.md` by scope. Consistent with an existing decision → cite it. Contradicting one →
  you are **reversing**, and must name what is *new*: new information, or a case not previously
  considered. "It feels safer" is the reflex this log exists to stop.
- **Append-only.** A reversed decision keeps its file and gets `Status: superseded by OD-NNNN`; the new
  record names what it retracts. Never edit a decision into its own replacement — that erases exactly
  the evidence that stops the old rule coming back. A stale *count* in an old record's title is not a
  contradiction; note it in the new record rather than editing the old one.
- **Prohibitions stay inline in the spec.** Where a rule reverses an earlier one, the spec keeps a clause
  naming the reflex being blocked ("do NOT restore this to X"). A citation nobody opens will not stop a
  cautious session from reversing the rule. Cite an OD only where someone would otherwise be tempted to
  undo it — a spec speckled with citations is a bibliography with extra steps.
- **`Decision:` quotes the spec verbatim.** It is the drift check: if the OD and the spec disagree about
  what the rule says, one was edited alone, and it shows without reading both end to end.
- **Every OD names what would disprove it.** `Disconfirming evidence:` is the observable event that would
  show the rule is *wrong*, not merely stale. **Non-compliance is not disconfirmation** — "nobody runs
  this check" is evidence about people, not about the rule, and a rule can be universally ignored and
  still be right. Nor is "it was never cited": a rule that never fires may be *why* it never fires. What
  counts is the rule being *followed* and the predicted benefit failing to appear, or the rule blocking
  work it should have allowed. Write it at authoring time, before anyone is motivated to rationalise.
- **Three reasons a rule leaves, and only one is a reversal.** Redundant → merge, and the merge must
  strictly cover everything the originals did. Expired, its triggering condition can no longer occur →
  retire. Wrong, with evidence → supersede, with the full argument. Conflating these is why nothing ever
  gets removed. Never auto-retire a rule for having no citations.
- **Generate the index.** `./tools/build-index.sh` regenerates `INDEX.md`. Never hand-edit it — a stale
  index is worse than none, because a session greps it, finds nothing, and reverses a decision filed
  under a tag the index dropped.
- **Closeout writes the OD.** A ruling made today gets its OD at closeout plus one imperative line in the
  spec. Deferring it is how it ends up as a paragraph of explanation wedged into the mandate later. Ask
  the consolidation question at the same checkpoint — anything to merge, retire, or supersede? — across
  the mandate, the profiles, this log, and `.agent/lessons/`.
- **Line-count triggers are goals, not mandates.** `CLAUDE.md`'s orchestrator section past ~250 lines, or
  a seat profile past ~150, means re-read this file before adding the next paragraph. A file already
  compressed and still over because the remaining content is needed stays over. Never spend information
  to save tokens.

## Record format

```
# OD-0007: <the decision, as a statement>
Status: accepted | superseded by OD-0012        Date: YYYY-MM-DD
Scope: <which file(s) this governs>
Context: <what went wrong, or what forced the call. Dated. 1–3 sentences.>
Decision: <the rule, verbatim as it now reads in the spec>
Consequences: <what this replaced; what it forbids; the reflex it blocks>
Disconfirming evidence: <the observable event that would show this rule is wrong>
```

This directory is tracked in git, so `git log` is the undo history for a removed rule; a record does not
need to quote removed text verbatim the way the owner's unversioned global log does.
