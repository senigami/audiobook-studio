# Implementation Map

## Big picture

```
shared.tsx: BookTab type + BOOK_TABS array
        │  add 'Book' as first entry
        ▼
siteMockupStage.tsx: activeBookTab state (default 'Contents' → 'Book')
        │  tab strip already maps over BOOK_TABS generically (no per-tab code needed there)
        │  pane-switch needs one new case
        ▼
panes/book.tsx: NEW BookPane component
        (mirrors real app's BookInfoCard.tsx + ContinueListeningCard.tsx pattern,
         built from the demo's OWN primitives: Row, Col, Card, Btn, PlayButton)
```

## The parts

| Part | Responsibility | File |
|------|----------------|------|
| `BookTab` type / `BOOK_TABS` array | Defines which tabs exist and their order | `frontend/src/demo/stages/siteMockup/shared.tsx:1010-1011` |
| Tab strip | Renders `BOOK_TABS.map(...)` generically — already renders any tab in the array with no per-tab code (`siteMockupStage.tsx:1043-1063`) | `siteMockupStage.tsx` |
| `activeBookTab` state | `useState<BookTab>('Contents')` at `siteMockupStage.tsx:1087` — controls both default-landing tab and pane switch | `siteMockupStage.tsx` |
| Pane switch | `{activeTab === 'Contents' && <ContentsPane .../>}` etc. at `siteMockupStage.tsx:1068-1071` — one new line needed | `siteMockupStage.tsx` |
| `BookPane` *(new)* | The hero: cover, identity, description, Continue Listening CTA, metadata footer | `panes/book.tsx` |
| `ContentsPane` *(unchanged)* | Chapter board + its own slim inline header — stays as-is, out of scope | `panes/book.tsx:194-390` |

## Ground-truth pattern being ported (from the real app, already shipped)

Source: `frontend/src/pages/Book/components/BookInfoCard.tsx` + `ContinueListeningCard.tsx` (real app, className/CSS-based). Port the **pattern**, not the literal JSX/CSS — the demo uses inline-style React primitives (`Row`, `Col`, `Card`), not classNames:

1. **Hero cover** — real app uses a 10–12rem blurred-bleed cover (`.book-info-card__cover-blur` + foreground shell). Demo equivalent: a larger `Card`-backed cover block (suggest ~9–10rem wide, matching the demo's existing scale — the current `ContentsPane` thumbnail is 40×54px, comically small by comparison) using the same `BookOpen` icon placeholder treatment already in `ContentsPane` (`book.tsx:213-221`) scaled up, since the demo has no real cover images to load.
2. **Identity block** — title (large, bold, `var(--type-title)`-scale if that token exists in the demo's type scale — check `shared.tsx`'s type tokens), author · series line (muted, `·`-separated — exact convention already used at `book.tsx:234` and `:158-160`).
3. **Description** — a short illustrative synopsis string (2-3 sentences), styled as body text (`var(--text-secondary)`, comfortable line-height) — NOT a form, NOT editable (this is a static mockup).
4. **Continue Listening CTA** — use the demo's existing `PlayButton` component (`shared.tsx:437-460`) with `label="Play book The Whispering Vale"` (matching the doc comment's own example verbatim — `tone="overlay"` for primary visual weight) alongside a secondary `Btn` for "Download" (ghost/non-primary style, matching the real app's Download secondary action).
5. **Metadata footer line** — `·`-separated muted text, e.g. `Runtime 6h 28m · Rendered · Created 2 days ago` — reusing the exact `<span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>·</span>` idiom already present in this same file at lines 158-160.

## Invariants

- **[INV-1]** No new component primitives — build `BookPane` from `Row`/`Col`/`Card`/`Btn`/`PlayButton`/`Label` (whichever exist in `shared.tsx`), matching every other pane in this file. Don't invent a parallel styling system.
- **[INV-2]** No import from `frontend/src/pages/Book/` or any real-app component — the demo is fully self-contained (confirmed existing convention: `book.tsx`'s only imports are from `../shared`, `../bookmarkStore`, and `lucide-react`).
- **[INV-3]** `PlayButton`'s own doc comment (`shared.tsx:432-436`) states playback is started by "content-owned play controls that the global click delegator catches by `aria-label`... into the player bus" — use `aria-label`/`label` exactly as that convention expects; don't wire a separate ad-hoc click handler that bypasses the delegator.
- **[INV-4]** Preserve `ContentsPane`'s existing slim header — do not delete or modify it. It's out of scope; the new Book tab supplements it, doesn't replace Contents' own lightweight identity reminder.

## Risks / open questions — resolved

- **Old `ContentsPane` header's "Edit book details" pencil button — is it a good idea missing from the real app?** No: the real app's shipped `BookInfoCard` already supports inline editing of every identity field (click-to-edit via `InlineEdit`, no separate "Edit mode" button needed) — a more modern, HIG-aligned pattern (direct manipulation over a modal-style edit toggle) than the demo's older pencil-button affordance. Decision: follow the real app's shipped pattern (no edit button) for `BookPane`; the pencil-button idea is superseded, not worth resurrecting. (`ContentsPane`'s own header keeps its pencil button as-is since that pane is untouched — this decision only governs the new `BookPane`.)
- **Does the demo have a `--type-title` or equivalent large-title token?** Task 001 checks `shared.tsx`'s type-token definitions before hardcoding a font-size — use whatever the demo's own type scale calls its largest text role.
