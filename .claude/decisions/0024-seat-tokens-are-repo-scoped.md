# OD-0024: Seat spawn keys are repo-scoped (`abfc-<name>`); profile filenames keep the role word
Status: accepted        Date: 2026-08-13
Scope: `.claude/repo-id` (new); `.claude/agents/*.md` frontmatter `name:` and in-body hand-off/routing references (`amina-runtime-verifier.md`, `astrid-archivist.md`, `cecilia-user-docs-writer.md`, `marius-engineer.md`, `junia-designer.md`, `esther-reasoning-elder.md`, `tamsin-reasoning-younger.md`); `.claude/agents/_shared/reasoning-pair-contract.md`; `design-docs/plans/active/br1_jobs_package_move/00-plan.md`; `design-docs/plans/active/span_resync_preservation_fix/tasks/006-surface-loss-count.md`; `.claude/agents/roster.json`; `.claude/agents/roster.html`; `CLAUDE.md` roster paragraph; `~/.claude/orchestration-primer/repo-ids.json`
Context: A seat's memory directory is named after its frontmatter `name:` token, never its profile folder. This repo carried eleven bare role-word tokens — the highest collision surface of any repo surveyed on this machine — five colliding with audiobook-studio and `orchestrator` with skill-arsenal. Observed live 2026-08-13 elsewhere in the estate: a foreign seat directory appeared in one repo's tree from a folder-attached sibling. Ada's own token was the bare word `orchestrator`, so her name never reached her token and a session dispatching her from another repo got a generic role word instead of her. Separately, the orchestrator speaks inline and is never dispatched, so her store was never auto-created and had accumulated nothing, with nothing erroring anywhere.
Amended: 2026-08-13, same day, before anything was pushed. See the amendment section at the end.
Decision: "A seat's frontmatter `name:` is `<repo-id>-<personal-name>`, the repo id read from `.claude/repo-id`, which stays UNTRACKED like the rest of the awakening layer. The profile FILENAME keeps the role word — do NOT rename a profile to match its token, because the session-start hook globs `.claude/agents/` for the role word to discover which seat speaks inline, and a rename breaks discovery silently. This applies to EVERY seat with no exception, including this repo's copies of `plan-run`'s generic executors."
Consequences: This is a **reversal** of OD-0007's `conventions.dispatch_key` rule ("job-description-only, never a person's name"). What is new is information that rule was never tested against: tokens are a machine-wide namespace, not a per-repo one, so a job-description token is by construction the most collision-prone choice available, and a collided directory cannot be attributed to its estate. OD-0004's naming discipline is untouched — the names themselves are unchanged; only where they are carried changed. **A first pass carved out an exception for the three `plan-run` executors and it was wrong; the record of why matters more than the rule.** The reasoning was that `plan-run` dispatches `implementer`/`reviewer`/`runner` by those literal strings and its own README says it degrades to a plain subagent when the names are absent, so prefixing would silently strip each role's convictions. Both halves were checked and only one held. `plan-run`'s fallback behaviour is real. The cost was not: `~/.claude/agents/` already holds bare `implementer.md`, `reviewer.md` and `runner.md`, so `plan-run` resolves those names from the machine-wide layer no matter what this repo calls its local copies. The exception had **no cost basis at all** — it was priced against a breakage that could not occur. Against that, all three declare `memory: local`, so each keeps a store keyed on its token, and `reviewer` already had one with content; a bare token holding a local store, under a name shared with the machine-wide layer, is the widest form of the exact defect this OD exists to close. All eleven seats are therefore prefixed, and `agent-memory-local/reviewer/` was **moved** to `abfc-reviewer/`, both files preserved, so `abfc-reviewer` holds the only accumulated seat memory in this repo.

