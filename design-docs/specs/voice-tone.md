# Voice & Tone — UI Copy Conventions

```
spec_version: 1.0.0
status: active
created: 2026-06-19
updated: 2026-06-19
sources:
  - frontend/src/components/overlays/ConfirmModal.tsx
  - frontend/src/pages/ProjectLibrary/ProjectLibraryPage.tsx
  - frontend/src/pages/ProjectDetail/ProjectDetailPage.tsx
  - frontend/src/pages/Voices/components/VoiceCatalogCard.tsx
  - frontend/src/pages/Voices/components/NarratorCard.tsx
  - frontend/src/pages/Voices/components/VariantEditor.tsx
  - frontend/src/pages/VoiceLab/VoiceLabPage.tsx
  - frontend/src/pages/Engines/components/EnginesPanel.tsx
  - frontend/src/pages/Engines/components/EngineCard.tsx
  - frontend/src/pages/Book/studio/useStudioChapter.ts
  - frontend/src/pages/ChapterEditor/components/DirectorsConsole/CastTool/index.tsx (formerly frontend/src/pages/Book/stages/StudioStage.tsx, deleted 2026-07-10 — copy patterns carried forward unchanged in the port)
  - frontend/src/components/ProjectBackupsPanel.tsx
  - frontend/src/components/CharactersTab.tsx
  - frontend/src/pages/ProjectDetail/components/ProjectModals.tsx
  - frontend/src/pages/Book/components/AddChapterModal.tsx
  - frontend/index.html
  - .agent/rules/frontend-ux.md
  - design-docs/specs/design-system.md
```

> **TL;DR:** Title Case for buttons and modal titles; sentence case everywhere else; destructive confirms use verb-first labels and spell out consequences; loading copy uses gerund + `…`; no toast system means success is inline.

## Changelog

| Version | Date | Change |
|---------|------|--------|
| 1.0.0 | 2026-06-19 | Initial canonical spec — ratifies emergent casing, confirm dialog, irreversibility, UI-state, loading/empty/success, form-label, punctuation, and naming conventions observed across `frontend/src/pages` and `frontend/src/components` |

---

## 1. Purpose & Scope

This spec codifies the UI copy conventions for Audiobook Studio. It governs casing, confirm dialogs, destructive-action messaging, the five required UI states, loading/empty/success patterns, form-field label conventions, punctuation style, and product naming.

It applies to all copy in `frontend/src/pages/` and `frontend/src/components/` (excluding `frontend/src/demo/`, which follows its own mock conventions). It does **not** own layout, colour, or iconography — see `design-system.md`.

Specs and code are jointly authoritative. If this spec and the running UI disagree, resolve the drift explicitly by fixing one or the other; silently accepting divergence is not acceptable.

---

## 2. Casing

### 2.1 Title Case — buttons, CTAs, modal titles (binding)

The following surfaces use **Title Case** (each significant word capitalised):

- **Primary / danger / ghost buttons** that initiate an action: "New Project", "Add Chapter", "Create New Voice", "Rebuild Audio", "Queue Chapter", "Generate Sample", "Rebuild Voice Model", "Save Script", "Confirm Assembly", "Export Audio", "Uninstall Plugin", "Delete Backup", "Save Changes".
- **Modal / dialog titles** (the `title` prop of `ConfirmModal` and equivalent `<h3>` headings in custom modals): "Delete Chapter", "Rebuild Audio", "Requeue Completed Chapter", "Large Chapter Warning", "Delete voice?", "Install TTS Plugin", "Edit Project Details", "Add New Chapter", "Create New Voice".
- **Confirm / cancel button labels** inside dialogs: "Continue to Edit", "Yes, Rebuild It", "Yes, Queue It", "Reload Now", "Delete Backup", "Uninstall Plugin", "Understood", "Cancel".

### 2.2 Sentence case — body, empty-state, loading, error, helper copy (binding)

All other copy uses **sentence case** (first word capitalised only, plus proper nouns):

- Empty-state bodies: "Create a project to start turning text into audio.", "No chapters yet. Add one to get started."
- Loading/in-progress inline labels: "Loading…", "Saving…", "Uploading…", "Checking server status…", "loading voice model…"
- Error and helper text: "Settings update failed. Please try again.", "All assigned sentences will revert to the default speaker."
- Modal message bodies (the `message` prop): "All audio for this chapter is already complete. Rebuilding will delete the existing final render and regenerate from the current segments. Continue?"

### 2.3 Rationale

