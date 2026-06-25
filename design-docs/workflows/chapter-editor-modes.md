# Chapter Editor as an "Art Program" — Modes, Palette & Workflow Catalog

> **Status: EXPLORATION / BRAINSTORM.** No code. This is a design-direction document for the **single-chapter editor** (the Chapter Workspace), not the whole-book or library flow. It catalogs every workflow that runs through that one screen and proposes how to reorganize them around a creative-tool "palette + modes" model. It is the synthesis of a six-angle design panel (Apple HIG, paint-gesture/casting, read/performance, accessibility, AI casting, information architecture) channeling ~20 personas from [`design-docs/personas/persona-catalog.md`](../personas/persona-catalog.md).
>
> It **reorganizes the presentation** of workflows already specified in [`design-docs/plans/book_view_ia_proposal.md`](../../design-docs/plans/book_view_ia_proposal.md); it does not change the data model, the segment contract, or the bug-fix work in [`design-docs/plans/book_view_redesign/`](../../design-docs/plans/book_view_redesign/). See §14.

---

## 0. The problem this solves

The chapter editor today does **~30 distinct things on one surface at once**: two tabs (Script / Source-Text), a Book↔Script view toggle, Safe-text and Numbers toggles, *two* different voice-assignment idioms plus a per-span dropdown, a right cast sidebar, a bottom playback bar, inline per-span play/generate buttons, render controls, a progress bar, export, chapter nav, and a scaffolded lexicon panel. The owner's words: *"so many different things I can do all at once."*

The owner's reframe: **treat this screen like an art program.** Pick a tool from a palette, and that choice changes *how the text is treated* — pick **Voices** and you paint speaker assignments onto the text; pick **Read** and the page becomes a player that reads and scrolls; pick **Edit** and you change the words. Plus a regular **Book** view and a play-style **Script** view, and a future **AI pass** that reads the text and proposes the cast.

This is a genuine course-change. A prior (well-developed) spec had gone deliberately *modeless* and had *retired* the "paint" idiom. The panel's job was to decide whether the art-program direction is right and, if so, what the right shape is.

**The verdict: yes — but the win is in *organizing* affordances, not removing them.**

---

## 1. The core unlock: Mode ≠ View ≠ Panel

The single most important idea in this whole exploration. Five of six panelists independently arrived at it. The current screen is confusing because it **conflates three different things** into one undifferentiated pile of controls. Separate them and the overload dissolves:

| Concept | Definition | Examples | How you change it |
|---|---|---|---|
| **MODE** | Changes *what your gestures do* to the text. The tool in your hand. | Voices (paint) · Read (play) · Edit (type) | Left-rail palette; single key (`V`/`R`/`E`) |
| **VIEW** | Changes *how the text looks* on the page. The lens you read through. **Orthogonal to mode** — you can paint or read in either view. | Book (prose) vs Script (play-format) | One persistent toggle in the header |
| **PANEL** | Persistent *context* you consult. Never changes what a click does. | Cast (the palette of characters) · Lexicon (pronunciation) | Dockable; pin/unpin |

