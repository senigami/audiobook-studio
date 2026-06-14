# Dispatch patterns — ready-to-paste prompts

Copy-paste starting points for common dispatch scenarios. Adjust the bracketed placeholders for your task. Every prompt ends with "Return only the JSON/diff/result" — this keeps the orchestrator's synthesis cheap.

## Discovery (light / low)

Use Haiku, GPT-5.4-Mini low, Gemini Flash 3.5 low, or the nearest available light/low model.

**File map:**
> Read-only. Map `<root>` to 2–3 directory levels. Return JSON: `{ "tree": [{"path","kind","approx_lines","role"}], "layers": ["how code is actually layered"], "entry_points": [] }`. Use file names and sizes — do not read full bodies. Return only the JSON.

**Pattern sweep:**
> Read-only. Grep `<root>` for: hardcoded colors/hex/rgb, hardcoded pixel values, duplicated string literals, `any`/unsafe casts, unused exports, TODO/FIXME, empty catch blocks. Return JSON keyed by category, each a list of `{path, line, snippet}`. Cap at 30 per category and note if truncated. Return only the JSON.

**Plan / TODO status:**
> Read-only. Find every plan/roadmap/TODO artifact under `<root>` (docs/, README, *.md, code TODOs). For each item, look for code evidence it's implemented. Return JSON: `[{"item","source_file","claimed_status","code_evidence","actual_status":"done|partial|not-started|contradicted"}]`. Return only the JSON.

**Test inventory:**
> Read-only. List every test file under `<root>`. For each, summarize what it actually asserts and classify: `real` (exercises real behavior), `mock-only` (asserts on mocks, not real logic), `tautological` (always passes), `smoke` (renders/boots, asserts little). Return JSON: `[{path, test_count, classification, what_it_covers, gap_notes}]`. Return only the JSON.

## Bounded judgment (light high or bounded model)

Use GPT-5.4-Mini high, Gemini Flash 3.5 high, Sonnet-class, or the nearest available bounded-judgment model.

**Code review over a slice:**
> Read-only. Here is the slice brief: `<paste>`. Review `<area>` for: correctness issues, violated conventions, missing error handling, duplication worth extracting. For each finding, return: `{severity: "critical|major|minor", title, locations: ["path:line"], problem, proposed_correction}`. Return a JSON array of findings only.

**Spec-vs-code drift check:**
> Read-only. Here is the spec excerpt: `<paste>`. Compare it against `<files>`. Find where the code contradicts the spec — wrong error shape, wrong naming, missing behavior, wrong default. For each gap return: `{spec_ref, code_location, discrepancy, recommended_resolution}`. Return JSON array only.

**Implementation of a well-scoped slice:**
> Implement this change: `<precise spec — files, what to add/change, conventions, utilities to reuse>`. Return the completed diff only. Do not make changes outside this scope.

## Sub-orchestrator (bounded model — large tasks)

Use a Sonnet-class or GPT-5.4 high sub-orchestrator. Have it dispatch light low/medium workers for mechanical reading.

> You are a sub-orchestrator for `<slice, e.g. packages/ui>`. Read-only — neither you nor your workers may edit anything.
>
> 1. Dispatch light workers (file map + pattern sweep + test inventory) scoped to `<slice>` in parallel. Collect their structured returns.
> 2. Apply these audit dimensions yourself: `<list>`. Have light workers do the bulk reading; you do the judgment.
> 3. Verify your critical/major findings against the real code before reporting.
>
> Return a single JSON object: `{ "area": "<slice>", "summary": "2–3 sentences on health of this slice", "findings": [<finding schema>], "skipped_dimensions": [{"dimension","reason"}] }`. Return only the JSON.

## Standard finding schema

Use this across all audit and review agents so synthesis is mechanical:

```json
{
  "id": "short-stable-slug",
  "severity": "critical | major | minor",
  "title": "one line",
  "locations": ["path:line"],
  "problem": "what's wrong and why it matters, concretely",
  "proposed_correction": "target shape / fix approach (not the diff)",
  "spec_ref": "docs/NN-*.md#section or null",
  "effort": "S | M | L"
}
```

**Severity tiers:** critical = bug / data loss / security / broken contract; major = real correctness/maintainability/UX problem that will bite; minor = style/polish.
