# Adversarial review — repo-scoped seat tokens (OD-0024), uncommitted

Date: 2026-08-13 · Gate: the one adversarial review CLAUDE.md requires before committing a change to
`.claude/agents/`. Reviewer applied no fixes; Ada owns them.

## Verdict

**BLOCK** — on F1 alone. Everything else is PASS or minor.

F1 is not a style nit: the sweep converted every *backticked* seat token and left ~40 *unbackticked*
ones, including live "Is this my job? → engineer" routing lines. Those now name agent types that no
longer exist, which is the exact silent-degradation failure OD-0024 itself refuses to accept for the
`plan-run` executors. Fixing it is mechanical.

---

## CONFIRMED findings

### F1 — HIGH — the token sweep covered backticked occurrences only; routing prose still names dead tokens

`.claude/agents/amina-runtime-verifier.md:80`, `astrid-archivist.md:3,47,76-79,82,86,106,119,125-127`,
`cecilia-user-docs-writer.md:3,54,70-73,76-77,87,94,103,109-111,113,119,123,130,132`,
`junia-designer.md:3,50-53,56,70,76`, `marius-engineer.md:44-47,50`,
`amina-runtime-verifier.md:29,62-65,74,76`

Verified by `grep -nw -E "engineer|designer|archivist|runtime-verifier|user-docs-writer|..."` over
`.claude/agents/*.md`, excluding `abfc-` hits and the historical `agent-memory/` paths.

The sharpest case is **one file contradicting itself**: `amina-runtime-verifier.md:3` (frontmatter
description) was updated to `abfc-marius`/`abfc-junia`, while line 80 of the same file still reads
`**Is this my job?** Writing or fixing code → engineer. Visual/UX judgment → designer.` A seat that
follows its own routing line dispatches `engineer`, which is no longer any agent's `name:`. Same shape
in `astrid:125-127`, `cecilia:109-111`, `junia:76`.

`esther`/`tamsin`/`_shared/reasoning-pair-contract.md` had their *identical* "Is this my job?" and
hand-off lines rewritten to spawn keys — so the change itself treats these sentences as dispatch
references. The other five profiles were skipped because their references are not backticked.

Two sub-classes, worth separating when fixing:
- **Dispatch/routing (must change):** "Is this my job?", hand-off lists, "that's engineer"
  parentheticals in descriptions, "ask designer", "route to runtime-verifier".
- **Boundary-table row labels (`| **engineer** | …`) and narrative mentions:** these read as role
  names, not tokens. Defensible either way, but pick one rule and apply it to all five files; the
  current state is neither.

**Fix:** rewrite the routing-shaped references in those five profiles to spawn keys, in this same
change. Then re-grep with the whole-word pattern above and confirm the only survivors are the
`~/.claude/agent-memory/<old-slug>/` historical paths (per OD-0021) and `implementer`/`reviewer`/
`runner`. Add a line to OD-0024's Scope naming the five profiles.

### F2 — MEDIUM — "the global `reviewer`" is now false, and OD-0024's justification leans on it

6 occurrences across `.claude/agents/` (`amina:38,80`, `esther:3,…`, `tamsin:3,…`,
`_shared/reasoning-pair-contract.md:18`). Verified against `.claude/agents/reviewer.md:1-9`.

`reviewer.md` is not global and not repo-agnostic: it lives in `.claude/agents/`, carries `model: opus`
per OD-0021, a repo-specific `tools:` annotation dated 2026-07-18, `memory: local`, and an accumulated
store at `.claude/agent-memory-local/reviewer/` (2 files, `MEMORY.md` + `od-review-checks.md`, verified
on disk).

This matters beyond wording, because OD-0024's Consequences argues the exception is safe on "drop-ins
that are identical across repos by design." For `reviewer`, that premise is false today.

**Fix:** drop the word "global" in those 6 places (call it "the `reviewer` drop-in"), and correct
OD-0024's Consequences sentence to say the exception is accepted *despite* `reviewer` having
diverged and accumulated, not because it hasn't.

### F3 — LOW — OD-0024's `Removed (verbatim):` block understates what was removed

`.claude/decisions/0024-seat-tokens-are-repo-scoped.md:8` says "one field value in
`.claude/agents/roster.json`". Three `conventions` values were replaced (verified in `git diff`):
`dispatch_key` (captured), plus `filename` and `memory_path` (not captured). Old values:

