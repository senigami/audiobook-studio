# OD-0022: No example name survives in anything read during a naming
Status: accepted        Date: 2026-08-04
Scope: `.claude/decisions/0004-bias-neutral-naming-discipline.md` (Consequences field); any file in this repo consulted while naming a seat

Context: OD-0004's `Consequences` field carried a forward-looking prohibition illustrated with two specific tokens. That is the one failure mode the current naming method has hard evidence for: a guidance file listing words as examples of names that *fail* had those exact words come back later as suggestions. Any token written into naming guidance narrows the field a name is drawn from, and it does so whether it was offered as a model or as a warning. OD-0004's `Context` field also names the eight predecessor tokens, but that is a record of what was decided and is deliberately left untouched — history is exempt; only forward instruction is in scope here.

Removed (verbatim): from OD-0004's `Consequences`, per the append-only rule that a deletion must quote what it deleted:

```
Object/instrument words (e.g. "Ledger", "Plumb") fail the first test outright and are prohibited going forward.
```

And, from the same field, the parenthetical illustrating the resemblance clause — a live seat's name, in
forward-looking guidance, which is the same defect as the two tokens above:

```
 (e.g. Cecilia and sound)
```

Decision: "A file this repo's session reads while naming a seat contains no example name — not a candidate, not a theme, not a token cited as an example of a name that fails. Describe the failing class and name nothing. This applies to forward-looking guidance in a decision record as much as to a profile or a charter; a record of what was decided is exempt."

Consequences: OD-0004's `Consequences` field now states the prohibited class without tokens. OD-0004 remains accepted; its `Decision` field is unchanged and still governs, and the substance of its four tests is now carried upstream by `~/.claude/orchestration-primer/naming-discipline.md` (see OD-0021), which is pointed at rather than copied. One further clause of OD-0004's `Consequences` — that the tests screen the *route* by which a name was reached — is historical and is no longer applied: the route it policed was a seat reverse-engineering a name from its own job description, and that route ceased to exist when self-naming was abolished. Do NOT reintroduce a route test on the strength of reading OD-0004.

Disconfirming evidence: A name is proposed in this repo that restates its seat's function, showing the class-only wording is too abstract to screen against and that a concrete illustration was doing real work — in which case describe the failure with a non-name (a category, a part of speech), never a token that could be mistaken for a candidate.
