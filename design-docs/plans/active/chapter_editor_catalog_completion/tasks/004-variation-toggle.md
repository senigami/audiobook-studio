# Task 004 — Variation 3-way toggle (Natural / Whisper / Urgent)

Status: pending

Risk: multi-file (data model exists via `variant_name` but needs an explicit naming-convention decision; Booth propagation is a later task to coordinate with, not build here)

## Goal

Replace the Cast palette's current arbitrary-length, expandable variant-list UI with a **fixed 3-button inline toggle** (Natural / Whisper / Urgent), always visible next to the "current voice" info whenever a character is selected. Each button maps onto whichever of the selected speaker's recorded `SpeakerProfile.variant_name` values matches that canonical name (case-insensitively); a button with no matching recording is visually disabled, not hidden.

## Why this matters

Per `design-docs/workflows/chapter-editor-modes.md` §5 and §13's "Variation picker UI" row: *"Shown as a **3-button inline toggle** (Natural / Whisper / Urgent) in the Cast palette next to the 'current voice' chip. Always visible when a speaker is loaded. Never in a drawer or expandable section. Unavailable variations... are visually disabled — not a silent fallback."* `CastTool/index.tsx`'s doc comment (lines 29–31) lists "variation toggle" among items deliberately deferred. The current UI in `CastPalette.tsx` is real and functional but the wrong *shape*: an expandable dropdown-like list rather than a fixed, always-visible toggle — this task is a UI reshape over already-correct underlying data, not new plumbing.

## Exact files

- **MODIFY** `frontend/src/pages/Book/studio/CastPalette.tsx` — replace/augment the variant-list block (`CharacterRow`, lines 300–354) with the fixed 3-button toggle. `onVariantSelect`/`onVariantDisarm` handlers (lines 451–458 in `makeRowHandlers`) are reused as-is — only the rendering changes.
- **NEW (small, optional)** a `normalizeVariantBucket` helper — either inline in `CastPalette.tsx` or added to `frontend/src/utils/voiceProfiles.ts` alongside the existing `getVariantDisplayName`/`isDefaultVoiceProfile` (lines 34–48) since it's the same family of "interpret a profile's `variant_name`" logic.
- **NO backend/type changes** — `SpeakerProfile.variant_name: string | null` (`frontend/src/types/index.ts:247`) already exists and is free-form; this task only interprets it more strictly on the frontend, it does not change what's stored.

## Current shape (verified)

- **Data layer is fully built already, nothing to add:**
  - `SpeakerProfile` (`frontend/src/types/index.ts:239–260`), `variant_name: string | null` at line 247 — a free-form string, not constrained to any fixed set of values.
  - `frontend/src/utils/voiceProfiles.ts:34–42` `getVariantDisplayName(profile)` — returns `profile.variant_name` verbatim if set, else derives a display name from `profile.name`'s `" - "`-suffix convention, else `'Default'`.
  - `frontend/src/utils/voiceProfiles.ts:44–48` `isDefaultVoiceProfile(profile)` — treats `profile.is_default || profile.variant_name === 'Default' || !profileName.includes(' - ')` as "this is the base/default variant."
  - `frontend/src/pages/Voices/components/VariantEditor.tsx` is the existing management UI where a user records/names these variants per speaker (arbitrary names, sample management, speed, engine) — this task does not touch that UI; it only changes how Cast palette *selects* an already-recorded variant.