```
    "filename": "<name>-<functional-slug>.md",
    "memory_path": "~/.claude/agent-memory/<slug>/MEMORY.md",
```

Also uncaptured: the two `sibling` values (`reasoning-younger` / `reasoning-elder` → spawn keys).
The `generic_executors.note` and the `roster.html` colophon were *prepended to*, so their old text
survives inline — no capture needed there.

**Fix:** add those two lines to the verbatim block and change "one field value" to "three field
values and two `sibling` values". Cheap, and it is the one property the log exists for.

### F4 — LOW — `roster.json`: `sibling` moved namespace, `slug` did not

`.claude/agents/roster.json` — seats carry `slug: "reasoning-elder"` and `sibling: "abfc-tamsin"`.
A reader resolving `sibling` by matching `slug` now finds nothing. Nothing programmatic reads this file
(no script in the repo parses it — checked), so this is a comprehension trap, not a break.

**Fix:** rename the field `sibling_spawn_key`, or state in `conventions` that `sibling` holds a spawn
key while `slug` holds the filename slug.

### F5 — LOW — active-plan reference to a dead token

`design-docs/plans/active/br1_jobs_package_move/00-plan.md:53` — "`runtime-verifier` job, not a
green-test-suite claim." An active plan, so a live routing instruction.

**Fix:** one-word update to `abfc-amina`, or leave and note it in the plan; either is defensible, but
name the choice.

### F6 — informational — `.claude/repo-id` is untracked

`git status` shows `?? .claude/repo-id`. OD-0024, `roster.json:conventions.repo_id_file`, and CLAUDE.md
all assert it is "tracked in git". True only once committed. `git check-ignore` confirms it is not
ignored. Adjacent: `.claude/agent-memory-local` is excluded via `.git/info/exclude:15` (machine-local),
not via a committed `.gitignore` — so a fresh clone does not inherit that exclusion. Flagged, not fixed.

---

## Areas checked and PASSING

**A1 — per-sentence correctness / the `orchestrator` block key.** Read every changed sentence in
`git diff -U1`. `.claude/agents/ada-orchestrator.md:19` still reads "`.claude/agents/roster.json`'s
`orchestrator` block" and `roster.json:5` is still keyed `"orchestrator"` — correctly left alone; it
names a JSON key, not a token. No replacement turned a true sentence false. One nit: in
`_shared/reasoning-pair-contract.md:15-18` the parentheticals are now tautological
("`abfc-marius` (Marius)") — harmless, worth collapsing while F1 is being fixed.

**A2 — historical paths (false-positive category).** All 8 profiles' "## Memory" sections still name
`~/.claude/agent-memory/<old-slug>/` (`marius:89`, `junia:94`, `amina:98`, `astrid:155`, `cecilia:139`,
`esther:80`, `tamsin:75`, `reviewer:65`). Correct per OD-0021 — historical fact, must not change.
Likewise `.agent/candidate-agents/*` (never-hired profiles), `.agent/frontier-calibration/*` and
`.agent/reports/*` (dated records), and `0024-...md:11` (the verbatim restore block). Not findings.

**A3 — the bare-token exception.** The claim holds, verbatim, in
`~/.claude/plugins/cache/skill-arsenal/plan-run/1.6.2/references/agents/README.md:7-9`: "If your
harness has no agent by these names, `plan-run` still works — it falls back to a generic subagent, and
you lose the role's convictions, not the workflow." `SKILL.md:40-42,74,82,84,118-119` dispatch by those
literal names. So the exception is justified: prefixing buys attribution and costs certain silent
capability loss.

*Strongest case against, and it does not fully break the reasoning but does dent it:* all three
executors declare `memory: local` (`implementer.md:8`, `reviewer.md:8`, `runner.md:8`), so each will
create a bare-token store on dispatch, and `reviewer`'s already exists with content. The one seat in
this repo that actually accumulates is the one left unattributable — precisely the failure the registry
`$comment` describes (the `dende` incident). The exception therefore protects the workflow and leaves
the stated problem unsolved where it is most live, rather than where it is theoretical.

