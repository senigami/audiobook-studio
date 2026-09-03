# Live Demos

Audiobook Studio ships an interactive demo that runs the real production UI components against a scripted render session. There is no backend and nothing to install.

## What the demo shows

The demo mounts the actual React components from the production build and replays a scripted chapter render through the app's pub/sub event bus (`publishStudioSocketMessage`). Every live component responds exactly as it does in production:

- **Live Event Stream**: the event table as the scripted session plays, with topic, event kind, job/chapter/segment IDs, progress, ETA, and the group counter ticking 1/4 through 4/4.
- **Queue**: Processing Now, Up Next, and History sections filling as the render arc progresses.
- **Progress bars**: PredictiveProgressBar walking through preparing, running, finalizing, and done, with a live ETA countdown.
- **Voice Lab**: real Voice Lab components showing 4 demo voices in different states (READY, BUILD TO TEST, NO SAMPLES) with engine badges. Voice previews are silent placeholders.

REST reads come from a static fixture implementation, so the demo makes no network calls.

## Links

| What | URL |
|------|-----|
| Full interactive demo | https://senigami.github.io/audiobook-studio/demo/ |
| Live Event Stream stage | https://senigami.github.io/audiobook-studio/demo/#/stage/live-output |
| Queue stage | https://senigami.github.io/audiobook-studio/demo/#/stage/queue |
| Progress stage | https://senigami.github.io/audiobook-studio/demo/#/stage/progress |
| Voice Lab stage | https://senigami.github.io/audiobook-studio/demo/#/stage/voice-lab |
| Design Spec Sheet (styleguide) | https://senigami.github.io/audiobook-studio/demo/#/styleguide |

## Deep-linking to a stage

Stages are routed by hash: `#/stage/<id>`. The stage IDs exported by `DemoApp.tsx` are:

- `live-output`: the Live Output Table (event stream)
- `queue`: the Global Queue with Processing Now / Up Next / History
- `progress`: PredictiveProgressBar with full lane transitions
- `voice-lab`: Voice Lab cards in READY, BUILD TO TEST, and NO SAMPLES states

Append `?embed=1` to hide the demo header. The showcase page uses this for its iframe embed.

## Technical notes

The demo is a separate Vite build entry (`frontend/vite.demo.config.ts`) that outputs to `docs/demo/` and is served under the `/audiobook-studio/demo/` base path on GitHub Pages. The scripted session lives in `frontend/src/demo/scenes/` as typed frames built from the live-event contracts (`liveEvents.ts` v1.5.0), so the demo stays correct against contract changes without capturing a live backend session.

To rebuild the demo from source:

```bash
npm -C frontend run build:demo
```

Run this at release time so the demo matches the production UI (it is on the release checklist, doc 08).
