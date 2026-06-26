# Chapter Editor as an "Art Program" — Modes, Palette & Workflow Catalog

> **Status: DECISIONS RECORDED — 2026-06-26.** No code yet. This is a design-direction document for the **single-chapter editor** (the Chapter Workspace), not the whole-book or library flow. It catalogs every workflow that runs through that one screen and proposes how to reorganize them around a creative-tool "palette + modes" model. It is the synthesis of a six-angle design panel (Apple HIG, paint-gesture/casting, read/performance, accessibility, AI casting, information architecture) channeling ~20 personas from [`design-docs/personas/persona-catalog.md`](../personas/persona-catalog.md).
>
> It **reorganizes the presentation** of workflows already specified in [`design-docs/plans/book_view_ia_proposal.md`](../../design-docs/plans/book_view_ia_proposal.md); it does not change the data model, the segment contract, or the bug-fix work in [`design-docs/plans/book_view_redesign/`](../../design-docs/plans/book_view_redesign/). See §14.
>
> **Owner decisions recorded 2026-06-26 (updated same day, session 2)** — Write mode added as Mode 4 (§7b, §13); emotion/variation palette architecture decided via 5-persona fusion panel (annotation gutter, Inspector drawer post-v2, segment extensibility — §13, §16); Book-level casting map and import annotation extractor catalogued (§16). See §13 for all resolved decisions.

---

## 0. The problem this solves

The chapter editor today does **~30 distinct things on one surface at once**: two tabs (Script / Source-Text), a Book↔Script view toggle, Safe-text and Numbers toggles, *two* different voice-assignment idioms plus a per-span dropdown, a right cast sidebar, a bottom playback bar, inline per-span play/generate buttons, render controls, a progress bar, export, chapter nav, and a scaffolded lexicon panel. The owner's words: *"so many different things I can do all at once."*

The owner's reframe: **treat this screen like an art program.** Pick a tool from a palette, and that choice changes *how the text is treated* — pick **Voices** and you paint speaker assignments onto the text; pick **Read** and the page becomes a player that reads and scrolls; pick **Edit** and you change the words. Plus a regular **Book** view and a play-style **Script** view, and a future **AI pass** that reads the text and proposes the cast.

This is a genuine course-change. A prior (well-developed) spec had gone deliberately *modeless* and had *retired* the "paint" idiom. The panel's job was to decide whether the art-program direction is right and, if so, what the right shape is.

**The verdict: yes — but the win is in *organizing* affordances, not removing them.**

---

## 1. The core unlock: Mode ≠ View ≠ Panel

The single most important idea in this whole exploration. Five of six panelists independently arrived at it. The current screen is confusing because it **conflates three different things** into one undifferentiated pile of controls. Separate them and the overload dissolves:

| `Concept` | `Definition` | `Examples` | `How you change it` |
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

### Revise mode (in-place edit) — §7
Edit one paragraph inline · commit (re-renders that segment only) · discard.

### Write mode (full source editor) — §7b
Edit the full chapter source · commit (→ Resync maps speaker assignments to new text) · discard. For blank chapters and large structural changes. Intentionally destructive to existing speaker assignments (labeled — the Resync preserves what it can). Always accessible, not just for new chapters.

### Panels (always consultable; pinnable)
**Cast & Voices** (the palette — owned by Voices, read-only reference elsewhere) · **Lexicon** (pronunciation, mode-agnostic).

### Killed / merged (the de-clutter wins)
- **Kill the Script / Source-Text *tab pair*** → there is one surface; Write mode (full edit) and Revise mode (in-place) replace both tabs. (Biggest single win.)
- **Kill the dual assignment idiom + the confirm popover** → in Voices mode the brush is already loaded, so assignment-on-gesture is immediate; the mode *is* the safety.
- **Kill the per-span inline voice dropdown** as an always-present control → it clutters the prose; moves to right-click / hover micro-toolbar.
- **Kill scattered per-span Play buttons** → replaced by tap-line-to-play in Read mode.
- **Merge "Review"** into the ambient document (inline segment state + Read-mode flagging) — no separate Review place.
- **Unify the 3–4 generate actions** into one "Render ▾" with scope (this segment / this character / all remaining / re-render all).

---

## 4. The palette & global chrome

