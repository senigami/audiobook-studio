# Live Demos

Audiobook Studio ships an interactive demo that runs the real production UI components against a scripted render session — no backend, no install required.

## What the demo shows

The demo mounts the actual React components from the production build and replays a scripted chapter-render arc through the app's pub/sub event bus (`publishStudioSocketMessage`). Every live component responds exactly as it does in production:

- **Live Event Stream** — real-time event table showing topic, event kind, job/chapter/segment IDs, progress, ETA, and group ticking as the scripted session plays
- **Queue** — Processing Now / Up Next / History sections filling as the render arc progresses
- **Progress bars** — PredictiveProgressBar with preparing → running → finalizing → done lane behavior and ETA countdown

REST reads come from a static fixture implementation — no network calls are made.

## Links

| What | URL |
|------|-----|
| Full interactive demo | https://senigami.github.io/audiobook-studio/demo/ |
| Live Event Stream stage | https://senigami.github.io/audiobook-studio/demo/#/stage/live-output |
| Queue stage | https://senigami.github.io/audiobook-studio/demo/#/stage/queue |
| Progress stage | https://senigami.github.io/audiobook-studio/demo/#/stage/progress |

## Deep-linking to a stage

Stages are routed by hash: `#/stage/<id>`. The stage IDs exported by `DemoApp.tsx` are:

- `live-output` — Live Output Table (real-time event stream)
- `queue` — Global Queue with Processing Now / Up Next / History
- `progress` — PredictiveProgressBar with full lane transitions

Append `?embed=1` to hide the demo header (used for iframe embeds in the showcase page).

## Technical notes

The demo is a separate Vite build entry (`frontend/vite.demo.config.ts`) that outputs to `docs/demo/`. It is served under the `/audiobook-studio/demo/` base path on GitHub Pages. The scripted session is defined in `frontend/src/demo/scenes/` using typed frames built from the live-event contracts (`liveEvents.ts` v1.5.0) — no capture of a live backend session is needed.

To rebuild the demo from source:

```bash
npm -C frontend run build:demo
```

This must be run at release time to keep the demo in sync with the production UI (noted in the release checklist, doc 08).
