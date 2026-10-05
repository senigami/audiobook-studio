# skill-arsenal conventions upgrade — 2026-08-11

Mechanical work per Ada's dispatch, sections 2l/2n/2p of `~/.claude/plugins/cache/skill-arsenal/plan-run/1.6.2/../../UPGRADING.md` (repo copy at `/Users/stevendunn/GitHub/skill-arsenal/UPGRADING.md`).

## 1. Three executor agents installed
`.claude/agents/implementer.md`, `reviewer.md`, `runner.md` copied from `plan-run/1.6.2/references/agents/`.

**Model tiers kept concrete (sonnet/opus/haiku), not changed to `inherit`.** The source `README.md` in that same directory explicitly ties each tier to the role's capability ("the roles are defined by capability, not by any one vendor's naming" — implementer=mid, reviewer=top, runner=light/cheap) and instructs changing the value only to an equivalent tier, never removing the distinction. This is exactly the carve-out named in the task: the file's own reasoning ties a specific tier to the role. Added a one-line comment in each file's frontmatter citing OD-0021 so a future "tidy this to inherit" pass doesn't undo it. Added `memory: local` to each.

## 2. `memory: local` added to all 7 persistent seats
`marius-engineer.md`, `junia-designer.md`, `astrid-archivist.md`, `cecilia-user-docs-writer.md`, `amina-runtime-verifier.md`, `esther-reasoning-elder.md`, `tamsin-reasoning-younger.md` — one frontmatter line each, no other changes to those blocks.

**Flag for Ada (the one decision that's hers, not mine):** each profile's "## Memory" prose section still reads `~/.claude/agent-memory/<slug>/MEMORY.md` — a global, user-scoped path, the exact anti-pattern UPGRADING.md §2n calls out ("never `memory: user`... already shared live across repos on the same machine"). Per instructions I did **not** touch that prose or migrate any content — I only added the frontmatter field, which auto-creates a separate `memory: local` directory the harness will actually use going forward. So right now each seat has two memory locations in play: the old global one described in prose (still readable/writable if a session follows the prose literally) and the new local one the frontmatter field wires up automatically. My recommendation: update each "## Memory" section to point at the new local location, and separately review the old global `MEMORY.md` files for content worth carrying forward before they go stale. Recorded as a known discrepancy in OD-0021 rather than fixed silently.

`roster.json`'s `conventions.memory_path` field also still names the old global path — left as-is since it wasn't in the task's explicit ask, but it has the same discrepancy and should move together with the above.

## 3. "Self-chosen" framing corrected (2l)
All 7 profiles: `self-chosen 2026-07-20` → `named 2026-07-20 (predates the current orchestrator-named convention, see OD-0004)`. No renames, no rationale prose touched, no example names invented. `roster.html`'s colophon updated similarly (`Names are chosen for the role — orchestrator-named going forward, self-chosen for the seats hired before that convention — internal-only...`). One `self-chosen` string remains in `roster.html` by design — it's inside that corrected sentence, describing the seats' actual history, not a live instruction.

## 4. Ada's dispatchable agent entry (2p)
New `.claude/agents/ada-orchestrator.md` — `name: orchestrator`, `model: inherit`, `memory: local`, a short body pointing at `CLAUDE.md`'s mandate section and `roster.json`'s `orchestrator` block. No mandate content duplicated.

`roster.html`'s lead card updated: the stale `<span class="seat-key mono">the main session — no dispatch key</span>` (no longer true) now reads `orchestrator`, with a line noting the new dispatchable file.

## 5. `roster.json` / `roster.html`
- `roster.json`: `"memory": "local"` added to all 7 seat entries and to the `orchestrator` block; `orchestrator` block also gained `"profile_agent_entry": ".claude/agents/ada-orchestrator.md"`.
- `generic_executors.note` corrected in passing: it said the three executors are "global drop-ins at `~/.claude/agents/`" — no longer true now that they're installed per-project at `.claude/agents/` (which is plan-run's own stated preference anyway). Updated the note and added the same model-tier-exception pointer to OD-0021. This wasn't explicitly asked for but is directly stale as a result of step 1 — flagging here rather than leaving a self-contradicting roster file.
- `roster.html`: naming-language fix (item 3) and the Ada dispatch-entry note (item 4).

## 6. Decision log
`.claude/decisions/0021-skill-arsenal-conventions-upgrade.md` — covers all three conventions plus the memory-path discrepancy as a named, unresolved consequence. Index regenerated via `tools/build-index.sh` (21 decisions, OD-0021 last).

## Verification run
- `python3 -c "import json; json.load(open('.claude/agents/roster.json'))"` → OK.
- Frontmatter YAML parse over every `.claude/**/*.md` → clean, no `BAD FRONTMATTER` output.
- `grep -c self-chosen` across `.claude/agents/*.md .claude/agents/roster.html` → zero in every profile; one in `roster.html`, expected (see item 3).
- Dangling-reference sweep (`UPGRADING.md` Part 3 command) over `.claude/` + `CLAUDE.md` → one hit, **pre-existing and out of scope**: `.claude/agents/designer.md` referenced somewhere but the real file is `junia-designer.md`. Not introduced by this change; flagging for whoever owns that reference next, not fixing unasked.

Not run: app/harness restart to confirm `memory: local` actually takes effect on next dispatch (UPGRADING.md §2n notes frontmatter edits to already-loaded agents are cached for the session) — that's Ada's or the owner's to verify live, not something I can confirm from a file edit.

Nothing committed, per instructions.