**Palette = a vertical left rail.** Unanimous across the panel, same rationale each time: the top bar is global chrome, the right side is the Cast panel, the bottom is playback — **the left is unclaimed and matches the reading axis** (tool on the left, effect on the prose to its right; the convention of Photoshop / Figma / Procreate / VS Code).

- ~48px icon rail, label on hover (expandable to ~120px).
- Modes: **Cast** (microphone) · **Booth** (headphones) · **Write** (document) · **Revise** (pencil). A scaffolded slot for future tools (Script Supervisor, plugin slots).
- **The current mode is impossible to miss:** filled rail highlight in the mode's color + a cursor-shape change + a two-word breadcrumb chip in the header ("VOICE MODE").
- Switch: click, or single keys `V` / `R` / `W` / `E`. `Esc` returns to Cast (the "home" mode). **Always reopen the editor in Cast mode**, never in whatever mode you left (avoids "my clicks don't do anything" confusion).
- **Quasimode (the standout idea):** hold **`Space`** in Voices mode to *temporarily* drop into Read/seek ("let me hear what I just painted"); release to snap back to painting. The most common micro-switch there is. *(Disabled in Edit mode, where Space is a character.)*

**Ambient render pill (top bar):** Idle → Queued → `Rendering 47% · ~3m` (arc) → Done (fades) → Error (sticks). Click for a non-modal segment-level popover. Visible from every mode — this is the answer to "how do I see render progress when I'm not in a render context."

---

### Recording studio terminology (canonical — supersedes paint metaphor)

The left rail and mode names use **authorship + recording studio** language, not paint program language. The paint metaphor was useful for describing the interaction pattern in design; users never see it.

| Interaction concept | User-facing name | Icon |
|---|---|---|
| Left rail (mode switcher) | **Director's Console** | — |
| Voices/paint mode | **Cast** | Microphone |
| Read/preview mode | **Booth** | Headphones |
| Full-chapter source editor | **Write** | Document |
| In-place paragraph editor | **Revise** | Pencil |
| AI detect speakers action | **Casting Call** | Wand/stars |
| AI manuscript analysis (future) | **Script Supervisor** | Clipboard |
| Plugin tool slot (future) | *(plugin-defined)* | Plugin-defined |
| Ambient render indicator | **On Air** (red dot) | ● |
| Eyedropper (copy voice) | **Match Voice** | — |
| Eraser (unassign) | **Narrator** (revert to default) | — |

**The left rail is a slotted list**, not hardcoded to three items. Future tools (Script Supervisor, plugin-contributed) register a slot; the rail renders them in order. This is internal-only in v1 — no external plugin API exposed yet. Each tool has a matching **demo placeholder** so the Director's Console can be fully mocked in the demo with "coming soon" states for unreleased tools.

---

---

## 5. Mode 1 — Cast (the voice assignment mode)

*(Formerly "Voices mode" — see §4 terminology table.)*

The heart of the director's workflow. **The cast is the palette; assigning a speaker is marking up the script.**

