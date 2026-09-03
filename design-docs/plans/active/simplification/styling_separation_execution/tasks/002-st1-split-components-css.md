# Task 002 — Split components.css into 11 domain files

DONE — 2026-07-10 (commit `ed172a03`, per `../status.json`). `theme/components.css` split into 11
domain files under `theme/components/`, assembled via `@import` in `theme/index.css` in the exact
original cascade order; monolith retired. (`form-input`/`voice-dropzone` kept in `misc.css` for
cascade-order safety — see status.json note.) See `design-system.md` changelog 1.14.0.
