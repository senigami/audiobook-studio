# 14 — Live Demo / Showcase Revamp

The Live Demo at `https://senigami.github.io/audiobook-studio/` (served from `docs/` — landing `docs/index.html`, showcase `docs/v1.html`) is a 1,678-line hand-authored static HTML page: screenshots, two audio samples, dashed `.placeholder` boxes, and a duplicated copy of the app's CSS variables. It shares zero code with `frontend/src`. Owner verdict: placeholder-grade; it must demonstrate the real components doing real (simulated) work.

Note: `app/domain/demo_bundle.py` + `demo/demo.zip` are a different feature (first-run in-app demo content for Pinokio installs) — unaffected by this plan.

## Decision: build the demo from the real frontend with a scripted event stream

The app's pub/sub bus (`frontend/src/store/studioSocketBus.ts`) is a clean injection point — `publishStudioSocketMessage(frame)` drives every live component (PredictiveProgressBar, GlobalQueue, StatusOrb) exactly as production does. We replay a recorded render session through it instead of opening a websocket. REST reads come from a static-fixture implementation of the existing `createMockApiClient` stub (`frontend/src/api/client.ts`).

Rejected alternatives: screen-recording videos (stale on every UI change, no interactivity — but see step 9 for a cheap interim use); hosting the real app in the cloud (local-first architecture, GPU dependence, permanent ops burden).

## What the demo must showcase

1. **Global queue, live** — Processing Now / Up Next / History sections filling as the scripted session plays; drag-reorder enabled on the Up Next list.
2. **PredictiveProgressBar** — a chapter rendering with real preparing → running → finalizing → done lane behavior and ETA.
3. **StatusOrbs** — chapter rows transitioning states during playback.
4. **AI Voice Lab** — 3–4 seeded NarratorCards with variants, engine badges, and playable pre-rendered `sample.mp3` previews.
5. **Chapter Editor (read-only)** — ScriptView with per-segment voice assignment colors and segments lighting up as "rendered" during playback.
6. **Library** — seeded project cards as the entry view.
7. Light/dark theme toggle once doc 07 lands — a free, impressive demo feature.

## Implementation steps

- [ ] **1. Capture a session fixture.** Run the app, render a small 4-chapter project, capture all `/ws` frames (DevTools → WS messages → export). Save as `frontend/src/demo/fixtures/demo-session.json` (array of raw `studio_event` envelopes). Trim to a ~60–90 second arc: queue fills → chapter renders with progress → completes → next starts.
  *Accept:* file validates against the event contracts in `frontend/src/api/contracts/liveEvents.ts` (including the envelope version field per doc 02).
- [ ] **2. Static REST fixtures.** Implement `createMockApiClient` in `frontend/src/api/client.ts` (currently a throw-stub) returning fixture data for home/projects/speakers/queue snapshots, matching the captured session's entities. Delete the stub-or-implement ambiguity tracked in doc 06 by implementing it here.
- [ ] **3. `useDemoTransport` hook** at `frontend/src/demo/useDemoTransport.ts`: on mount, `setStudioSocketConnected(true)`, then replay fixture frames via `publishStudioSocketMessage` on an interval (honor relative timestamps if captured; else ~400ms cadence); loop the script with a clean reset between passes.
- [ ] **4. `DemoApp.tsx`** at `frontend/src/demo/`: a slim shell mounting Library → (click-through) Project chapters → Chapter Editor (read-only) → Voice Lab → Queue drawer, using the mock client + demo transport. Disable mutating actions (queue, delete, save) with a friendly "demo mode" toast rather than hiding them.
- [ ] **5. Build target.** Add a `demo` Vite build (`npm run build:demo`) outputting to `docs/demo/`; verify asset paths work under the GitHub Pages subpath (`base: '/audiobook-studio/demo/'`).
- [ ] **6. Wire into the showcase.** Replace the `.placeholder` boxes in `docs/v1.html` with a prominent "Try the interactive demo" CTA linking to `/demo/` (iframe embed optional for the hero). Keep the audio quality samples — they demonstrate output, which the interactive demo can't.
- [ ] **7. Refresh the static page.** Update screenshots to current 2.0 UI; remove duplicated `:root` token block drift by regenerating it from `frontend/src/theme/tokens.css` (one-time script or manual sync note).
- [ ] **8. CI.** Add `build:demo` to the release checklist (doc 08) so the demo is rebuilt from the same commit as each release; stale demo = silent misrepresentation.
- [ ] **9. Interim quick win (optional, before steps 1–8 land):** replace the dashed placeholders with short looping `.webm` screen captures of the queue + progress bar — an afternoon's work that removes the most embarrassing gap while the real demo is built.

*Final acceptance:* a visitor on GitHub Pages watches the queue process chapters with live progress bars, plays voice samples from NarratorCards, browses a chapter's script view, toggles light/dark — all running the production components, no backend.
