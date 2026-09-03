# Persona Prompt Templates

These prompts are intended for Codex, Antigravity/Gemini, design review, or manual review sessions.

## Design Review Prompt

```text
Review this Audiobook Studio surface using these personas:
- [Persona 1]
- [Persona 2]
- [Persona 3]

For each persona, return:
1. The top 3 user-visible risks.
2. The exact UI/state/contract evidence behind each risk.
3. The smallest design or implementation change that would address it.
4. Any issue that is out of scope but should be tracked.

Prioritize concrete blockers over taste preferences.
```

## Decision Deliberation Prompt

Use when triaging a decision between options (design direction, scope cut, trade-off), not reviewing a finished surface.

```text
Deliberate on this decision as the following persona panel (see review-panels.md
"Panel discipline" — stay in lens, surface conflicts, don't average):
- [Persona list]

Decision: [the question, with the 2–3 real options on the table]

For each persona, return:
1. Position: prefers [option] / opposed to [option] / no stake (yield).
2. The concrete harm or benefit to THEM, tied to a friction point or red flag
   from their file (cite it).
3. What evidence or design change would flip their position.

Then, as the panel:
4. Conflicts: each disagreement as a named trade-off — who wins and who pays
   under each option.
5. Verdict: the option that survives, OR "owner call" with the single question
   that decides it. The Nontechnical Author (28)'s blockers outweigh preferences;
   accessibility-floor findings are vetoes, not votes.

Do not manufacture consensus. A 4–2 split with clear stakes is a better output
than unanimous mush.
```

## Adversarial QA Prompt

```text
Act as the selected persona panel for Audiobook Studio:
- [Persona list]

Stress-test this flow:
[flow or file list]

Return JSON:
{
  "blockers": [
    {
      "persona": "...",
      "risk": "...",
      "repro_or_evidence": "...",
      "suggested_fix": "..."
    }
  ],
  "non_blocking_findings": [],
  "coverage_gaps": []
}

Focus on failures a real user would hit, not speculative preferences.
```

## Implementation Planning Prompt

```text
Use design-docs/personas/persona-catalog.md and design-docs/personas/review-panels.md.

Plan the smallest safe implementation for:
[task]

Include:
- Which persona panel is relevant and why.
- The contracts or specs likely affected.
- The narrowest file scope.
- Behavior tests needed before implementation.
- Manual verification needed, if any.
- Explicit non-goals.
```

## Bug Triage Prompt

```text
Triage this reported issue through the Support And Recovery panel:
[bug report]

Return:
- Most likely user persona affected.
- Whether this is product confusion, implementation bug, plugin failure, environment failure, or missing documentation.
- Minimal reproduction path.
- Evidence to collect.
- Suggested owner: frontend, backend, plugin, docs, installer, or support.
```

## Release Readiness Prompt

```text
Review the release candidate with the Publish And Release Readiness panel.

For each persona, answer:
- What would stop release?
- What would cause user-visible embarrassment but not block release?
- What evidence would prove readiness?
- Which doc/spec/changelog entry must be aligned?
```