Title Case on buttons makes interactive affordances scannable at a glance. Sentence case on body copy keeps explanatory text readable and avoids the over-capitalised look of early-aughts software. The split matches Apple HIG conventions and is the dominant pattern observed across the codebase.

---

## 3. CTAs & Buttons

### 3.1 Verb-first, action-specific labels (binding)

Button labels MUST start with a verb and describe the specific action, not a generic acknowledgement:

| Prefer | Avoid |
|--------|-------|
| "Delete project" | "OK" |
| "Rebuild audio" | "Confirm" |
| "Yes, Rebuild It" | "Yes" |
| "Uninstall Plugin" | "Delete" (alone, on a non-delete action) |
| "Delete Backup" | "Remove" (ambiguous) |

Generic "OK" is acceptable only in alert-mode confirms where there is no destructive action to name (e.g. `confirmText="OK"` on "Queue Blocked" or "Generation Blocked" alerts, where the dialog is purely informational).

### 3.2 In-progress button states

When a button is processing, replace its label with a gerund describing the operation:

- "Create Voice" → "Creating…" (or "Creating..." — see §7.1)
- "Save Changes" → "Saving…"
- "Rebuild Voice Model" → "Rebuilding…"
- "Generate Sample" → "Generating…"
- "Export Video Sample" → "Generating…"

Pair the gerund label with a `Loader2 animate-spin` icon where space allows (see `design-system.md` §9).

### 3.3 Navigation buttons

Short-form navigation buttons ("Cancel", "Back", "Close") use Title Case because they are interactive controls, not body text.

---

## 4. Confirmations & Destructive Actions

### 4.1 `ConfirmModal` defaults (binding)

`ConfirmModal` (`frontend/src/components/overlays/ConfirmModal.tsx`) has these defaults:

| Prop | Default | Effect |
|------|---------|--------|
| `isDestructive` | `true` | Red `btn-danger` confirm button, error-tinted icon |
| `cancelText` | `"Cancel"` | Left ghost button (omitted when `isAlert=true`) |
| `confirmText` | `"Confirm"` (or `"Close"` when `isAlert=true`) | Right confirm button |

All new `ConfirmModal` invocations MUST explicitly pass a specific `confirmText` that names the action (§3.1). Letting `confirmText` default to `"Confirm"` is only acceptable as a transient placeholder — production callsites must supply a verb-first label.

### 4.2 Verb-first confirm labels in practice (observed)

Real codebase examples to follow:

- Destructive: `"Delete"`, `"Delete Backup"`, `"Uninstall Plugin"`, `"Yes, Rebuild It"`, `"Continue to Edit"`
- Non-destructive: `"Yes, Queue It"`, `"Confirm Assembly"`, `"Reload Now"`, `"Understood"` (alert-only)
- Alert info-only: `"OK"` (generation blocked, voice update failed — no action taken on confirm)

### 4.3 Irreversibility messaging (binding)

Any destructive action that permanently deletes data or audio MUST include an explicit irreversibility statement in the dialog body. Preferred phrasing: **"This cannot be undone."** or **"This action cannot be undone."**

Observed compliant examples:

- `"Delete voice '…' and all N variants? This cannot be undone."` — `VoiceCatalogCard`, `NarratorCard`
- `"Delete variant '…' from '…'? This cannot be undone."` — `VariantEditor`
- `"Are you sure you want to permanently delete the backup '…'? This action cannot be undone."` — `ProjectBackupsPanel`
- `ConfirmModal` built-in project path: `"This will permanently remove all chapters and audio files. This action cannot be undone."` — `ConfirmModal` (when `projectName` is set)
- `"Proceeding will update the source text and regenerate all segments. This action cannot be undone…"` — `ResyncPreviewModal`

See §10 (Known Deviations) for callsites that are missing this statement.

---

## 5. The Five UI States

From `.agent/rules/frontend-ux.md` and `design-system.md` §8.4, every meaningful screen change MUST account for all five states:

| State | Copy guidance |
|-------|---------------|
| **loading** | Gerund phrase explaining what is loading: "Loading characters…", "Checking server status…". Never a bare spinner with no label. |
| **empty** | Sentence case. Explain the blank state and offer a next step: "No chapters yet. Add one to get started." / "Create a project to start turning text into audio." Avoid "Nothing here" or other dead-end copy. |
| **error** | Sentence case. State the cause and the remedy: "Failed to load engines. Ensure the TTS Server is running if enabled." / "Settings update failed. Please try again." Do not write "Something went wrong" without a cause. |
| **reconnecting** | The `TopBar` connection orb shows a warning tone and tooltip ("Connection reconnecting"). Inline content that depends on live data SHOULD show a stale indicator rather than hiding the data entirely. |
| **recovered** | Recovery is silent unless data changed during the outage. If the page was stale, the bootstrap re-hydrates and the connection orb returns to success tone. Explicit "You're back online" toasts are not used — there is no toast system (see §6.2). |

