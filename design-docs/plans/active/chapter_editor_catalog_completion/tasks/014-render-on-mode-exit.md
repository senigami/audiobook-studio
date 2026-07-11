# Task 014 — Render-on-mode-exit state tracking

Status: pending

Risk: quality-sensitive (greenfield console-shell architecture — R-C in `01-map.md`: "zero existing runtime hook to attach to... not a small wiring task")

## Goal

Make leaving Cast mode silently queue every segment whose assignment changed since Cast was last entered, and light the (not-yet-built, see task 015) On Air indicator — per `design-docs/workflows/chapter-editor-modes.md` §5 Hard requirement #2 and §13's "Render trigger" row: **"Render on mode-exit from Cast — not on timer, not on each stroke. Explicit tap in Booth bumps to top of queue."**

## Why this matters

Cast mode is pure assignment, no rendering. Today nothing renders anything on mode-exit at all — a user can paint an entire chapter of new assignments, switch to Booth, and hear stale audio with no signal that a re-render is even pending. This is the last missing link between "Cast paints" and "Booth plays back what was actually painted."

## Correction to prior research (verify-before-acting)

The map (`01-map.md` part J) and prior research state that `DirectorsTool` in `types.ts:26-27` "declares `onModeEnter`/`onModeExit` fields... reserved for future wiring." **This is not what the code currently does.** Reading `frontend/src/pages/ChapterEditor/components/DirectorsConsole/types.ts` in full: the interface (lines 15-28) has no `onModeEnter`/`onModeExit` members at all. Only the doc-comment (lines 12-14) *names* them as reserved identifiers for a future pass — the fields themselves don't exist yet. This task must **add** them, not just wire up something already declared. Treat this file's current 28 lines as ground truth over the map's line-number claim.

## Current shape (verified)

- `frontend/src/pages/ChapterEditor/components/DirectorsConsole/index.tsx` is the only place mode switches happen: `handleToolClick` (lines 44-51) and `handleConfirmSwitch` (lines 53-59) both call `setActiveToolId(...)` directly. Neither calls anything resembling `onModeExit`/`onModeEnter`. The file's own doc-comment (lines 20-23) already admits this: *"A future pass still wires additional mode state, keyboard shortcuts, and render-on-mode-exit hooks."*
- `CastTool`'s registration object (`CastTool/index.tsx:460-467`) is a **static, module-level** `DirectorsTool` literal (`id`, `label`, `icon`, `component`, `shortcut`, `demoPlaceholder`) built once at import time. It has no way to close over `CastToolBody`'s per-render React state today.
- **This static-registry shape conflicts with how the Console already solves an identical problem.** `DirtyGuardContext.tsx` exists precisely because *"Tool bodies are rendered with ZERO props (INV-1) so [reporting state to the console] can't be a prop — it's a Context instead."* `DirtyGuardProvider` wraps the active tool body (`index.tsx:116-118`); `CastToolBody` (or any tool) calls `useDirtyGuard().setDirty(...)` to report state up, and `DirectorsConsole` is the sole owner/reader of that state. Design doc §17's registration-object example (`onModeExit: flushRenderQueue`) is explicitly marked *"example shape — exact API TBD at implementation time"* — it is illustrative, not binding, and as written it can't carry live component state. **Follow the `DirtyGuardContext` precedent, not the static-object literal example**, for anything that needs access to `CastToolBody`'s own state (the changed-segment set). A stateless field on the registry object (e.g. a placeholder tool's no-op `onModeExit`) is fine to keep as a plain function reference for tools that need no state.
- **Assignment write path** (where "a segment changed" actually happens): `frontend/src/hooks/chapter/useChapterAssignments.ts` — `handleScriptAssign` (line 31) and `handleScriptAssignRange` (line 81) each individually await `api.saveScriptAssignments(chapterId, {...})` per event (line 57 / line 94). This is the same path task 001 (mutation-batching collector, part A in `01-map.md`) is meant to intercept. **Task 001 has not been written yet** (`tasks/` had no files besides this pass at drafting time) — do not block on it. If 001 lands first, extend its collector's public interface to also expose "segment ids touched this mode-session" (it already intercepts every assignment write, so it's the natural single place to track this) rather than building a second parallel tracker. If 014 is built before 001 exists, track changed segment ids directly in `CastToolBody` (e.g. a `Set<string>` in a ref, added to in the success path of `handleScriptAssign`/`handleScriptAssignRange` or wherever `CastTool/index.tsx` calls them) as a **stopgap with a narrow, swappable interface** (e.g. `flush(): string[]` that returns and clears the set) so it can be deleted in favor of 001's collector later without changing the shape the mode-exit hook consumes.
- **Render-trigger primitive — do not use `handleQueue`.** `useStudioChapter.ts`'s `handleQueue` (calling `executeQueue` in `frontend/src/hooks/chapter/useChapterQueue.ts:98-134`) is the whole-**chapter** "Queue Chapter" button action: it pops a confirm modal for "Large Chapter Warning" (>50k chars) and a destructive "Rebuild Chapter" warning when audio is already complete (`useStudioChapter.ts:688-718`). That is the opposite of "queued for re-render **silently**" (§5 #2) and queues the whole chapter, not just changed segments. The correct existing primitive is **`handleGenerateWithFallback(segmentIds: string[])`** (`useStudioChapter.ts:419-431`, wrapping `handleGenerate` from `useChapterQueue.ts:29-96` → `api.generateSegments(freshIds, voice)`), which is segment-scoped, silent (only blocks with a modal if the resolved voice is unavailable), and **already wired** as `ScriptView`'s `onGenerateBatch` prop in `CastTool/index.tsx:333` (`onGenerateBatch={(spanIds) => void handleGenerateWithFallback(spanIds)}`). Reuse this exact function for the mode-exit flush; do not invent a new render-trigger API and do not repurpose `handleQueue`.
- Design doc cross-references: §4 ("Ambient render pill... Idle → Queued → Rendering 47% · ~3m → Done → Error"), §5 Cast "Hard requirements" #2 (full text above), §13's "Render trigger" row (Booth's bump-to-top is a *separate, simpler* manual interaction, not an automatic mode-exit side effect), §17's registration-object sketch (illustrative only, see above).

