# Roadmap

## Workloads

```
Workload A (ST-1, serial within itself)
  001-st1-delete-dead-selectors  ──►  002-st1-split-components-css
                                            │
Workload B (ST-2, depends on A)            ▼
  003-st2-shared-classes  ◄──────── (needs core.css/shared.css to exist as a target)
        │
        ▼
Workload C (ST-3, depends on B; 14 tasks fully parallel-safe among themselves)
  004  005  006  007  008  009  010  011  012  013  014  015  016  017
  (CastPalette, ProjectLibraryPage, VoiceModals, GlobalQueue, ResyncPreviewModal,
   OfficialRegistryPanel, VariantEditor, WelcomePage, ScriptEditor, LiveOutputPage,
   MetadataEditorModal+children, EngineCard+children, VoicesTabHeader, SampleManager)
        │
        ▼
Workload D (ST-4, depends on C being done — the guard should scan the already-converted state)
  018-st4-spec-bump-and-guard

Optional, non-gating follow-up (no dependency on the above):
  019-followup-missed-utility-usage  (renumbered from 017 above to avoid collision — see file)
```

**Dependency notes:**
- Workload A must finish before B/C — B needs the target files (`core.css`, `shared.css`) to exist,
  and C's per-file edits should target the new split files, not the monolith.
- Workload C's 14 tasks have **zero cross-file dependencies** — dispatch them in parallel to
  separate implementer agents, each its own commit. A file that references another ST-3 file's new
  local class is the only cross-task coupling to watch for; none are expected (each file's
  file-scoped classes stay file-scoped) but flag it if found.
- Workload D should run last so the CI guard is checked against the fully-converted end state
  (avoids a guard that immediately fails CI on day one from files not yet touched).

## Risk flags (per this repo's plan-architect convention)

| Task(s) | Risk flag | Why |
|---|---|---|
| 001, 002 | `multi-file` | the whole app's CSS cascade depends on getting the split + import order right — cross-file consistency check required (I1/I2 in the map), not just per-file correctness |
| 003 | `multi-file` | new shared classes must render identically to every inline instance they replace |
| 004–017 | `none` | each is a self-contained single-file (or tightly-scoped multi-child-file) conversion, one commit, low blast radius |
| 018 | `none` | spec/doc edits + a new opt-in CI script; nothing production-breaking |

No task in this plan is `quality-sensitive` or `external-reference` — this is pure internal CSS/JSX
refactoring with no auth/payment/migration/data-loss surface and no dependency on facts outside the
repo. Per `plan-advisor`'s Config C routing, none of these need a frontier gate; `review-adversarial`
after each workload is sufficient.

## Verification per workload

- **After A:** `npm -C frontend run build` succeeds; `grep -rn "components.css" frontend/src`
  returns nothing (old monolith fully retired, not just emptied); the 5 dead selectors are gone
  repo-wide (`grep -rn "btn-home\|btn-menu-destructive\|action-menu-item\|select-glass\|engine-chunk" frontend/src`
  → 0 hits including in JSX `className` usages — if any JSX referenced them, that's a **separate**
  finding to surface to the owner, not silently fix, since a JSX reference to a dead selector may
  indicate a real (if minor) existing bug).
- **After B:** `npm -C frontend run build` + unit tests green; each new class spot-checked against
  one converted inline instance in both themes (owner, batched into the final check below — don't
  pause here).
- **After C (each task):** `npm -C frontend run build`, `npm -C frontend run lint`,
  `npm -C frontend run test -- --run` (targeted to the touched file's test path if one exists)
  green; `grep -c "style={{" <file>` dropped to only the genuinely-dynamic remainder (0 for most
  files).
- **After D:** the new CI guard script runs clean against the current tree; `code-organization.md`
  and `design-system.md` diffs show correct version bumps + changelog rows.

## Final owner visual-check checklist (batched — one pass, not per-file)

Per this repo's own working rule ("ask the owner rather than self-previewing each one"), present
this checklist to the owner once all of Workload C is done, in **both light and dark themes**:

- [ ] Nav rail, mobile nav drawer, top bar — pixel-identical to before (ST-1 nav.css move)
- [ ] A book's Chapter Workspace, Casting tab, Lexicon tab, Publish tab — pixel-identical (ST-1
      book/book-tabs/publish.css moves)
- [ ] Activity page — pixel-identical (ST-1 activity.css move)
- [ ] Global player bar — pixel-identical (ST-1 player.css move)
- [ ] Voice Lab pages + a voice catalog card — pixel-identical (ST-1 voice-lab.css move)
- [ ] Review/Revise/Write tools — pixel-identical (ST-1 review-tools.css move)
- [ ] A toggle switch, a modal close button, the color-swatch picker — pixel-identical (ST-1
      misc.css move)
- [ ] `CastPalette.tsx` screen — same look, all interactions still work (ST-3)
- [ ] `ProjectLibraryPage.tsx` — same look (ST-3)
- [ ] Voice edit modals (`VoiceModals.tsx`, `MetadataEditorModal.tsx` + its child components) —
      same look, chip/select/upload controls still function (ST-3)
- [ ] Engine card + calibration/settings/test-sample sections (`EngineCard.tsx` + children) — same
      look (ST-3)
- [ ] Global queue drawer (`GlobalQueue.tsx`) — same look (ST-3)
- [ ] `ResyncPreviewModal.tsx` (via the Book workspace's Cast tool or ChapterTextPanel) — same look
      (ST-3)
- [ ] Official registry panel, variant editor, sample manager, voices tab header — same look (ST-3)
- [ ] Welcome page, live output page, script editor — same look (ST-3)
- [ ] Spot-check `/#/styleguide` for any regression from the dead-selector deletion

Once every box is checked, archive this plan folder per `README.md`'s archive convention.
