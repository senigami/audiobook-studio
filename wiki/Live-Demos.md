# Live Demos

Audiobook Studio ships an interactive demo: a guided tour of the real Studio screens. There is no backend and nothing to install.

## What the tour shows

- Library (open a book to see its Book, Contents, Cast, Lexicon, Publish and Backups tabs)
- Voices
- Activity
- Engines
- Integrations
- Settings

REST reads come from static fixtures, so the demo makes no network calls.

## Links

| What | URL |
|------|-----|
| Interactive demo (app tour) | https://senigami.github.io/audiobook-studio/demo/ |
| Deep link to the tour | https://senigami.github.io/audiobook-studio/demo/#/stage/site-mockup |

Append `?embed=1` to hide the demo header.

## Technical notes

The demo is a separate Vite build (`frontend/vite.demo.config.ts`) that outputs to `docs/demo/` and is served under the `/audiobook-studio/demo/` base path on GitHub Pages.

To rebuild the demo from source:

```bash
npm -C frontend run build:demo
```

This builds the tour only. `build:demo:full` is the internal five-stage showcase.