- **Load the voice:** click a character swatch in the Cast palette → cursor becomes an assignment cursor, and a **"current voice" chip** shows the loaded character's color next to the mode label. (Empty state: *"Tap a character to begin assigning"* — solves the "I clicked and nothing happened" trap.)
- **Assign:** hover a span → live tint *preview* → click to commit (a 150ms fill confirms the range). **Drag** across spans to assign a run.
- **Brush size** (DECIDED): the assignment unit is a sizable control in the Cast palette — **Word · Sentence · Paragraph**. Never a raw segment (segments are engine units, not user-visible reading units). Default is Sentence. The user picks the size before clicking; it determines how much text lights up on hover and gets assigned on click.
- **Variation = the emotional register.** A voice's variant (**Natural / Whisper / Urgent**) is a secondary property of the loaded voice, shown as a **3-button inline toggle** in the Cast palette next to the "current voice" chip — always visible when a speaker is loaded, never in a drawer or expandable section. Available variations reflect what the voice library actually has recorded; unavailable options are visually disabled (not a silent fallback). Adjacent lines of the same speaker in different variations become separate render segments (different audio models). Variation assignments carry through into Booth mode via speaker tints and the annotation gutter — the user must not return to Cast mode to see what was assigned.
- **Match Voice** (`Alt`/`Option`): sample an existing span's speaker+variation into the active voice — continue a voice from earlier in the chapter.
- **Narrator** (eraser tool): unassigns the span, falling back to the chapter-default voice. Text is read aloud in the default narrator voice.
- **Stage Direction** (skip marker): marks a span as *excluded from the TTS queue entirely*. The text remains in the document and is visible on screen — it is never rendered as audio and never passed to the TTS engine. Keyboard shortcut `S` in Cast mode. Appears as a built-in system entry in the Cast palette (like Narrator — always present, not user-created). **Visual treatment:** Geist Mono, slightly smaller than prose, muted gray — no character tint. Reads like a printed stage direction (Courier aesthetic, typographically subordinate). A ⊘ glyph appears in the annotation gutter for each skipped span so they're identifiable without reading the text.

  **Stage Direction also serves as the inline human-note system.** Rather than a separate notes field or annotation drawer, a director or author writes contextual intent directly into the text flow and paints it Stage Direction. The narrator sees it exactly where it applies — right before the line it governs — and the TTS engine skips it entirely:

  > *She picked up the letter.*
  > `[Elena is hiding something — voice catches, trailing off]`  ← painted Stage Direction
  > *"I've never seen this before."*

  Applies to: stage directions, action lines, parenthetical tone cues (`[bitterly]`, `(quietly)`), chapter headings, epigraphs, section dividers (`***`), author's notes, any inline contextual direction for the human performer. **Auto-detect on import:** the import annotation extractor (§16) automatically paints Stage Direction on Fountain action lines and parentheticals, queuing them for confirmation.

  **Annotation gutter glyph:** ⊘ (no audio, human-only).

- **Performance Cue** (engine directive): the companion to Stage Direction. Keyboard shortcut **`P`** in Cast mode. Displays in the same Geist Mono / muted visual style inline in the document, but carries a structured SSML payload that *is* sent to the TTS engine for the **first renderable segment that follows it** in document order (skipping any Stage Direction or other Performance Cue spans between them). If multiple Performance Cues precede one segment, their SSML values merge (last value per parameter wins; descriptions concatenate with ` · `). A cue with no following renderable segment displays correctly but its payload is never consumed. Created via the **Cue Editor** — a small inline popover (not a mode, not a drawer) with two fields:
  1. **SSML parameter pickers** — Rate (slow / normal / fast / **Other…**), Pitch (low / normal / high / **Other…**), Volume (soft / normal / loud / **Other…**). Selecting "Other" reveals a text input; the typed value passes through to the engine payload as-is, allowing raw SSML values (`0.6x`, `+15%`) or model-specific tokens. An optional free-text **style prompt** field handles fully open-ended direction for models that accept natural language.
  2. **Description** (optional) — free-form human note; shown in the inline display but never sent to the engine.

  The Cue Editor generates a combined human-readable inline display by translating the selected SSML values to natural-language labels and appending the description. Display rules:
  - Both SSML and description: `[slowly · low | voice catches, trailing off]` — `|` separates engine values (left) from human description (right)
  - SSML only: `[slowly · low]` — no `|`
  - Description only: `[voice catches, trailing off]` — no `|`; displays identically to Stage Direction text but with ⚡ gutter glyph

  The engine receives the structured SSML payload regardless of display format; the human sees the combined annotation.

  **Engine availability:** XTTS does not accept SSML prosody — for XTTS renders, Performance Cues display correctly but the payload is not consumed. The data is preserved so that when a capable engine (Voxtral or later) is used, the cues feed through automatically. **Ships v1 as model + display; engine consumption is engine-dependent.**

  **Annotation gutter glyph:** ⚡ (engine-active). Distinguishes at a glance from ⊘ Stage Directions without opening anything.
- **The Cast panel** is the three-tier registry (in-character / chapter-scoped temps / everyone else) — the *palette*. Editing a character's details happens in a detail drawer.

**Hard requirements:**

1. **Mutation-batching for the assignment gesture** (B2 fix). Architecture: each assignment gesture fires an event → a collector queue picks it up → the queue flushes as a single batched write on gesture-end (or every ~120ms for held drags). The UI commits the assignment optimistically on every click; the server write happens asynchronously. No 409 conflicts because the server sees one atomic operation per gesture, not one per click. This is mandatory — the assignment model cannot ship without it.