## Target shape

1. **Types**: add to `DirectorsTool` in `types.ts`:
   ```ts
   onModeEnter?: () => void;
   onModeExit?: (changedSegmentIds: string[]) => void | Promise<void>;
   ```
   Update the doc-comment (lines 12-14) to stop calling these "reserved and unused" once at least one tool implements them. Tools with no state (placeholders) may leave both undefined and are unaffected.
2. **A context, not a registry callback, for anything stateful.** Add a mode-exit reporting channel analogous to `DirtyGuardContext` — either extend `DirtyGuardContextValue` with something like `registerModeExitHandler: (fn: (() => void | Promise<void>) | null) => void`, or add a small sibling context in the same file/pattern. `CastToolBody` registers (via a ref, updated in an effect so it always points at the latest closure) a handler that: (a) calls the changed-segment tracker's `flush()` to get the ids and clear it, (b) if the list is non-empty, calls `handleGenerateWithFallback(ids)`. `DirectorsConsole` calls the currently-registered handler in `handleToolClick` (before `setActiveToolId`) and in `handleConfirmSwitch` (before switching), but **only when the tool being left is Cast** (or, more generally, only when a handler is actually registered — other tools have nothing to flush).
3. **`onModeEnter` is not load-bearing for this task.** The design doc's hard requirement is about exit, not entry (§5 #2). Since exit always flushes and clears the tracked set, re-entering Cast naturally starts from empty — no reset logic is needed on entry for this task's scope. Add the type field (§17 names it) but do not force a speculative implementation; a genuinely stateless tool may simply omit it.
4. **Booth's "explicit tap bumps to top of queue"** (§13) is a distinct, simpler, user-initiated interaction on an already-queued/rendering segment — **not** part of this task's mode-exit side effect. Scope it as a small addendum only if a natural, low-risk hook point already exists in Booth's current render-status UI once this task's plumbing lands; otherwise flag it explicitly as its own small follow-up rather than folding it in and complicating this task's core scope.
5. **The "silently" requirement has one real edge case to handle explicitly (caught in
   adversarial review): `handleGenerateWithFallback` can itself show a blocking modal** when
   the resolved voice for a changed segment is unavailable (per its existing, unmodified
   behavior — see Current shape). If this fires during a mode-exit flush, a user clicking
   the Booth tab would be unexpectedly met with a "voice unavailable" modal instead of
   landing in Booth — the opposite of "silent." This task must decide and implement one of:
   (a) let the mode-switch itself proceed immediately (don't block navigation on the flush's
   result) and let the modal appear over whichever mode the user landed in, so the switch
   itself is never blocked even if the render-queue call surfaces a modal a moment later; or
   (b) suppress the voice-unavailable modal specifically for a mode-exit-triggered call
   (log/toast instead) and let the user discover the issue when they next try to render
   from Cast. Recommend (a) — it's a smaller change (don't await the flush before switching
   modes) and doesn't suppress real information, it just decouples "switching modes" from
   "waiting for the render call's own UI side effects." Do not ship this task without an
   explicit decision on this point recorded in the status update.

