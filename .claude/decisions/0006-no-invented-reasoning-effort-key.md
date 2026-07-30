# OD-0006: No reasoning-effort key is invented for a profile
Status: accepted        Date: 2026-07-18
Scope: roster.json conventions.reasoning_effort; seat profile frontmatter
Context: Whether reasoning effort is a profile-frontmatter property — and if so under what key and values — was unconfirmed on 2026-07-18 in this harness, and was re-checked and found still unconfirmed on 2026-07-29.
Decision: "reasoning_effort": "no confirmed dispatch-time or frontmatter key in this harness as of 2026-07-29 — do not invent one (OD-0006)"
Consequences: roster.json records the intended effort per seat as plain data (the `effort` field on each seat entry) rather than as frontmatter the harness may not honor. The real key gets added to frontmatter only once the schema is confirmed, not guessed at now.
Disconfirming evidence: A frontmatter effort key is later discovered to already be honored by the harness and the guessed-and-withheld key would have worked correctly all along — i.e. withholding the key cost real effort control with no corresponding risk avoided.
