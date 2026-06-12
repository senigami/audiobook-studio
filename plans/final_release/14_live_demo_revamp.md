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
4. **AI Voice Lab** — 3–4 seeded NarratorCards with variants, engine badges, and playable pre-rendered `sample.mp3` previews. *(voice-lab stage shipped 2026-06-11 with real NarratorCards + placeholder preview tones; real sample.mp3 assets still wanted.)*
5. **Chapter Editor (read-only)** — ScriptView with per-segment voice assignment colors and segments lighting up as "rendered" during playback.
6. **Library** — seeded project cards as the entry view.
7. Light/dark theme toggle once doc 07 lands — a free, impressive demo feature.

## Implementation steps

- [x] **1. Capture a session fixture.** ~~Run the app, render a small 4-chapter project, capture all `/ws` frames (DevTools → WS messages → export). Save as `frontend/src/demo/fixtures/demo-session.json`.~~ **Replaced by typed scene-script engine in `frontend/src/demo/scenes/` — frames built from the live-event contracts (1.5.0), no capture needed. Scripted render arc lives in `renderArcScene.ts`; typed helpers in `frameBuilders.ts`.**
- [x] **2. Static REST fixtures.** Implemented `createMockApiClient` in `frontend/src/api/client.ts`; fixture data in `frontend/src/demo/fixtures/restFixtures.ts`.
- [x] **3. `useDemoTransport` hook** at `frontend/src/demo/useDemoTransport.ts`: replays scene frames via `publishStudioSocketMessage` on a ~400ms cadence; loops with clean reset.
- [x] **4. `DemoApp.tsx`** at `frontend/src/demo/`: hash-routed shell with stage index grid; "demo mode" badge + toast for blocked actions; light/dark theme toggle with localStorage persistence.
- [x] **5. Build target.** `frontend/vite.demo.config.ts` — same plugins + `@` alias as main config, `root: 'src/demo'`, `base: '/audiobook-studio/demo/'`, `build.outDir` → `docs/demo/` (absolute path, `emptyOutDir: true`). Script `"build:demo": "vite build --config vite.demo.config.ts"` added to `frontend/package.json`. Output verified: `docs/demo/index.html` + hashed assets.
- [x] **6. Wire into the showcase.** Inserted prominent "▶ Try the Interactive Demo" CTA card + iframe embed (`#/stage/live-output?embed=1`) into `docs/v1.html` between the hero-pod and The Studio Tour sections. Audio sample sections untouched. Added "Interactive Demo" nav link to `docs/index.html`.
- [x] **7. Refresh the static page.** Token-sync part **done**: `scripts/sync_showcase_tokens.mjs` (plain Node, no deps) reads `frontend/src/theme/tokens.css`, extracts the `:root` and `[data-theme="dark"]` blocks verbatim, and replaces the marked region in `docs/v1.html` between `/* BEGIN GENERATED TOKENS */` / `/* END GENERATED TOKENS */` markers. Idempotent. Old `:root` had 12 tokens (heavily drifted); new block injects all 86 defined tokens. One legacy alias needed: `--info-tint` (used in v1.html, renamed to `--as-info-tint` in tokens.css) → mapped to `#f0f7ff` in a `:root { --legacy... }` block inside the generated region. Brace-balance verified after injection. Run via `npm -C frontend run sync:showcase-tokens`. **Screenshots remain unchecked — manual update to current 2.0 UI is still required.**
- [ ] **8. CI / release checklist.** Add both scripts to the release checklist (doc 08) so they run at each release: `npm -C frontend run sync:showcase-tokens` (regenerates token region in `docs/v1.html`) and `npm -C frontend run build:demo` (rebuilds the interactive demo into `docs/demo/`). Stale demo or drifted tokens = silent misrepresentation.
- [ ] **9. Interim quick win (optional, before steps 1–8 land):** replace the dashed placeholders with short looping `.webm` screen captures of the queue + progress bar — an afternoon's work that removes the most embarrassing gap while the real demo is built.

*Final acceptance:* a visitor on GitHub Pages watches the queue process chapters with live progress bars, plays voice samples from NarratorCards, browses a chapter's script view, toggles light/dark — all running the production components, no backend.