- **Current Cast palette UI (exists, wrong shape):** `CastPalette.tsx:126–357` (`CharacterRow`):
  - Line 155: `const variants = speakerMatch ? speakerProfiles.filter((p) => p.speaker_id === speakerMatch.id) : [];` — all recorded profiles for the matched speaker, unfiltered, arbitrary length.
  - Lines 265–275: a chevron indicator shown only when `variants.length > 1`, toggled by `isSpeakerSelected` (i.e. the variant list only shows once the character row itself is clicked/selected) — this is the "expandable section" the design doc explicitly says NOT to use (*"never in a drawer or expandable section"*).
  - Lines 300–354 (`{variants.length > 1 && isSpeakerSelected && (...)}`): renders a `<div className="cast-palette__variant-list">` with one `<button className="cast-palette__variant-btn">` per recorded variant, in whatever order `speakerProfiles` naturally has them, calling `onVariantSelect(variant.name)` / `onVariantDisarm()` on click (lines 321–327). This handler logic is correct and reusable — only the list-vs-fixed-3-buttons rendering needs to change.
  - `makeRowHandlers` (lines 426–460), specifically `onVariantSelect: (variantName) => { setSelectedCharacterId(char.id); setSelectedProfileName(variantName); }` (lines 451–454) — **this is local brush-selection state only, it does not call any API or write any assignment.** (A prior research pass on this task assumed variant selection "uses the existing assignment-write path" through task 001's collector — that is incorrect for the *selection* step itself; verified by reading the actual handler. Selecting a variation changes which voice is loaded into the brush, exactly like selecting a character row does; the assignment write only happens later, when the user paints a span/paragraph/word with `handleScriptAssign`/`handleScriptAssignRange`, which already receives `selectedProfileName` as an argument at the `CastTool/index.tsx:344–361` call sites. No new write-path wiring is needed in this task.)
- **The pre-existing, explicitly out-of-scope HTML-nesting bug** (`00-overview.md`'s "Non-goals worth naming explicitly"): `CharacterRow`'s color-swatch `<button>` (via `ColorSwatchPicker`, lines 213–217) sits as a **sibling** of the label `<div role="button">` (lines 218–277), not nested inside it — the comment at lines 200–203 explains this was already fixed to avoid nested-button HTML. Do not touch this; it's already correct, just don't regress it while restructuring the surrounding JSX.

## Target shape

1. **Naming-convention decision (make this explicit — nothing in the data model enforces these 3 names existing):**
   ```ts
   type VariantBucket = 'natural' | 'whisper' | 'urgent';

   function normalizeVariantBucket(profile: Pick<SpeakerProfile, 'variant_name'>): VariantBucket | null {
     const raw = (profile.variant_name ?? '').trim().toLowerCase();
     if (raw === '' || raw === 'default' || raw === 'natural') return 'natural';
     if (raw === 'whisper') return 'whisper';
     if (raw === 'urgent') return 'urgent';
     return null; // an arbitrarily-named variant that doesn't map to any of the 3 fixed slots
   }
   ```
   Rationale for folding `null`/`'default'` into `'natural'`: today's un-varianted/base voice (`variant_name: null`, what `isDefaultVoiceProfile` already treats as the default register) IS the natural/baseline register — there is no 4th "Default" slot in the design doc's fixed 3-button spec, so it must map onto one of the 3, and "natural" is the only sensible target.
   **Explicit open question / accepted gap, do not silently over-engineer around it:** a speaker with a recorded variant named something outside these 3 canonical names (e.g. `"Sarcastic"`) becomes unreachable from this fixed toggle — `normalizeVariantBucket` returns `null` for it and no button represents it. This is a real product tradeoff of moving to a fixed 3-slot control; flag it in your PR description, don't quietly build a 4th "other" slot or keep the old expandable list around as a fallback (that would reintroduce the "expandable section" the design doc rejects).

2. **Rendering** (replacing `CastPalette.tsx:300–354`):
   ```tsx
   {isSpeakerSelected && (
     <div className="cast-palette__variation-toggle">
       {(['natural', 'whisper', 'urgent'] as const).map((bucket) => {
         const label = bucket === 'natural' ? 'Natural' : bucket === 'whisper' ? 'Whisper' : 'Urgent';
         const matchingProfile = variants.find((v) => normalizeVariantBucket(v) === bucket);
         const isSelected = !!matchingProfile && selectedCharacterId === char.id && selectedProfileName === matchingProfile.name;
         const selectable = matchingProfile ? isProfileSelectable(matchingProfile) : false;
         return (
           <button
             key={bucket}
             type="button"
             disabled={!matchingProfile}
             title={!matchingProfile ? `No ${label} recording for this voice` : undefined}
             onClick={() => {
               if (!matchingProfile) return;
               if (allowDisarm && isSelected) { onVariantDisarm(); return; }
               onVariantSelect(matchingProfile.name);
             }}
             className="cast-palette__variation-btn"
             style={{
               border: `1px solid ${isSelected ? char.color : 'transparent'}`,
               background: isSelected ? `${char.color}10` : 'transparent',
               opacity: !matchingProfile ? 0.35 : (!selectable ? 0.6 : 1),
             }}
           >
             {label}
           </button>
         );
       })}
     </div>
   )}
   ```
   This renders **unconditionally whenever the character row is selected** (not gated behind `variants.length > 1` like today's chevron) — per the design doc, always visible when a speaker is loaded, regardless of how many variants that speaker actually has recorded.
3. Remove the now-unused chevron/expand-indicator block (lines 265–275) since there is no longer an expand/collapse interaction — the toggle is always shown, not click-to-reveal.

## Steps (ordered, concrete)

1. Add `normalizeVariantBucket` (in `CastPalette.tsx` or `voiceProfiles.ts` — prefer `voiceProfiles.ts` since it's the existing home for this exact family of "interpret a profile" helpers).
2. Replace the rendering block at `CastPalette.tsx:300–354` with the fixed 3-button toggle per the target shape.
3. Remove the now-dead chevron indicator (lines 265–275) and its `variants.length > 1` gating — the toggle no longer depends on variant count to decide visibility (it depends only on `isSpeakerSelected`).
4. Add a new CSS class `cast-palette__variation-toggle`/`cast-palette__variation-btn` alongside the existing `cast-palette__variant-*` classes (check whichever stylesheet currently defines those — likely a co-located CSS file for this component; find it via the existing `cast-palette__variant-btn` class usage).
5. Write/extend tests (find or create `CastPalette.test.tsx` under `frontend/tests/unit/...` mirroring this component's path — check for an existing one first):
   - A speaker with `variant_name` values `[null, 'Whisper']` shows Natural enabled+mapped-to-the-null-profile, Whisper enabled+mapped, Urgent disabled.
   - Clicking an enabled bucket calls `setSelectedProfileName` with that bucket's exact profile name (not the bucket label).
   - Clicking a disabled bucket does nothing (no setter calls).
   - A speaker with an out-of-convention variant name (e.g. `'Sarcastic'`) does not crash and simply doesn't light up any of the 3 buttons for that profile.
   - Toggle is visible immediately on character selection, without requiring any additional click to "expand" it.
6. `npm -C frontend run test -- --run CastPalette`, `npm -C frontend run lint`.
7. Append a `.agent/code-map/queue/` changelog entry.

## Acceptance criteria

- [ ] Cast palette shows a fixed 3-button Natural/Whisper/Urgent toggle whenever a character is selected — never an expandable/collapsible list.
- [ ] Each button is enabled only if that speaker has a recorded profile whose `variant_name` normalizes to that bucket (case-insensitive); otherwise visually disabled with a title explaining why.
- [ ] Clicking an enabled button sets `selectedProfileName` to that bucket's actual profile name via the existing `onVariantSelect` handler — no new write/API path introduced.
- [ ] The naming-convention mapping (`normalizeVariantBucket`) is implemented exactly as specified, including the `null`/`'default'`/`'natural'` → `'natural'` fold.
- [ ] Out-of-convention variant names don't crash and are explicitly a known, documented gap (not silently patched with a 4th slot).
- [ ] `npm -C frontend run test -- --run` and `npm -C frontend run lint` clean.
- [ ] `.agent/code-map/queue/` entry added.

## Map links

Part D in `01-map.md`. Invariant INV-1 (reuses `SpeakerProfile.variant_name` — no new field/table). Booth propagation (variation carrying into Booth via speaker tints + annotation gutter, §13) is explicitly **not** built here — coordinate with tasks 007/009 (Workload 3/4, the shared gutter component and Booth's glyph wiring) when those land; this task only needs to leave `selectedProfileName`/segment `speaker_profile_name` data correctly set so that later work has something real to render.

## Dependencies

Roadmap lists this as depending on task 001 (mutation-batching) — verified against the actual code, variant *selection* itself does not call the collector or any API (see Current shape), so there is no hard code-level dependency on 001's internals. The dependency is soft/sequencing-only (per `01-map.md`'s Connections: build 001 first so there's one generation of "how does an assignment get saved" in flight) — if 001 hasn't landed, this task's changes are unaffected either way since it never calls `api.saveScriptAssignments` directly.

## Out of scope

- Do not build Booth-mode variation display (speaker tints, annotation gutter ticks) — that is tasks 007/009 in Workload 3/4.
- Do not add a 4th "other/custom" slot for out-of-convention variant names — documented gap, not solved here.
- Do not change `VariantEditor.tsx` (the recording/management UI) — this task only changes how Cast palette *selects* among already-recorded variants.
- Do not fix the pre-existing `CharacterRow` button-nesting issue referenced in `00-overview.md`'s non-goals — it's already correct (sibling buttons, not nested); just don't regress it.