The unexamined third option: **drop `memory: local` from the three**. Nothing collides if nothing
accumulates, the tokens stay bare, `plan-run` keeps working, and the cost is `reviewer`'s 2 existing
files (movable into `abfc-ada`'s store as an inherited-lessons file). Recommend Ada rule on this
explicitly and record the ruling in OD-0024's Consequences either way — the current OD reads as though
the collision were closed, and it is not.

**A4 — hook resolution.** Read `~/.claude/hooks/seat-memory-load.sh` in full and ran it:
`cd /Users/stevendunn/GitHub-Steven/audiobook-factory && echo '{}' | bash ~/.claude/hooks/seat-memory-load.sh`
→ exit 0, output `This session speaks as seat "abfc-ada"`, `Defined at:
.claude/agents/ada-orchestrator.md`, store `.claude/agent-memory-local/abfc-ada/`, both memory hooks
listed. The glob `.claude/agents/*orchestrator*.md` matches `ada-orchestrator.md`; `resolve_token`
reads `name: abfc-ada`. The two-store fallback **cannot** misfire: the `for` loop `break`s after the
first candidate having set either `SEAT` or `MISSING_TOKEN`, and the fallback is guarded by
`[ -z "$SEAT" ] && [ -z "$MISSING_TOKEN" ]`. The `reviewer` store is never reachable by it.

**A5 — OD-0024 quality.** Has a quoted `Decision:` field, a real two-branch `Disconfirming evidence:`
line (both branches would show the rule *wrong*, not merely stale — the second, "a store appears at a
bare-role-word path for a prefixed seat," falsifies the mechanism outright). The reversal of OD-0007's
`dispatch_key` rule is named as a reversal and states what is new ("tokens are a machine-wide
namespace, not a per-repo one"), which is a genuine untested-premise argument, not "it feels safer".
Read `0007-roster-json-owns-tabular-facts.md` and `0004-bias-neutral-naming-discipline.md`: **no
contradiction with OD-0004** — the eight names are unchanged, only the field carrying them changed, and
OD-0024 says so explicitly. `INDEX.md` was regenerated with a correct row. Only defect is F3.

**A6 — same-change completeness (OD-0007).** All three surfaces landed for all 8 seats. `roster.json`:
7 seats + orchestrator, `missing spawn_key: []` (verified by parsing). Profiles: 8 `name:` changes in
the diff. `roster.html`: 8 `seat-key mono` spans changed (ada, marius, junia, amina, astrid, cecilia,
esther, tamsin) plus the colophon. No fourth surface is under a same-change obligation — grepped
`dispatch_key` repo-wide, only hit is OD-0024's own restore block.

**A7 — JSON validity and the registry.** `.claude/agents/roster.json` parses (`json.load`, 8 top-level
keys). `~/.claude/orchestration-primer/repo-ids.json` parses. The `abfc` entry is consistent with disk:
`status: assigned`, `.claude/repo-id` holds `abfc\n`, and its `seats` list is exactly the 8 tokens
found in the profiles, in roster order. Its `note` correctly records the bare-token exception and the
filename convention.

## Not checked, and why

- **Whether the harness errors or silently falls through on a dispatch to a nonexistent
  `subagent_type`.** Would need a live dispatch, which is outside a review's remit here. F1 stands
  either way: loud failure is a broken routing table, silent fallback is the degradation OD-0024
  rejects. Marked UNVERIFIED in F1's reasoning, not in its conclusion.
- **Whether other repos' registry entries match their disks.** Out of scope, and CLAUDE.md forbids
  editing another repo's layer from here.
- **`.voice/personas/`** — grepped (`name: orchestrator-discipline` is a persona name, not a seat
  token); no seat tokens found, nothing to review.

---

# Re-check of Ada's fixes (same day, same reviewer)

**Verdict: PASS WITH FINDINGS.** No BLOCK. Two confirmed misses, both one-line, neither functional.
F1, F3 and F4 are fully resolved; F2 is resolved in 6 of 7 places.

## CONFIRMED findings

### R1 — LOW — F2 missed one instance because the phrase wraps across a line

`.claude/agents/_shared/reasoning-pair-contract.md:64-65` still reads
`… → the global` / `` `reviewer`. ``. The other 6 became "the repo-local `reviewer` drop-in"
(verified: `esther:3,57`, `tamsin:3,53`, `amina:3,80`). This one escaped because "global" ends line 64
and `` `reviewer` `` starts line 65, so any grep for the joined phrase misses it.

**Fix:** rewrap those two lines to "the repo-local `reviewer` drop-in". Worth adding to OD-0024's
lesson paragraph: a `grep` for a *phrase* misses every wrapped instance, so verify by grepping the
rarer single word (`grep -rn 'the global' .claude/agents/`, which is how this was found).

### R2 — LOW — one routing-shaped old token left outside `.claude/`

`design-docs/plans/active/span_resync_preservation_fix/tasks/006-surface-loss-count.md:63` —
"should go through the designer/owner, not be decided unilaterally here." Bare old token, routing
position, in an active task file. Line 5 of the same file is fine (it says "the designer (Junia)").

Checked and **not** findings: `sd1_lesson_correction/00-plan.md:44` ("Amina's/runtime-verifier's
domain" — names the seat, unambiguous); `final_release/20_stale_docs_retirement.md:23,29` (stale
`.claude/agents/{designer,engineer,runtime-verifier}.md` *filenames*, wrong since the 2026-07-20
rename, pre-existing and not this change's obligation — but worth a separate cleanup); everything under
`design-docs/personas/`, `.agent/candidate-agents/`, `.agent/reports/`, `.agent/code-map/`,
`frontend/tests/`, and `.claude/decisions/0012-0014` (historical or ordinary English).

## Nits, not findings

- Boundary tables: every seat row is `| **Marius** (`abfc-marius`) |` but the pair row is
  `| **reasoning pair** (Esther & Tamsin) |` with no spawn keys — inconsistent with the position rule.
- `marius-engineer.md:70` routes to bare `implementer`/`runner`/`reviewer` unmarked, while `:3` uses
  `` `implementer` ``/`` `runner` ``. The tokens are correct either way; only the markup differs.

## Areas verified clean

1. **Survivor grep.** `grep -rnwE` over `.claude/agents/*.md` + `_shared/*.md`, minus `agent-memory/`:
   **8** hits, not the 10 predicted — the 4 description parentheticals now read as personal names
   (`astrid:3` "that's Marius, `abfc-marius`", `cecilia:3` "Junia (`abfc-junia`)" / "Astrid
   (`abfc-astrid`)", `amina:3` "`abfc-marius`/`abfc-junia`", `junia:3` "Marius (`abfc-marius`)"), so
   they no longer match the role-word pattern. The 8 are the 5 report-path templates
   (`amina:94`, `astrid:143`, `cecilia:129`, `junia:90`, `marius:85`), `cecilia:90` ("not an
   engineer"), `junia:3` ("UI/UX designer"), `marius:3` ("owner-engineer"). All benign. No miss.
2. **Table integrity.** Every changed row parses at the right width — 4 cells in all five boundary
   tables (`awk -F'|'`), 2 cells in the do/don't tables. No stray pipes; bold and inline-code are
   separate spans and nest fine. Read all ~25 replacements as rendered rows: none turned a true
   sentence false (`amina:74,76` "Marius fixes"; `astrid:119` "Marius's call"; `cecilia:103,119,123`;
   `junia:70` "Marius or `implementer` builds" — all still accurate).
3. **OD-0024 end to end.** `Removed (verbatim):` now carries all four roster.json values with original
   indentation, in three fenced blocks — sufficient to restore by paste. Scope lists the five extra
   profiles and the plan doc. The `Lesson from the gating review` paragraph states the position rule
   and both deliberate exclusions. Consequences no longer claims the drop-ins are identical across
   repos, names the `reviewer` weak point, and records the drop-`memory: local` option as the owner's
   call not taken. No unsupported claim remains. (Context's "five colliding with audiobook-studio"
   is a dated survey fact stated in the present tense — fine in a Context field.)
4. **`br1_jobs_package_move/00-plan.md:53`** now reads `` `abfc-amina` (Amina) job ``. Fixed.
5. **Ada's store.** 4 files. `MEMORY.md` has 3 pointer lines resolving to the 3 non-index files, new
   lesson first. 2 wikilinks (`[[plan-run-executors-are-load-bearing-names]]`,
   `[[seat-tokens-and-stores]]`), both resolve. No dangling link, no orphan file.

Unchanged from the first pass: F6 stands — `.claude/repo-id` is still untracked, and must go in the
same commit for the "tracked in git" claim to be true.