Prefer interfaces that explain *why* something is waiting or stale over hiding behind generic spinners. Prefer inline recovery actions over forcing the user to navigate away.

---

## 6. Loading / Empty / Success Patterns

### 6.1 Loading copy: gerund + ellipsis (binding)

In-progress states use a **gerund verb phrase followed by `…`** (single Unicode ellipsis character — see §7):

- "Loading…"
- "Saving…"
- "Uploading…"
- "Uploading icon…"
- "Checking server status…"
- "Restarting…"
- "Verifying…"
- "Exporting MP3…"
- "loading voice model…" (sentence case because this is a status label, not a button)

The pattern "Loading..." (ASCII triple-dot) appears in some older components and is a **known deviation** — the canonical form is `…` (see §7.1).

### 6.2 Success: inline badges, not toasts (binding)

There is no toast / snackbar system in Audiobook Studio. Success MUST be communicated **inline**:

- Transient text swap on the triggering element: "Uploading…" → "Replace icon" (reverts once done); "Saving…" → "Save".
- Short-lived inline badge in the triggering element: "Copied!" (observed in `VoiceIconControls`, e.g. after clipboard copy).
- Persistent state label: "Saved" (in `ChapterHeader` when no unsaved changes).
- Notification via `onShowNotification` callback (rendered as an app-level inline notification bar in the shell) — used for errors only in the observed codebase; SHOULD be used for success when the action has no other visual footprint.

Do NOT add a toast library without an explicit architecture decision. The inline model is intentional.

### 6.3 Empty states

Empty states MUST include:
1. A clear label naming what is absent: "No projects yet", "No chapters yet", "Queue is empty".
2. A next-step sentence in sentence case: "Create a project to start turning text into audio.", "Add one to get started.", "Add characters to assign specific speakers to lines of dialog."

Terse "Nothing here" or dead-end "No items" labels are not acceptable on their own.

---

## 7. Form-field Labels

### 7.1 Optional fields: `" (Optional)"` suffix (binding)

Optional form fields append `" (Optional)"` to the label — in Title Case for the label word itself, sentence case for the suffix:

- "Series (Optional)"
- "Author (Optional)"
- "Update Cover Art (Optional)"
- "Upload Manuscript (Optional)"
- "Backup Description (Optional)"

Using `placeholder="Optional"` alone (without the label suffix) is a **known deviation** (see §10) — placeholders disappear when the user starts typing and are not a reliable signal of optionality.

### 7.2 Required fields

Required fields use the HTML `required` attribute. A `" *"` asterisk suffix on the label text is acceptable but not consistently used in the codebase [unverified — confirm whether a global asterisk convention is desired]. The `MetadataEditorModal` shows a "Class, Gender, and Age are required to save." summary error message when required fields are omitted, which is the preferred pattern for grouped-required validation.

---

## 8. Punctuation & Typography of Copy

### 8.1 Ellipsis: use `…` (U+2026), not `...` (binding)

The codebase uses both `…` (Unicode HORIZONTAL ELLIPSIS, U+2026) and `...` (three ASCII periods). The canonical form is `…`:

- Correct: "Loading…", "Saving…", "Uploading…", "Checking server status…"
- Deviation: "Loading...", "Saving...", "Generating...", "Preparing...", "Finalizing...", "Processing...", "Finishing..."

Normalizing the remaining `...` instances to `…` is a **known follow-up** (see §10). New code MUST use `…`.

### 8.2 Punctuation in body copy

- Body / message copy: use standard sentence punctuation. End statements with a period. Questions with `?`.
- Button labels and modal titles: no trailing punctuation (no period, no exclamation mark).
- In-progress button labels: no trailing punctuation ("Saving…", not "Saving…!").
- Inline success badges: may use `!` for immediate positive feedback ("Copied!", "Done!") because they are transient and conversational.

### 8.3 Quotation marks in messages

Use typographically straight `'` (apostrophe) and `"` (double-quote) in message strings — they are interpolated into JSX and the surrounding font renders them fine. Do not hand-roll curly quotes in code strings.

### 8.4 Contractions

Contractions are acceptable in body / message copy to keep tone approachable ("You're back", "It'll take a moment"). Avoid them in modal titles and button labels.

---