The transferable error: an exception was granted on an asserted cost that one `ls` would have falsified, and it survived a gating review because the review tested whether the *claim about plan-run* was true rather than whether the *cost was real*. Verify the price of an exception, not only its premise. `roster.json` gains a `spawn_key` per seat alongside the existing `slug`, which keeps doing filename duty. Ada's store was created by hand at `.claude/agent-memory-local/abfc-ada/` and seeded, because an empty store and a store that was never wired look identical later.
Lesson from the gating review (the first pass of this change got it wrong): updating only *backticked* tokens is not a safe narrowing rule. It left `amina-runtime-verifier.md` contradicting itself — line 3 saying `abfc-marius` while line 80 still routed to `engineer` — because a hand-off table writes seat names as bold or bare text just as readily as in backticks. The workable rule is by POSITION, not by markup: a routing/hand-off position takes the spawn key, prose naming a seat as an actor takes the personal name (it reads as English and cannot go stale), and two things stay untouched — the `.agent/reports/<date>-<slug>-<task>.md` templates, which key off `slug` rather than the token, and incidental English (`cecilia-user-docs-writer.md`'s "not an engineer; plain language" means a human engineer). Verify with `grep -rnwE` over the role words, then judge every hit against its own sentence. The re-check found a second instance of the same class: a phrase that WRAPS across a line break ("the global" ending one line, `` `reviewer` `` beginning the next) is invisible to a grep for the joined phrase, so it survived a pass that fixed the six unwrapped copies. Both errors share one root — trusting a search pattern to define the scope instead of enumerating the subject and reading each hit. Grep for the shortest distinctive fragment, never the whole phrase.
Disconfirming evidence: The machine-wide `~/.claude/agents/{implementer,reviewer,runner}.md` are removed or renamed, at which point `plan-run` in this repo silently degrades to generic subagents and bare aliases would be needed alongside the prefixed seats. Or: a seat store is found at a bare-role-word path in this repo after this change, for a seat whose token was prefixed, meaning something other than the frontmatter token is naming directories and the whole mechanism rests on a false premise.
Removed (verbatim): one sentence replaced in `CLAUDE.md`'s roster paragraph, and four field values in `.claude/agents/roster.json`. Paste back to restore:

```
Filenames follow `name-role.md`; the frontmatter `name:` dispatch key stays job-description-only (`engineer`, `designer`, …).
```

```
    "filename": "<name>-<functional-slug>.md",
    "dispatch_key": "the frontmatter `name:` field — job-description-only, never a person's name",
```

```
    "memory_path": "~/.claude/agent-memory/<slug>/MEMORY.md",
```

```
      "sibling": "reasoning-younger",
      "sibling": "reasoning-elder",
```

## Amendment, 2026-08-13 (same day, pre-push)

**The standing rule: the awakening layer stays local.** It is not tracked in git. The retrofit
instructions this change followed asserted the opposite for `.claude/repo-id` specifically — tracked via
a `.gitignore` exception, so every clone resolves the same id — and that exception was never a rule the
owner set. It was inferred, written into the shared instructions, and followed here in good faith. The
owner confirmed the rule directly and it applies with no carve-out for this one file.

So `.claude/repo-id` is now excluded via `.git/info/exclude` (alongside `**/.claude/agent-memory-local`,
the existing precedent in this repo) and the commit that had tracked it was reset away before leaving
this machine. `git log --all -- .claude/repo-id` and `git ls-files .claude/repo-id` both return nothing.

**The polarity of my own F6 finding was inverted, which is the part worth keeping.** During the gating
review I recorded that `.claude/repo-id` was untracked while three files claimed it was tracked, and
filed that as a defect to fix by tracking it. Untracked was the correct state; the *claim* was the
defect. I read the disagreement between a file's assertion and the world as evidence the world was
wrong, because the assertion was mine and freshly written. When an assertion and the state of the disk
disagree, which one is wrong is exactly the open question, and authorship is not a tiebreak.

**Consequence for the id's durability.** The id no longer survives a fresh clone, and the exclusion
itself lives in `.git/info/exclude`, which is machine-local and not shared. `abfc` is recoverable from
`~/.claude/orchestration-primer/repo-ids.json`, which is now the only durable record of it. A clone on
another machine must write its own `.claude/repo-id` from that registry. Nothing about the collision fix
depends on this: the tokens live in the profiles, and the store paths follow the tokens.

Removed (verbatim): the tracked-exception wording. Paste back only if the standing rule changes:

```
Decision: "A seat's frontmatter `name:` is `<repo-id>-<personal-name>`, the repo id read from `.claude/repo-id` (tracked in git).
```

```
Scope: `.claude/repo-id` (new); ... `~/.claude/orchestration-primer/repo-ids.json`
```

The `.gitignore` negation the instructions called for (`!/.claude/repo-id`) was never added here, because
this repo's `.claude/` was not ignored in the first place, so there was nothing to negate.

