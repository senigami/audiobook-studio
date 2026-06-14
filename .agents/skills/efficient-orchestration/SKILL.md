---
name: efficient-orchestration
description: >-
  Always-on token-efficiency operating model. Apply this to EVERY non-trivial
  task — before starting, analyse the task and decide whether to handle it
  inline or delegate parts to cheaper subagents. Actively monitor token spend as
  work proceeds and checkpoint when a task turns out deeper than expected. Use
  this as the default operating model for all work, not just multi-agent tasks.
  The goal is maximum output quality per token: the large model holds strategy,
  direction, and verification; mechanical or bounded work fans out to the
  smallest capable model, including light agents such as Haiku, GPT-5.4-Mini, or
  Gemini Flash 3.5 at low/medium/high effort when available. Also reference this
  skill when writing or improving other skills that spawn subagents.
---

# Efficient Orchestration — Always-On Task OS

Before touching anything, **analyse the task and make a delegation plan.** This isn't overhead — a 30-second analysis that routes three subtasks to light agents can save thousands of orchestrator tokens on a medium task. The decision is always: *would it cost fewer tokens to do this myself, or to write a precise spec and delegate it?*

## Step 1 — Task analysis (do this first, every time)

Read the task and classify it:

| Class | Shape | Default action |
|-------|-------|----------------|
| **Trivial** | One-line edit, single lookup, short answer — fits in one turn with no file-reading | Do it yourself inline. Delegation overhead exceeds savings. |
| **Contained** | A few files, clear scope, no data gathering — you can hold the whole thing comfortably | Do it yourself, but offload any pure-reading subtasks to a light/low agent first. |
| **Medium** | Multiple files or areas; includes data gathering, pattern sweeps, or reading you don't need in context | Do the judgment yourself; delegate reading and mechanical work to light low/medium agents. |
| **Large** | Many files, multiple dimensions, or scope you can't hold at once | Fan out to bounded-judgment sub-orchestrators per slice; each runs its own light workers. |

For anything Medium or larger, **write the delegation plan before starting**: which parts you'll handle inline, which you'll delegate, and to what model. A single sentence per subtask is enough. This plan also becomes the checkpoint baseline.

## Step 2 — The inline-vs-delegate decision

The question is always token cost, not effort:

**Delegate when:**
- The work is mostly reading files, grepping, listing, running commands, or pattern-matching — light agents do this as well as you do, at a fraction of the cost.
- The subtask is well-specified enough to hand to a smaller model with a tight prompt and a structured return format.
- Independent subtasks can run in parallel — batching them is free wall-clock time.
- You would have to read a lot just to discard most of it — let a smaller model filter first.

**Do it yourself when:**
- The task is genuinely short — the overhead of writing a delegation spec + waiting for a return costs more than just doing it.
- The subtask needs this conversation's full context and transferring it would be expensive.
- The result requires your judgment at every step, not just at the end (e.g., live interactive debugging with the user).
- You're verifying a claim — checking a subagent's output for accuracy is your job, not theirs.

The crossover point is roughly: if delegating saves more than 2–3x your spec-writing cost in return tokens, delegate. If it's close, consider the parallelism benefit — batched light agents often return faster than you'd process sequentially.

## Step 3 — Execute with monitoring

As you work, track against your initial classification:

- **Is this taking longer than estimated?** If a "contained" task has already consumed what you'd have spent on a medium task, it has reclassified. Checkpoint.
- **Are you reading files you don't need to hold in context?** Stop and spawn a light/low agent to extract just what you need.
- **Are independent subtasks serializing?** Batch them into one parallel dispatch.

**The checkpoint:** when a task exceeds its original class, pause, reassess, and restructure. Spawn subagents for the remaining work rather than continuing to burn orchestrator tokens on a task that's grown beyond its initial estimate. Tell the user briefly: "This turned out deeper than expected — fanning out the remaining parts."

## Model selection

Use model names actually exposed in the current session. If a named model is not available, choose the nearest class.

| Work | Model class |
|------|-------------|
| File listing, grep, import maps, command runs, reading files to extract exact facts, any "list every X" | **Light / Low**: Haiku; GPT-5.4-Mini low; Gemini Flash 3.5 low |
| Structured inventory, simple test fixes, small deterministic refactors, low-risk one-file edits | **Light / Medium**: GPT-5.4-Mini medium; Gemini Flash 3.5 medium; Haiku when no judgment is needed |
| Narrow implementation with edge cases, focused review over a few files, small bug fixes | **Light / High**: GPT-5.4-Mini high; Gemini Flash 3.5 high; Sonnet-class if available |
| Bounded judgment — bug hunting, UX critique, code review over a limited scope, implementing a normal well-specified slice | **Bounded judgment**: Sonnet-class; GPT-5.4 with appropriate effort |
| Coordination over a bounded slice — runs its own light workers, synthesizes results, returns one slice-level output | **Bounded sub-orchestrator**: Sonnet-class or GPT-5.4 high |
| Cross-cutting synthesis, fork decisions, contract design, sequencing, and **verifying outputs before acting** | **Orchestrator/top model** (you) |

Never spend a bigger model than the job needs. The cost of using the top model on a grep is the same whether or not the output justified it — and it never does.

## Chain of command

```
Orchestrator (large model — you)
  ├─ analyses the task, writes the delegation plan
  ├─ verifies critical outputs before acting on them
  └─ fans out to:
       ├─ Workers (light low/medium/high)        ← contained subtasks: direct dispatch
       └─ Sub-orchestrators (bounded judgment)    ← large tasks: each owns a slice,
            └─ run their own light workers             synthesises their own slice,
                                                        returns one result up
```

Keep the hierarchy shallow — one tier of sub-orchestrators covers almost everything. Deeper nesting adds coordination overhead without adding accuracy.

## Dispatch discipline

- **Narrow scope per agent.** A specific area or task, not "help with this." Overlap wastes tokens and produces duplicates.
- **Demand structured returns.** JSON or diff-only — not prose. You synthesize from data, not paragraphs.
- **Batch independent work.** Dispatch all independent agents in one turn.
- **Don't re-read what subagents covered.** Trust a `path:line` citation. Only open a file yourself to verify a high-stakes claim or design a contract.
- **Stand-alone prompts.** Subagents can't see this conversation. Every delegated prompt must carry enough context to act cold: file paths, the specific task, conventions, and what to return.

## Verification — the orchestrator's job

A returned result is a claim, not a fact. Before any critical output becomes action — a code change, a plan task, a spec assertion — spot-check it against the real evidence. Minor results can be trusted in bulk and sampled. This is why the large model stays in the loop: not to collate, but to be the quality gate.

## Reporting

When the task involves delegation, note briefly how work was split: what light agents handled, what bounded-judgment agents handled, what you verified yourself. One sentence is enough — it makes the token efficiency visible and lets the user trust that the cheap path didn't cut accuracy.

## Reference

Ready-to-paste dispatch prompts and structured return schemas: [references/dispatch-patterns.md](references/dispatch-patterns.md).
