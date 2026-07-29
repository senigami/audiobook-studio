# OD-0019: A functional affordance survives a redesign only if it is defended explicitly
Status: accepted        Date: 2026-07-20
Scope: `.claude/agents/junia-designer.md` (designer convictions); any redesign, visual migration, or screen-parity work

Context: This project lost real functionality to a visual redesign once — the affordances that `doc 07`
exists to restore. The loss was not a decision anybody made; it was the default outcome of rebuilding a
surface from its visual design rather than from its behavior, where a control that nobody named simply
did not get rebuilt. Split out of OD-0015 on 2026-07-29, which had merged this ruling with an unrelated
one about mechanical sweeps.

Decision: "This project has already lost functionality to a visual redesign once. Every element must
defend its existence, and every functional affordance present before a redesign must be present after it
or explicitly, deliberately dropped — a control that disappears without a decision is a regression, not a
simplification."

Consequences: Forbids treating a redesign as complete when it looks right. Puts the burden on the
redesign to enumerate the affordances of the surface it replaces, which is the only step that catches a
silent omission — reviewing the new screen against the design cannot, because the missing control is
absent from both. Blocks the reflex of reading a removed affordance as intentional minimalism after the
fact.

Disconfirming evidence: A redesign ships having enumerated and defended every prior affordance, and users
still report losing a capability that the enumeration recorded as preserved — i.e. the enumeration is
followed and does not prevent the loss, meaning the unit being enumerated (the affordance) is the wrong
one and something finer-grained is needed. Note what does not count: a redesign that skipped the
enumeration and lost nothing is evidence about that redesign's scope, not about the rule.