2. **Render on mode-exit** (DECIDED). Cast mode is purely for assignment — no rendering, no queuing. When the user switches to Booth, Revise, or any other mode, all segments with changed assignments since the last mode-entry are queued for re-render silently. The **On Air** indicator lights. If the user taps a specific segment in Booth before it finishes rendering, that segment is bumped to the top of the render queue.

3. **Paint the unit the user sees** (DECIDED — Sentence default, Word/Paragraph selectable).

---

## 6. Mode 2 — Booth (the listening booth)

Entering Read mode **dissolves the editor**: no palette, no sidebars, no per-span buttons. The page becomes a teleprompter-meets-transcript — one comfortable column, a floating transport you could run with your eyes closed.

- **Karaoke highlight + scroll-follow:** the playing span lights up, surrounding text dims, the line auto-centers. Feasible via the **CSS Custom Highlight API** (no DOM surgery — the spans already exist). Reduced-motion path = instant jump, no smooth scroll, no per-character animation. **Stage Direction and Performance Cue spans are both skipped by the karaoke highlight and the playhead** — the visual cursor jumps over them as if they don't exist in the audio timeline; they remain on screen in their Geist Mono treatment.
- **Tap any line to play from there** (like clicking a DAW waveform). This is the primary verb — every line looks tappable. Tapping a Stage Direction or Performance Cue span seeks to the next renderable segment after it.
- **Speed** 0.5–2× lives in the transport, not in settings.
- **Flag a line** (hold `F` / long-press) drops a non-destructive margin pin; a counter lets you review flagged lines afterward. **This absorbs what the old "Review tab" was for** — review happens *inside reading*, not as a separate place.
- **Manual-scroll smarts:** if the user scrolls away from the playhead, pause auto-follow and resume after a few seconds of inactivity (the thing most karaoke UIs get wrong).
- Speaker tints stay **visible but dimmed** (identity continuity without edit clutter).

---

## 7. Mode 3 — Revise (edit text)

*(Formerly "Edit Text mode.")*

The same prose surface becomes editable. **Replaces the separate Source-Text tab** — it's not another document, it's the same one with the caret in it.

### In-place paragraph editing (DECIDED — primary path)

Click a paragraph → only that paragraph's text becomes editable inline. Tints fade to subtle but stay visible; spans in other paragraphs remain read-only. A slim banner appears: *"Editing — save to re-render this section."*

On commit: only the edited segment's audio is invalidated and queued for re-render. If the segment is unchanged in length, it re-renders cleanly. **Data model note:** the chapter stores source text as a canonical blob; segments are derived from it with speaker assignments overlaid. An in-place paragraph edit modifies one segment's `text` field directly — downstream segments are untouched.

**Segment overflow and balanced split** (DECIDED): if an edit causes the segment text to exceed the engine's character buffer (e.g., ~500 chars for XTTS), a naive split at the limit could leave a 3-word orphan segment — too short for the engine to read prosody or emotion correctly. The correct behavior:

1. Find the nearest **sentence boundary** (`.`, `?`, `!`, `;`) to the **midpoint** of the combined text.
2. Split there. Both halves must be above a minimum floor (~80–100 characters) to carry enough prosodic context.
3. If no sentence boundary exists near the midpoint and one half would fall below the floor, **do not split** — let the segment run slightly long and surface a passive indicator to the user (not a blocking error).
4. Both split segments inherit the original speaker assignment.

**For large structural changes** (add/remove paragraphs, reorder content, cross-segment edits) — use **Write mode (§7b)**. Write mode is a first-class Director's Console mode that exposes the full chapter source as an editable document. It is always accessible, including after speaker assignments have been made.

---

## 7b. Mode 4 — Write (full source editor)

The chapter's complete source text, fully editable. **Write mode is always accessible** — not just for blank chapters, but also after speaker assignments exist. When an author needs to move paragraphs, restructure scenes, or make changes that cross segment boundaries, Write is the right tool.

