# Documentation Audit — Studio 2.0 (Phase 13, #111)

First deliverable of [#111](https://github.com/senigami/audiobook-studio/issues/111):
classify every existing doc surface before writing new material, and map it to its
destination in the new `handbook/`.

**Disposition legend:** `keep+update` · `rewrite` · `split` · `archive` · `delete` ·
`replace` (with generated/API-backed content) · `reuse` (assets).

## Root & app docs

| Source | Disposition | Destination / Notes |
| --- | --- | --- |
| `README.md` | keep+update | Refresh to 2.0 as the repo front door; link to the handbook. Verify all claims against current behavior. |
| `frontend/README.md` | keep+update | Confirm dev/build steps still match; cross-link `architecture/frontend`. |

## Marketing / demo site (`docs/`)

| Source | Disposition | Destination / Notes |
| --- | --- | --- |
| `docs/index.html` | keep+update | The public showcase. Handbook reuses its visual language; refresh copy/screenshots for v2 (live-demo refresh in #111). |
| `docs/assets/*.png/.jpg` | reuse | Re-screenshot for current UI during content pass; keep audio samples (`*.mp3`). |
| `docs/assets/pinokio*.png` | archive (for now) | Pinokio is out of current scope; revisit when Pinokio support lands. |

## Plugin & API docs (`docs/`)

| Source | Disposition | Destination / Notes |
| --- | --- | --- |
| `docs/plugin-guide.md` | split → source | Becomes `plugin-sdk/{overview,anatomy,manifest,engine-contract,behavior-metadata,...}`. Align to v2-only runtime + contract v1. |
| `docs/plugin-submission-guidelines.md` | keep+update | → `plugin-sdk/submission`. |
| `docs/plugin-template/` | keep+update | → `plugin-sdk/template`; verify manifest/`settings_schema.json` (`x-ui`) fields current. |
| `docs/studio-as-tts-gateway.md` | split → source | Becomes `api/{overview,auth,endpoints,sync-vs-queued,priority,examples}`. |
| OpenAPI ref (`/api/v1/tts/docs`) | replace (generated) | Link the live/generated spec rather than hand-maintaining endpoint tables. |

## Wiki (`wiki/`, Studio 1.x)

The handbook supersedes the 1.x wiki. Rewrite the substance into the handbook; archive
the originals (don't keep stale 1.x behavior described as current).

| Source | Disposition | Destination in handbook |
| --- | --- | --- |
| `wiki/Home.md` | rewrite → archive | `overview/*` |
| `wiki/Getting-Started.md` | rewrite → archive | `getting-started/*` |
| `wiki/Concepts.md` | rewrite → archive | `concepts/*` |
| `wiki/Library-and-Projects.md` | rewrite → archive | `user-guide/{project-library,project-workspace,chapters-tab}` |
| `wiki/Queue-and-Jobs.md` | rewrite → archive | `user-guide/processing-queue` + `architecture/orchestration` |
| `wiki/Voices-and-Voice-Profiles.md` | rewrite → archive | `concepts/voices` + `user-guide/voice-lab` |
| `wiki/Settings.md` | rewrite → archive | `user-guide/settings` |
| `wiki/Recording-Guide.md` | keep+update → archive | `user-guide/voice-lab` (Recording Guide) |
| `wiki/File-Formats-and-Audio-Guidance.md` | keep+update → archive | `user-guide/audio-formats` + `reference/file-formats` |
| `wiki/Troubleshooting-and-FAQ.md` | keep+update → archive | `user-guide/troubleshooting` |
| `wiki/Comparison-and-Cost.md` | rewrite → archive | `overview/use-cases` + `engines/voxtral` (cost) |
| `wiki/Changelog.md` | keep+update | `whats-new/changelog` (single source going forward) |
| `wiki/README.md` | replace | Meta page; point readers to the handbook. |
| `wiki/images/` | reuse | Migrate still-accurate images; re-shoot the rest. |

## Repo metadata & release

| Source | Disposition | Notes |
| --- | --- | --- |
| GitHub release notes | keep+update | Drive from `whats-new/*` + `pr-talking-points`. |
| Repo description / topics | keep+update | Reflect 2.0 capabilities (plugins, external API). |

## Cross-cutting rules (from #111 non-goals)

- No public doc may describe silent v1 fallback as normal behavior.
- README, wiki successor (handbook), plugin docs, and API docs must agree with each other.
- Don't keep obsolete v1 docs "for nostalgia" unless clearly archived.
