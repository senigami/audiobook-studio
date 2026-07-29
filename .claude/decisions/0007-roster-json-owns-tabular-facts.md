# OD-0007: Tabular roster facts live in roster.json; no seat count in prose
Status: accepted        Date: 2026-07-29
Scope: roster.json; CLAUDE.md orchestrator section; every seat profile's "Team Boundaries" section
Context: Five of the seven profiles carried the heading "Team Boundaries (I am one of seven repo specialists)". A count written in prose goes stale every time a seat is hired, and a stale entry hides in the middle of a paragraph where nothing scans it — the same five profiles' boundary tables still said "one of five" and had no row for the reasoning pair for a period after that pair was hired, fixed 2026-07-20.
Decision: "The routing table for this repo's named seats. Query this rather than restating counts, tiers, or surfaces in prose. Adding, retiring, or renaming a seat is a same-change edit here, in the seat's profile, and in roster.html."
Consequences: Prose in CLAUDE.md and seat profiles must not restate the current seat count, model tier, or ownership surface — it points at roster.json instead. Adding/retiring/renaming a seat is a same-change edit across roster.json, the profile, and roster.html.
Disconfirming evidence: roster.json itself is found to drift out of sync with the actual seat list just as often as the old prose counts did — i.e. moving the fact to a single structured file did not actually stop the staleness it was meant to prevent.