- The full prose surface becomes editable as a single document with no per-segment lock.
- Speaker tints **fade to very subtle** — assignments remain visible but non-intrusive; editing is the primary focus.
- A persistent banner: *"Write mode — editing the full source. Assignments will be re-synced on exit."*
- **On exit:** the Resync runs the existing `get_resync_preview` → `apply_resync` pipeline (`app/domain/chapters/operations.py`). The algorithm is **positional + exact text match**: for each new sentence at index `i`, if the old segment at index `i` has identical stripped text, the assignment is preserved; otherwise it clears. The preview is shown to the user before any write: *"8 of 12 assignments recovered, 4 cleared — Elena, Marcus affected."* This algorithm is already live and working; Write mode consumes it, it is not redefined here.
- **Intentionally destructive** to assignments when structure changes significantly — this is correct behavior and must be clearly labeled. The author choosing Write mode for a large structural edit accepts this trade-off.
- **Always accessible**: Write mode is not tucked away, not protected by an "advanced" gate, not hidden after assignments are made. Large revisions are a legitimate authoring workflow. "It will be destructive of the speakers, but that's a small price to pay when you really need to make an edit that's large." *(Owner decision 2026-06-26)*
- **Blank chapter default:** a new chapter with no content opens in Write mode automatically (nothing to cast or listen to yet).
- **Shortcut:** `W`. **Icon:** Document / typewriter.

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
| **Power User** | Single-key modes (`V`/`R`/`W`/`E`/`S`/`P`); keyboard-speed work; render-on-exit keeps painting uninterrupted | Losing the per-span dropdown for surgical overrides; any animation that masks real state |
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

## 13. Design decisions (owner-resolved 2026-06-26)

All four open decisions from the original brainstorm have been resolved.

| # | Decision | Resolution |
|---|---|---|
| 1 | **Assignment granularity** | **Word / Sentence / Paragraph** brush sizes; Sentence is default. Never raw segments (engine units, not reading units). Sizable control in the Cast palette. |
| 2 | **Primary persona** | **Narrator-first.** Cast panel hidden by default — full width for reading/editing. Panel appears pinned only when the book has characters assigned. Single-narrator users never see the cast panel unless they need it. |
| 3 | **Revise mode entry** | **In-place paragraph edit** (click a paragraph → inline edit of that segment only). Not a guarded unlock, not a full-page editor. Structural/full-source editing lives in **Write mode (§7b)** — a first-class mode, always accessible, not an escape hatch. |
| 4 | **Flag follow-through** | **Session-only margin pins ship in v1** (lightweight, no persistence). Written notes and persistent flags are post-v2 (see §16). |

**Additional decisions:**