## 9. Product Naming

### 9.1 Canonical product name: "Audiobook Studio" (binding)

The product is named **Audiobook Studio** — two words, both capitalised. This is confirmed by:

- `frontend/index.html` `<title>Audiobook Studio</title>`
- `frontend/index.html` `<meta property="og:title" content="Audiobook Studio">`
- `design-docs/specs/README.md` heading: "Audiobook Studio 2.0 — Spec Index"

The repository directory name `audiobook-factory` is a **technical artifact**, not a product name. Do not use "Audiobook Factory" in any user-facing copy.

### 9.2 Short-form references

Within the app UI, "Studio" (capitalised) is acceptable as a shorthand when context makes the product clear (e.g. "Ensure the TTS Server is running if enabled"). "Audiobook Studio" should be used in page titles, `<title>`, OG metadata, and any context where users may encounter the name for the first time.

---

## 10. Known Deviations

These are observed gaps between this spec and the current codebase. Each is a **follow-up fix**, not an emergency; record them here so they can be resolved systematically.

| ID | Location | Deviation | Rule |
|----|----------|-----------|------|
| D1 | `frontend/src/pages/ProjectLibrary/ProjectLibraryPage.tsx` lines 188 and 430 | `message=""` — both `ConfirmModal` instances pass an **empty string** as the message. The project name path in `ConfirmModal` renders the built-in consequence string when `projectName` is set, so D1b (line 430) may work in practice — but line 188 (grid view) also passes `projectName` and the empty `message` relies entirely on the built-in template. The built-in template is acceptable; the empty message is fragile. Preferred fix: pass an explicit message or use the built-in path explicitly. | §4.3 |
| D2 | `frontend/src/pages/ProjectDetail/ProjectDetailPage.tsx` — "Reset Audio" confirm | `message: 'Delete all audio for this chapter?'` — terse; no irreversibility statement. | §4.3 |
| D3 | `frontend/src/pages/ProjectDetail/ProjectDetailPage.tsx` — "Delete Chapter" confirm | `message: 'Permanently delete this chapter?'` — "Permanently" implies irreversibility but does not state "This cannot be undone." explicitly. Borderline; recommend making it explicit. | §4.3 |
| D4 | `frontend/src/components/CharactersTab.tsx` — "Delete Character" confirm | `message: 'Delete character "${name}"? All assigned sentences will revert to the default speaker.'` — explains consequence but omits the "cannot be undone" statement. Add "This cannot be undone." | §4.3 |
| D5 | `frontend/src/pages/ProjectDetail/ProjectDetailPage.tsx` — "Large Chapter" confirm | `confirmText` falls through to default `"Confirm"`. Should be a specific label e.g. `"Queue Anyway"`. (The `useStudioChapter.ts` path correctly uses `"Yes, Queue It"`.) | §3.1, §4.1 |
| D6 | `frontend/src/pages/Book/studio/useStudioChapter.ts` — blocked/info alerts | `confirmText: 'OK'` on "Queue Blocked", "Voice Update Failed" type alerts. These are alert-mode dialogs, so generic "OK" is acceptable per §3.1 — but the callsite should pass `isAlert: true` to get the "Close" default and suppress the cancel button. Currently they do not set `isAlert`, leaving a redundant "Cancel" button. | §4.1 |
| D7 | Several files | ASCII triple-dot `...` instead of `…` in loading copy: `"Loading..."`, `"Saving..."`, `"Generating..."`, `"Preparing..."`, `"Finalizing..."`, `"Processing..."`, `"Finishing..."`, `"Rebuilding..."`, `"Saving Changes..."`, `"Creating..."`. | §7.1, §8.1 |
| D8 | `frontend/src/pages/ProjectLibrary/ProjectLibraryPage.tsx` lines 166, 170, 379, 397 | Optional fields use `placeholder="Optional"` on the input rather than `" (Optional)"` on the label. Placeholder text is not a reliable optionality signal. | §7.1 |

---

## 11. Cross-References

- Design tokens, type scale, shared component primitives, accessibility baseline: [design-system.md](design-system.md) — in particular §6 (`ConfirmModal`) and §8.4 (five UI states)
- Five UI states from `.agent/rules/`: `.agent/rules/frontend-ux.md`
- Progress-state copy and ETA messaging: [progress-presentation.md](progress-presentation.md)
- App shell connection-state display (TopBar, reconnecting orb): [site-shell-and-book-pipeline.md](site-shell-and-book-pipeline.md)
- Iconography for in-progress buttons (Loader2): [design-system.md](design-system.md) §9