> **"Don't mode me in" is about *hidden* modes** (the surprise Caps-Lock, vi's insert/command trap) — not about deliberate, visible, chosen tool-modes. Photoshop has been modal since 1988; Procreate, Figma, DAWs, and Final Draft are *all* heavily moded, on purpose, and users love it. The art-program instinct is sound. The discipline that makes it work: the current mode is **always legible**, switching is **one tap/key**, and nobody can get trapped.

The biggest structural payoff: **Book vs Script are VIEWS, not modes.** This avoids mode-proliferation hell (Book-Read, Script-Read, Book-Paint, Script-Paint…). You pick *what you're doing* (mode) and *how the text is laid out* (view) as two independent choices.

---

## 2. Reconciling the tension: modes as *tool-focus on one persistent surface*

The sharpest objection (from the IA angle): **don't modes fragment the single-surface win** the prior spec fought for? If you can only paint in Voices mode and only hear audio in Read mode, haven't you just rebuilt separate screens?

**Resolution — the load-bearing principle of this whole design:**

> Modes change the **interaction model over one persistent prose surface** — they do **not** change the document or navigate away. A mode switch is a *tool swap*, never a page transition.

Concretely, that means five guarantees that keep the single-surface feel **and** deliver the de-cluttered art-program feel:

1. **One prose surface, always.** Modes never replace the document; they change what clicking it does.
2. **State persists across every switch** — chapter, scroll position, selection, playback position, render progress (see §11). You never lose your place.
3. **Assignments stay *visible* in all modes** (the character tints/labels are always shown) — they're just only *editable* in Voices mode.
4. **Playback is always one keypress away** (`Space`) even outside Read mode — the mode only changes whether the *transport chrome* is foregrounded.
5. **Render progress is ambient** — a global status pill + inline per-segment state are visible from any mode (see §4).

Under those constraints, "modes" are really **tool focus**. The surface stays modeless in its *persistence and visibility*; only the *tools* are moded. That is how the owner's mode-forward vision and the prior modeless spec are both honored.

---

## 3. Workflow catalog — the ~30 actions and where each lives

This is the requested catalog: every action that runs through the chapter page today, assigned to a Mode, a View toggle, a Panel, or always-on Global chrome.

### Global chrome (always visible, survives every mode switch)
| Action | Home |
|---|---|
| Chapter title edit | Header (inline) |
| Prev / next chapter | Header arrows |
| Chapter switcher (`Contents ▾`) | Header |
| Book ↔ Script **view** toggle | Header (view, not mode) |
| Safe-text / Numbers toggles | Header "text rules" popover (gear) |
| Render / Queue (one button, scope dropdown) | Header — primary CTA |
| Live render progress | **Ambient status pill** (top bar) + inline per-segment border |
| Save/dirty state | Header dot (saved / unsaved / error) |
| Export (WAV/MP3) | Header overflow `⋯` |
| Debug (dev) | Header overflow `⋯`, gated |
| Undo / redo | `Cmd+Z` / `Cmd+Shift+Z` (acts on active mode's stack) |

### Voices mode (the paint mode) — §5
Assign speaker to a span · drag-paint a run · load a character "brush" from the cast palette · variation (emotion) as the brush tip · eyedropper (sample an existing assignment) · eraser (unassign) · per-span variation tweak · "Detect Speakers" AI action (§8). **Cast panel** is this mode's active palette.

### Read / Preview mode (the listening booth) — §6
Play / pause / stop · seek · playback speed (0.5–2×) · prev/next segment · **tap a line to play from there** · karaoke highlight + scroll-follow · **flag a line** (non-destructive) · review flags. No assignment or edit affordances.

### Edit Text mode — §7
Edit the manuscript prose directly · commit (→ Resync Preview) · discard. Replaces today's separate "Source-Text" tab entirely.

### Panels (always consultable; pinnable)
**Cast & Voices** (the palette — owned by Voices, read-only reference elsewhere) · **Lexicon** (pronunciation, mode-agnostic).

### Killed / merged (the de-clutter wins)
- **Kill the Script / Source-Text *tab pair*** → there is one surface; Edit mode makes it editable. (Biggest single win.)
- **Kill the dual assignment idiom + the confirm popover** → in Voices mode the brush is already loaded, so assignment-on-gesture is immediate; the mode *is* the safety.
- **Kill the per-span inline voice dropdown** as an always-present control → it clutters the prose; moves to right-click / hover micro-toolbar.
- **Kill scattered per-span Play buttons** → replaced by tap-line-to-play in Read mode.
- **Merge "Review"** into the ambient document (inline segment state + Read-mode flagging) — no separate Review place.
- **Unify the 3–4 generate actions** into one "Render ▾" with scope (this segment / this character / all remaining / re-render all).

---

## 4. The palette & global chrome

**Palette = a vertical left rail.** Unanimous across the panel, same rationale each time: the top bar is global chrome, the right side is the Cast panel, the bottom is playback — **the left is unclaimed and matches the reading axis** (tool on the left, effect on the prose to its right; the convention of Photoshop / Figma / Procreate / VS Code).

- ~48px icon rail, label on hover (expandable to ~120px).
- Modes: **Voices** (brush) · **Read** (headphones/▶) · **Edit** (pen). A scaffolded slot for future tools (AI, emotion, pacing marks).
- **The current mode is impossible to miss:** filled rail highlight in the mode's color + a cursor-shape change + a two-word breadcrumb chip in the header ("VOICE MODE").
- Switch: click, or single keys `V` / `R` / `E`. `Esc` returns to Voices (the "home" mode). **Always reopen the editor in Voices mode**, never in whatever mode you left (avoids "my clicks don't do anything" confusion).
- **Quasimode (the standout idea):** hold **`Space`** in Voices mode to *temporarily* drop into Read/seek ("let me hear what I just painted"); release to snap back to painting. The most common micro-switch there is. *(Disabled in Edit mode, where Space is a character.)*

**Ambient render pill (top bar):** Idle → Queued → `Rendering 47% · ~3m` (arc) → Done (fades) → Error (sticks). Click for a non-modal segment-level popover. Visible from every mode — this is the answer to "how do I see render progress when I'm not in a render context."

---

## 5. Mode 1 — Voices (the paint mode)

The heart of the art-program vision. **The cast is the color palette; assigning a speaker is painting.**

- **Load the brush:** click a character swatch in the Cast palette → cursor becomes a paint cursor, and a **"current brush" chip** shows the loaded character's color next to the mode label. (Empty state: *"Tap a character to begin painting"* — solves the "I clicked and nothing happened" trap.)
- **Paint:** hover a span → live tint *preview* with the segment boundary shown → click to commit (a 150ms fill confirms the range). **Drag** across spans to paint a run.
- **Variation = the brush tip.** A voice's emotional variant (Urgent / Whisper / Warm) is a secondary property of the loaded brush, shown inline on the swatch. Re-paint the same speaker with a different variation to change *only* the emotional reading — a fast "sweep the whole flashback to Whisper" gesture that select-then-confirm can't match.
- **Eyedropper** (`Alt`/`Option`): sample an existing span's speaker+variation into the brush — continue what you set pages ago.
- **Eraser**: a palette tool that unassigns (falls back to chapter-default voice).
- **The Cast panel** is the three-tier registry from the prior spec (in-chapter / chapter-scoped temps / everyone else) — but here it's the *palette*, and editing a character's details happens in a detail drawer, not inline.

**Two hard requirements this mode imposes (both real, both grounded):**
1. **Mutation-batching for the paint gesture.** A drag = *one* batched assignment call on mouse-up; rapid single clicks debounce ~120ms. This is mandatory because the current code throws a **409 revision conflict when you assign adjacent spans quickly** (the known B2 bug). The paint model literally cannot ship without optimistic local commit + batched writes.
2. **Paint the unit the user *sees*** (see §13, open decision #1).

---

## 6. Mode 2 — Read / Preview (the listening booth)

Entering Read mode **dissolves the editor**: no palette, no sidebars, no per-span buttons. The page becomes a teleprompter-meets-transcript — one comfortable column, a floating transport you could run with your eyes closed.

- **Karaoke highlight + scroll-follow:** the playing span lights up, surrounding text dims, the line auto-centers. Feasible via the **CSS Custom Highlight API** (no DOM surgery — the spans already exist). Reduced-motion path = instant jump, no smooth scroll, no per-character animation.
- **Tap any line to play from there** (like clicking a DAW waveform). This is the primary verb — every line looks tappable.
- **Speed** 0.5–2× lives in the transport, not in settings.
- **Flag a line** (hold `F` / long-press) drops a non-destructive margin pin; a counter lets you review flagged lines afterward. **This absorbs what the old "Review tab" was for** — review happens *inside reading*, not as a separate place.
- **Manual-scroll smarts:** if the user scrolls away from the playhead, pause auto-follow and resume after a few seconds of inactivity (the thing most karaoke UIs get wrong).
- Speaker tints stay **visible but dimmed** (identity continuity without edit clutter).

---

## 7. Mode 3 — Edit Text

The same prose surface becomes editable. **Replaces the separate Source-Text tab** — it's not another document, it's the same one with the caret in it.

- Tints fade to subtle-but-visible; spans aren't click-targets; the caret is in the text.
- A slim banner: *"Editing source — assignments may need re-sync after saving."*
- Commit → the existing **Resync Preview** modal (diff; warns assignments may move) fires *after* commit, not on entry.
- **Guarded entry** (open decision #3): because accidental edits are costly, Edit may warrant a deliberate "unlock editing" step rather than being a one-tap peer of Voices/Read.

---

## 8. Action — AI "Detect Speakers" (seeds Voices; not a mode)

The panel was clear: AI casting is a **one-shot action that seeds Voices mode**, *not* a persistent mode and *not* a silent as-you-go overlay. You run it, triage the results, commit, and you're back painting. (It lives as a button in the Voices palette, not a 4th mode slot — keeps the mode count at three.)

The loop, honoring the product rule **"recommend, never auto-assign":**
1. **Trigger** "Detect Speakers" (becomes "Re-detect" once work exists, with a promise: *adds suggestions without touching confirmed work*).
2. **AI reads** (non-blocking; canvas stays live): finds named speakers, narrator blocks, and **un-tagged/ambiguous** speech.
3. **Triage panel** (a temporary third state of the right side): one card per detected speaker — confidence (HIGH/MED/LOW), line count, two sample quotes, a voice recommendation *with a reason*, and Accept / Merge / Rename / Reject. **Ambiguous dialogue gets its own section and defaults to *unassigned* rather than guessing.**
4. **Audition** the recommended voice inline; override from the five closest library matches.
5. **Commit** (the *only* moment anything changes): accepted proposals create/seed cast entries and land on the text as **"suggested" paint — visually distinct** (≈40% opacity + dashed underline; LOW/MED-confidence spans get amber so they draw the eye *before* "Confirm all").
6. **Confirm or repaint** in Voices mode (per span, per character, or whole chapter). Painting over a suggestion silently confirms-with-override.
7. **Re-detect never clobbers confirmed work** — it only touches unassigned/suggested spans; overwriting a confirmed span requires a deliberate, visually distinct "override confirmed" checkbox (default off). After a run: *"3 suggestions added, 0 confirmed spans modified."*

Narrator is special-cased: detected, but **no voice auto-recommended** (it's usually the author's lead choice).

---

## 9. Views — Book vs Script (orthogonal to modes)

A persistent two-segment toggle in the header, available in **every** mode, never resetting on a mode switch.

- **Book view** — prose paragraphs, per-character tinted spans, natural reading flow.
- **Script view** — `SPEAKER: line` play-format, theatrical, for read-through and performance preview.

They are a *reading preference*, like font size — orthogonal to whatever tool you're holding. You can paint voices in Script view or read in Book view. Safe-text and Numbers are sub-options of the view (a small "text rules" popover), not modes.

---

## 10. Accessibility — a requirement, not a lens

Modes + hover + drag + "painting" are classically hostile to keyboard, screen-reader, low-vision, and motor users — and hidden mode state is itself a cognitive hazard. The art-program vision is reachable for everyone **only if** these are treated as requirements, built on the WCAG-AA infrastructure the app already ships (reduced-motion guard, double-ring focus, 44px targets):

- **Every mode action has a non-pointer path.** Painting for keyboard = load brush (`C` then `1–9`) → navigate (`Tab` = sentence, `Arrow` = word) → apply (`Enter`); range via `Shift+Arrow`. Touch/switch = two-tap range (tap start, tap end, apply).
- **Roving-tabindex composite-widget pattern** for the manuscript (one tab-stop for the whole prose; Arrow keys move within). Without this, a 10k-word chapter is a 2,000-stop tab chain — the single most important a11y implementation note.
- **Mode + loaded brush are announced** (`aria-live="polite"`) and shown in a persistent status strip (Vim-style mode line), never only on hover.
- **Color is never the only signal of an assignment** (WCAG 1.4.1): tint **plus** an initials badge / distinct underline style / margin icon. Windows High-Contrast flattens all tints — the redundant signal must survive that.
- **Focus lands predictably on every mode switch** (never lost to `body`, never trapped); a focus sentinel restores prior position.
- **Reduced motion** = karaoke/scroll-follow become instant (binary off for per-character animation, not merely slowed — vestibular safety).
- **A dyslexia reading layer** (`D`): wider spacing, ~65ch column, optional dyslexia-friendly face, line shading; persists across sessions; stacks with any mode; desaturates tints so they don't fight tracking.

**The honest limit:** a screen-reader user has no equivalent of "cursor shape = current tool." Mitigation is continuous context — each focused span's `aria-label` states its assignment ("…assigned to Elena") so the active mode is implicitly confirmed on every move. This manages, but does not fully dissolve, the tension between the painting metaphor and non-visual use.

---

## 11. State & persistence model

A mode switch is a tool swap — the document never reloads. What survives every switch:

| State | Survives? |
|---|---|
| Current chapter | Always |
| Scroll position | Always |
| Selection / highlighted span | Yes |
| Playback position (keeps playing) | Yes — minimal now-playing strip persists outside Read |
| In-progress (unsaved) assignments | Yes |
| Uncommitted text edits | Yes, with a persistent banner; prose is read-only elsewhere until committed/discarded |
| View toggles (Book/Script, Safe-text, Numbers) | Yes (document-level prefs) |
| Render progress / generating set | Yes (ambient pill + inline borders) |

Chapter + scroll should live in the **route/session history**, not just component state, so returning from Book Home reliably resumes the last chapter at the last position (a documented contract, not an implementation accident).

---

## 12. Persona reactions (the wide net)

| Persona | Loves | Fears |
|---|---|---|
| **Power User** | Single-key modes + `Space`-to-listen quasimode; keyboard-speed work | Losing the per-span dropdown for surgical overrides |
| **Deadline Editor** | Read mode is finally a clean, dedicated proofing surface | Mode-switch cost breaking rhythm before the shortcuts are muscle memory |
| **Casual / Nontechnical Author** | Four icons asking one question ("what do I want to do?") beats a wall of controls | The brush metaphor's one conceptual step (load a character first); "Edit Text" sounding technical |
| **Casting Director** | Swatch-arm painting = flagging lines with a colored highlighter; triage cards with real sample quotes | Palette too narrow for 12+ characters; confident-wrong AI teaching people to stop listening |
| **Narrator Performer** | Variation-as-brush-tip swept across a passage; eyedropper to continue a voice; listen-through with flagging | Mis-painting a run of similar colors without noticing |
| **Series Editor** | Eyedropper for cross-chapter consistency; re-detect respecting confirmed work | A variation set on the wrong register, invisible until playback |
| **Screen-Reader Producer** | `aria-live` brush/mode announcements + per-span assignment labels | A palette of unlabeled colored swatches (needs name+initials+icon) |
| **Motor-Impaired Keyboard User** | `C+N` load → `Enter` paint, low keystroke count | `Shift+Arrow` range over a long chapter without sentence-jump |
| **Accessibility QA** | Builds on existing WCAG-AA infra; inline render state needs no "Review" mode | "Painting" pushing every micro-interaction pointer-only |
| **Dyslexic Reader** | A persistent reading layer that doesn't fight the tints | More color noise, not less, if tints lack redundant signals |
| **Large Catalog Curator** | Mode persists across chapters → batch-paint many chapters fast | Cast hidden outside Voices when inspecting while listening |
| **QA Engineer** | Explicit AI commit step; suggested-vs-confirmed visual split | Per-segment regenerate behaving differently across modes (new bug class) |

---

## 13. Key open decisions (owner's call)

These are genuine forks the reasoning can't settle alone — they're taste / product-priority calls:

1. **Paint granularity — the hardest joint.** Segments are *engine* units (contiguous same-speaker runs capped by the chunk limit), so a "segment" can end mid-dialogue for a non-semantic reason. **Recommendation:** let the user *paint the unit they perceive* (a sentence/clause), and coalesce contiguous same-speaker sentences into render-segments invisibly downstream — with a precision split (`Alt`+click) for sub-sentence cases. The alternative (paint raw segments) is simpler to build but will surprise users ("I clicked one sentence and three lit up"). **This is the #1 thing to decide before any build.**
2. **Primary persona.** The Nontechnical Author and the Power User pull the design in different directions (brush discoverability + onboarding investment; whether the Cast panel is gated to Voices or pinnable everywhere; how much keyboard surface to expose). **Recommendation:** optimize the *default* path for the Nontechnical Author (cast unpinned for full-width reading/editing; strong empty-state and first-run hints) and let Power Users opt into density (pin the cast, learn the keys). Worth your explicit call.
3. **Is "Edit Text" a peer mode or a guarded mode?** Peer = consistent and simple; guarded (deliberate unlock) = protects against accidental edits that trigger costly re-syncs.
4. **Flag follow-through depth.** Do flags need written notes + session persistence (production review) or are pins enough? (Review-Only Proofreader wants notes.)

---

## 14. Relationship to existing work + blind spots

**This is a presentation/interaction-model layer, not a teardown.** The workflows, the segment contract, the three-tier cast, the Character·Variation model, and the bugs **B1–B4** are unchanged from [`design-docs/plans/book_view_ia_proposal.md`](../../design-docs/plans/book_view_ia_proposal.md) and [`design-docs/plans/book_view_redesign/`](../../design-docs/plans/book_view_redesign/):
- **WL1 (bug fixes B1–B4) still comes first** and is *more* load-bearing now — the paint model hard-depends on the B2 (409 adjacent-paint) fix via mutation-batching, and on B1 (voice change invalidates audio).
- This doc mainly reframes **WL3 (the unified workspace)** and **WL4 (the assignment surface)** around modes + a palette, and gives **AI detect** (planned, unbuilt) and the **lexicon** concrete homes.
- The prior "modeless single surface" decision is *preserved in spirit* by §2 (modes as tool-focus on one persistent surface), not reversed.

**Blind spots the panel didn't cover (flagged for later):**
- **Narrow viewport / mobile.** The whole design assumes three edge-docked chromes (left rail + right cast + bottom transport). That won't fit a narrow window. *Latent upside:* the mode model actually helps — one mode = one focused surface = less simultaneous chrome — but a responsive collapse strategy is unspecified.
- **Onboarding is a real workstream, not an afterthought.** The brush metaphor has a learning curve for the majority (non-Procreate) user. First-run coachmarks, the empty-state prompt, and a `?` keyboard-help overlay need to be designed, not bolted on.
- **Aggregate render progress.** The single pill represents one chapter's render well; a full-book render needs the popover to disambiguate "47% of what?"

---

## 15. Appendix — how this was produced

Six independent design agents, each on a distinct angle and loading the matching skill, channeling persona clusters from the catalog; synthesized by a judge (consensus kept, contradictions resolved with reasons, unique insights surfaced, blind spots added from above the panel). Cross-examination was skipped deliberately — for a brainstorm, preserving the diversity of directions is more valuable than forcing convergence.

- **Interaction-model / HIG** → Mode≠View≠Panel taxonomy, left rail, quasimode (Power User, Deadline Editor, Casual)
- **Paint gesture / casting** → brush/variation/eyedropper/eraser, the 409 batching requirement (Casting Director, Narrator, Series Editor)
- **Read / performance** → listening booth, karaoke, flagging, the Book/Script "views are orthogonal" ruling (Narrator, Proofreader, Casual, Dyslexic)
- **Accessibility** → keyboard model, roving tabindex, non-color signals, the honest screen-reader limit (Screen-Reader Producer, Motor-Impaired, A11y QA, Dyslexic)
- **AI casting** → detect-as-seeding-action, triage, suggested-vs-confirmed, non-clobber re-detect (Casting Director, Series Editor, Nontechnical Author, QA)
- **Information architecture** → the fragmentation tension + its resolution, persistence model, ambient render, the de-clutter kills (Nontechnical Author, Large Catalog Curator, Power User, QA)