## Steps

1. Read `DirtyGuardContext.tsx` in full (already done during research — reread before implementing) and decide: extend it, or add a sibling context file next to it, mirroring its shape (provider takes a console-owned setter/ref; hook returns a registration function; no-op default so tests/isolated renders don't need special-casing).
2. Add the changed-segment tracker inside `CastToolBody` (stopgap Set+ref, or task 001's collector if it exists by the time this is built) with a `flush(): string[]` shape.
3. Wire the tracker into whatever currently calls `handleScriptAssign`/`handleScriptAssignRange` in `CastTool/index.tsx` so every successful assignment adds to the tracked set.
4. Register the mode-exit handler from `CastToolBody` via the context from step 1; have it call `flush()` then `handleGenerateWithFallback(ids)` when non-empty.
5. Wire the invocation into `DirectorsConsole/index.tsx`'s `handleToolClick`/`handleConfirmSwitch`, before the tool actually switches.
6. Add `onModeEnter`/`onModeExit` to `types.ts`'s `DirectorsTool` interface; update its doc-comment.
7. Live-verify (not just unit tests): paint several new assignments in Cast, switch to Booth, confirm a render job gets queued for exactly the changed segments (not the whole chapter) with no confirmation dialog, and confirm nothing renders while still in Cast.

## Acceptance criteria

- [ ] `DirectorsTool` in `types.ts` declares `onModeEnter`/`onModeExit`, matching the target shape above.
- [ ] Switching away from Cast with pending changed assignments triggers exactly one silent call to `handleGenerateWithFallback` with exactly the changed segment ids (verified: not the whole chapter's segment ids, no confirm modal shown).
- [ ] Switching away from Cast with **no** changed assignments since entry triggers no render call at all.
- [ ] Switching between non-Cast tools (Booth → Revise, etc.) does not trigger any render call.
- [ ] The dirty-guard confirm-switch path (`handleConfirmSwitch`) also fires the mode-exit flush — a user who confirms "switch anyway" over the unsaved-changes modal must not silently skip the render trigger.
- [ ] A changed segment whose voice is unavailable at mode-exit time does not block or delay the mode switch itself — the switch completes immediately regardless of what `handleGenerateWithFallback`'s own modal does (see Target shape point 5).
- [ ] No new field/callback is stuffed into the static `registry.ts` tools array for stateful behavior — stateful reporting goes through context, consistent with the existing `DirtyGuardContext` pattern (INV: don't add a second, incompatible state-reporting mechanism next to the one that already exists for the same tool-body-to-console direction).
- [ ] `./venv/bin/python -m pytest -q` (no backend touched, should be a no-op run) and `npm -C frontend run test -- --run` both clean.
- [ ] Relevant spec (`chapter-editor-modes.md` is a design doc, not a `design-docs/specs/` contract — check whether any `design-docs/specs/` file describes Cast's render-trigger behavior; if one exists, bump it per the binding CLAUDE.md rule, otherwise note none applies).

## Map links

Part J in `01-map.md`. Risk R-C. Design doc §4, §5 hard requirement #2, §13 "Render trigger" row, §17 (registration example — illustrative only, see Current shape above).

## Dependencies

None blocking — independent per the roadmap (`02-roadmap.md`, Workload 6). Soft-couples to task 001 (mutation-batching collector) if it lands first: extend its interface instead of building a second tracker. Blocks task 015 (Ambient On Air indicator needs this task's changed-segment flush + render-trigger event to know when a mode-switch-driven render starts, in addition to whatever Cast's own manual `onGenerateBatch` already queues).

## Out of scope

- Booth's "tap bumps to top of queue" manual re-prioritization — addendum-or-follow-up only, see Target shape point 4.
- Building the On Air indicator itself (task 015) — this task only needs to make the render-trigger event observable (e.g. by whatever picks it up next), not render any UI for it.
- Task 001's actual mutation-batching collector — build the stopgap tracker described above only if 001 doesn't exist yet when this task starts; do not build 001's full collector as part of this task.