| Decision | Resolution |
|---|---|
| Mutation batching (B2) | Event → collector queue → flush on gesture-end / mode-exit (see §5) |
| Render trigger | **Render on mode-exit from Cast** — not on timer, not on each stroke. Explicit tap in Booth bumps to top of queue. |
| Balanced segment split | Split at nearest sentence boundary to midpoint; 80-char minimum floor; don't split if no clean boundary (see §7) |
| Quasimode (Space-to-listen) | Replaced by ambient auto-render + play-what's-ready in Booth. No quasimode in v1. |
| Terminology / metaphor | Recording studio + authorship. Cast / Booth / Revise / Director's Console / On Air (see §4 table). |
| Left rail extensibility | Slotted list, not hardcoded to 3 items. Future tools register slots. Internal-only in v1. |
| Demo mockability | Each tool slot has a demo placeholder; future tools show as "coming soon" in the demo. |
| **Write mode (Mode 4)** | First-class Director's Console mode (shortcut `W`, document icon). Full chapter source editor — always accessible, not a tucked-away escape hatch. Intentionally destructive to assignments on structural changes; Resync recovers what it can and diffs what it clears. Blank chapters open in Write mode by default. |
| **Variation picker UI** | Shown as a **3-button inline toggle** (Natural / Whisper / Urgent) in the Cast palette next to the "current voice" chip. Always visible when a speaker is loaded. Never in a drawer or expandable section. Unavailable variations (no recording in the voice library) are visually disabled — not a silent fallback. |
| **Variation visibility across modes** | Variation assignments painted in Cast mode carry through into Booth mode via speaker tints + the annotation gutter. Mode-switching must never hide what was painted. |
| **Annotation gutter** | A narrow left-edge gutter (~12–16 px) alongside the prose column carries passive visual signals. Extends the already-planned Booth-mode margin pins (§6). No interaction required — purely a reading-axis signal layer, not a clickable panel. **Glyph reference:** ⊘ = Stage Direction (human-only, not rendered); ⚡ = Performance Cue (engine directive active); 🏴 (or a pin icon) = session flag from Booth mode; a small colored tick = variation deviates from the speaker's default register. Multiple glyphs on one line stack vertically in the gutter. |
| **Segment annotation bag** | The segment record carries an extensible `annotation` properties bag in addition to `speaker_id` and `variation`: `{ engine_directives?: { rate?, pitch?, volume?, style_prompt? }, approval_state?, ... }`. The human description in a Performance Cue is display-only and does not live in the annotation bag. `engine_directives` is populated by the Cue Editor and consumed at render time if the active engine supports it. Annotations are **per-line**, not per-character defaults. |
| **Inspector drawer (post-v2)** | Non-modal per-line panel for approval state and structured emotion direction (model-dependent style prompts). **Scope narrowed**: the inline note / performance-direction use case is now served by painting Stage Direction text directly in the prose flow — the Inspector's "director's note free-text field" is no longer needed. What the Inspector retains: speaker (read), variation (read + change), approval state toggle (draft / locked), and eventually a structured emotion direction field for models that support style prompts. The Cast panel paints; the Inspector reads and annotates structural metadata. |
| **Stage Direction (human-only skip marker)** | Built-in system assignment in Cast palette. Shortcut `S`. Marks a span as excluded from the TTS queue — text stays visible, never rendered as audio. Data model: `speaker_id = "_stage_direction"` + `render: false`. Visual: Geist Mono, muted gray, **⊘ glyph** in annotation gutter. Role: structural non-speech content AND inline human performance/context notes — directors write intent in the text flow; the narrator reads it in place; TTS skips it. Auto-paintable by the import annotation extractor on Fountain import (§16). **Ships v1.** |
| **Performance Cue (engine directive)** | Built-in system assignment in Cast palette — companion to Stage Direction. **Shortcut `P`** in Cast mode. Applies to the first renderable segment that follows it in document order (Stage Direction and other Performance Cue spans between them are skipped). Multiple cues before one segment merge: last value per SSML parameter wins; descriptions concatenate with ` · `. A cue with no following renderable segment displays but its payload is never consumed. Created via the **Cue Editor** inline popover: (1) SSML pickers — Rate (slow/normal/fast/**Other…**), Pitch (low/normal/high/**Other…**), Volume (soft/normal/loud/**Other…**), optional style prompt field — each "Other" reveals a free-text input that passes its value to the engine as-is; (2) optional description for human readers. Display: `[slowly · low | voice catches]` when both fields set; `[slowly · low]` SSML only; `[voice catches]` description only. **⚡ glyph** in annotation gutter. Engine payload ignored silently on XTTS; consumed automatically on capable engines. **Data model and display ship v1; engine consumption is engine-dependent.** |

---

## 16. Future features catalogue (not v1)

These are not scheduled. They are recorded here so the architecture and demo can accommodate them without requiring structural rework. Each has a **demo placeholder slot** in the Director's Console so the demo can show the full future vision.

### Script Supervisor (AI manuscript analysis)

A second AI role distinct from the Casting Call. Where the Casting Call reads for *who speaks*, the Script Supervisor reads for *what's happening*. All features below live under this tool slot:

| Feature | What it produces |
|---|---|
| Character discovery | Named character list with inferred personas, relationship notes |
| Book / chapter summary | Short prose summary per chapter; arc overview |
| Timeline | Chronological event list, timestamped by chapter/scene |
| Location tracker | Named locations with first appearance and chapter context |
| Scene breakdown | Scene-by-scene list with characters present, tone, setting |
| Map (future) | Visual location graph for geography-heavy fiction |

The Script Supervisor and Casting Call share the same AI infrastructure (both read the manuscript); they are separated so they can ship independently and so the user understands the distinct intent of each action.

### Casting Call (AI speaker detection)

Already specified in §8. Ships as a one-shot action in the Cast palette, not a mode. Recorded here as a future item for the Director's Console demo slot.

### Session-persistent flags with notes

In Booth mode: flags that survive session close and accept written notes. Post-v2. The v1 session-only pin is the foundation; persistence and notes layer on top.

### Plugin tool slots

Third-party or user-written tools that register a Director's Console icon, a panel, and a keyboard shortcut. Internal-only in v1. The slot registration API will be defined when the external plugin system is designed. For now, the architecture must reserve the extensibility point (see §17).

### Narrow viewport / mobile

The three-edge-chrome layout (left rail + right Cast + bottom transport) does not fit narrow viewports. The mode model is an advantage here — one focused surface per mode means less simultaneous chrome — but a responsive collapse strategy is not yet designed. Deferred.

### Advanced emotion direction (AI-directed performance)

Post-v2. Most models (including XTTS) do not accept style prompts for emotion direction today; the v1 variation system (Natural/Whisper/Urgent as separately recorded samples) is the correct first-class feature.

When this ships, the **Inspector drawer** (per-line, non-modal — see §13) is the approved UX pattern. The segment annotation bag (§13) is the data layer.

Specific future items in this space:

| Item | Description |
|---|---|
| **Import annotation extractor** | A Write→Cast transition gate that parses tone cues from Fountain/screenplay source text (`[bitterly]`, `(quietly)`, action lines) — strips them from the spoken text field, writes them into the segment's structured annotation field. Confirm/adjust UI before proceeding. Round-trip contract: export to Fountain rehydrates annotations at original positions. |
| **Emotion direction field** | A per-segment style prompt fed to models that support it (`"fearful"`, `"tender"`, `"urgent"`). Scoped to segments where no recorded variation covers the needed register. |
| **Segment-level quick re-render (Booth)** | A "Re-render this segment" action triggerable in Booth mode without mode exit, using the current variation + annotation. Supports the hear → adjust → re-render iteration loop for high-volume producers. |

### Book-level casting map

A project-level view — not a chapter editor mode. A grid with characters on one axis and chapters on the other, showing speaker assignments, approval state, and variation clusters across the whole book. Needed by casting directors managing 60+ titles. Belongs in the Contents hub / project overview as a dedicated view, not in the chapter editor's Director's Console.

---

## 17. Modular architecture (implementation contract)

Each Director's Console tool is a **self-contained module** with its own folder. This is an internal architecture requirement — not about external APIs. The structure prevents the chapter editor from becoming a monolithic file again and makes adding future tools (§16) a matter of adding a folder, not refactoring existing code.

```
pages/ChapterEditor/
  components/
    DirectorsConsole/         # Left-rail router: renders active tool, owns mode state
      index.tsx
      CastTool/               # Cast mode
        index.tsx             # Exports the tool registration object
        CastPalette.tsx       # Character swatches + brush size selector
        VoiceBrush.tsx        # Hover preview + click/drag assignment
        MutationCollector.ts  # Collector queue → batched write on gesture-end
        CastTool.test.tsx
      BoothTool/              # Booth/listen mode
        index.tsx
        TransportControls.tsx
        KaraokeHighlight.tsx
        LineFlags.tsx         # Session-only margin pins
        BoothTool.test.tsx
      ReviseTool/             # Revise/edit mode (in-place paragraph edit only)
        index.tsx
        InlineEditor.tsx      # Per-paragraph in-place editor
        SegmentSplitter.ts    # Balanced split logic (midpoint / sentence boundary / min floor)
        ReviseTool.test.tsx
      WriteTool/              # Write mode (full source editor)
        index.tsx
        SourceEditor.tsx      # Full-chapter editable text surface
        ResyncDiff.tsx        # Shows recovered vs. cleared assignments on mode exit
        WriteTool.test.tsx
      # Future slots (demo placeholders exist from day one):
      # CastingCallTool/      # AI speaker detection (§8)
      # ScriptSupervisorTool/ # AI manuscript analysis (§16)
      # PluginTools/          # Registered plugin slots (§16)
    AmbientStatus/            # On Air indicator + render progress pill
    ChapterSurface/           # The prose document (shared by all modes)
```

**Each tool module exports a registration object:**
```ts
// example shape — exact API TBD at implementation time
export const CastTool: DirectorsTool = {
  id: 'cast',
  label: 'Cast',
  icon: MicrophoneIcon,
  shortcut: 'V',              // kept from original spec for keyboard users
  panel: CastPalette,
  onModeEnter: () => void,
  onModeExit: flushRenderQueue,  // render-on-mode-exit hook
  demoPlaceholder: false,      // real tool, not a placeholder
}
```

The `DirectorsConsole` renders whatever tools are in the registry in order. Future tools add an entry; nothing else changes. Demo placeholders set `demoPlaceholder: true` and render a "coming soon" state in the demo without any real functionality wired.

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
