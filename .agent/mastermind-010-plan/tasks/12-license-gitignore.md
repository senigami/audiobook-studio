# Task 12 — LICENSE + .gitignore + .DS_Store purge (mechanical)

## RESOLVED (user, Checkpoint 2):
- **XTTS: CPML-1.0** — honor the upstream model's requirements (Coqui Public Model License; the
  manifest already declares it). LICENSE file = CPML-1.0 text (fetch from Coqui's published license;
  if offline, a LICENSE noting "Coqui Public Model License 1.0" with pointer + terms summary is
  acceptable for this in-tree step, flag for extraction day). Manifest `license` stays `CPML-1.0`.
- **Voxtral: MIT** for the plugin code. Manifest `license` field changes `"Commercial API"` → `"MIT"`.
  README notes the engine requires a Mistral API key; API usage governed by Mistral's terms.

## Changes (per plugin)
- `plugins/tts_xtts/LICENSE`, `plugins/tts_voxtral/LICENSE` — full text per user's answer.
- `plugins/*/.gitignore`: `__pycache__/`, `*.pyc`, `.DS_Store`, `*.egg-info/`, model-cache dirs
  (check plugin code for cache paths: `grep -rn "cache" plugins/tts_xtts/plugin/server/engine.py | head -5`).
- Purge committed junk: `find plugins/tts_xtts plugins/tts_voxtral -name ".DS_Store"` → git rm each.

Acceptance: files present; `git status` clean of .DS_Store; suite green (no code paths touched).
