# Task 001 — Build the `BookPane` component

Status: complete — 2026-07-10

## Goal

Add a new `BookPane` component to `frontend/src/demo/stages/siteMockup/panes/book.tsx`, alongside the existing `ContentsPane`/`ManuscriptPane`/`CastingPane`/`BackupsPane`, mirroring the real app's shipped Book-tab hero pattern using the demo's own primitives.

## Exact file

- `frontend/src/demo/stages/siteMockup/panes/book.tsx` — add the new export near the top, before or after `ContentsPane` (line 194 is where `ContentsPane` starts — add `BookPane` just above it, at line ~193, so the file reads top-to-bottom in tab order).

## Available primitives (from `../shared`, already imported at the top of this file — extend the existing import statement, don't add a new one)

```tsx
import {
  Row, Col, Label, Btn, ProgressBar, PlayButton,
  Card, Panel,
  SemanticChip, VoiceAttrPill,
  StatusOrb,
  Avatar,
  Mic, Volume2, CheckCircle,
  CHAPTERS,
  CHAPTER_RENDER_PCT,
} from '../shared';
```

- **`Card`** (`shared.tsx:130-150`): `<div className="ns-card ..."> ` with `background: var(--surface)`, `border: 1px solid var(--border)`, `border-radius: var(--radius-card)`, `box-shadow: var(--shadow-sm)`. Accepts `style`/`className` overrides.
- **`Row`/`Col`** (`shared.tsx:28-52`ish): flex row/column primitives accepting a `gap` prop (see `ContentsPane`'s usage, e.g. `<Row gap={12} style={{ alignItems: 'center' }}>`).
- **`Btn`** (`shared.tsx:389-428`): `<Btn primary small onClick={...}>Label</Btn>` — `primary` gives it `background: var(--accent)`, `color: var(--text-on-accent)`; without `primary` it's a neutral `var(--surface-alt)` button. Use `primary` for nothing here (Continue Listening uses `PlayButton`, not `Btn`) — use a plain `Btn` for the secondary "Download" action.
- **`PlayButton`** (`shared.tsx:437-460+`): `<PlayButton label="Play book The Whispering Vale" tone="overlay" size={20} />` — the demo's established, single playback-start affordance. Its doc comment explicitly anticipates a "Play book <title>"-shaped label — use that exact phrasing convention. `tone="overlay"` gives it the strongest visual weight (`background: var(--accent)`, `color: var(--text-on-accent)`, `box-shadow: var(--shadow-md)`) — appropriate for a primary CTA.
- **`BookOpen`** icon (already imported from `lucide-react` at the top of this file, line 16) — reuse for the cover placeholder, same as `ContentsPane`'s existing cover block (`book.tsx:213-221`).

## Target shape

```tsx
// Insert above `export const ContentsPane` (currently line 194)

// BookPane — front-door hero: cover + identity, description, Continue Listening CTA, demoted metadata footer
export const BookPane: React.FC = () => {
  return (
    <Col gap={16} className="ns-enter" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Card style={{ padding: 'var(--space-4)' }}>
        <Row gap={20} style={{ alignItems: 'flex-start' }}>
          {/* Hero cover — larger than ContentsPane's 40x54 thumbnail */}
          <div style={{
            width: 152, height: 205, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent-tint-bg) 0%, var(--border) 100%)',
            border: '1px solid var(--accent-tint-border)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={48} color="var(--accent)" aria-hidden="true" />
          </div>

          {/* Identity + description + CTA + footer */}
          <Col gap={10} style={{ flex: 1, minWidth: 0 }}>
            <div>
              <div style={{
                fontSize: 'var(--type-large-title)', fontWeight: 800,
                color: 'var(--text-primary)', lineHeight: 1.05,
              }}>
                The Whispering Vale
              </div>
              <Row gap={8} style={{ alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  R.E. Hartley
                </span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontWeight: 650 }}>
                  The Vale Cycle #1
                </span>
              </Row>
            </div>

            <p style={{
              margin: 0, maxWidth: '42rem', color: 'var(--text-secondary)',
              fontSize: 'var(--type-caption)', lineHeight: 1.6,
            }}>
              A hollow road winds through the Vale, and something ancient walks it after dark.
              When Mira Ashford inherits her grandmother's cottage at the forest's edge, she finds
              a diary that says the walking things remember her name.
            </p>

            <Row gap={10} style={{ alignItems: 'center', marginTop: 4 }}>
              <PlayButton label="Play book The Whispering Vale" tone="overlay" size={18} />
              <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Continue Listening
              </span>
              <Btn style={{ marginLeft: 8 }}>Download</Btn>
            </Row>

            <Row gap={0} style={{ alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Runtime 6h 28m</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 6px', fontSize: 'var(--type-micro)' }}>·</span>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Rendered</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 6px', fontSize: 'var(--type-micro)' }}>·</span>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Created 2 days ago</span>
            </Row>
          </Col>
        </Row>
      </Card>
    </Col>
  );
};
```

(This is the contract, not gospel — adjust spacing/sizing to look right once rendered live in Task 003's verification; the shape — cover|identity, description below title, CTA promoted with `PlayButton`, muted `·`-separated footer last — is what must hold.)

## Steps

- [x] Add `BookPane` per the target shape above, inserted directly before `export const ContentsPane` (currently `book.tsx:194`).
- [x] Do not modify `ContentsPane`, `ManuscriptPane`, `CastingPane`, or `BackupsPane` in this task.
- [x] Confirm the file's existing import line (`import { Row, Col, Label, Btn, ProgressBar, PlayButton, Card, Panel, ... } from '../shared';`) already covers every primitive used (`Row`, `Col`, `Card`, `Btn`, `PlayButton`) — it does, per the map; no import changes needed.

## Acceptance criteria

- [x] `BookPane` is exported from `book.tsx`.
- [x] `npx tsc -b --force` (from `frontend/`) is clean.
- [x] No import from `frontend/src/pages/Book/` or any real-app path (grep the diff for `@/pages/Book` — should be zero hits).
- [ ] Visual shape (verified live in Task 003): cover on the left, identity/description/CTA/footer stacked on the right, description sits between identity and the CTA, footer line is muted/`·`-separated, not colorful chips.
      (Not verified here — no browser/preview tool used in this task; left for Task 003's live verification, as this task's own scope note specifies.)

## Dependencies

None — first task.

## Map links

- Part: `BookPane` (new) — `01-map.md`, "The parts"
- Pattern: "Ground-truth pattern being ported" — `01-map.md`
- Invariants: INV-1 (existing primitives only), INV-2 (no real-app imports), INV-3 (`PlayButton`/aria-label convention)
- Risk: `none` (new, additive component; nothing else references it yet)

## Out of scope

- Wiring this into the tab strip (Task 002).
- Rebuilding `docs/demo/` (Task 003).
