# Phase 9: Plugin Ecosystem And External TTS API

## Objective

Harden the plugin system for community contributions and open the TTS API for external applications. This phase builds on the TTS Server (Phase 5), voice module UI (Phase 7), and documentation work (Phase 8).

## Prerequisites

- TTS Server running as a managed subprocess with watchdog (Phase 5)
- Plugin folder scanning and verification synthesis operational (Phase 5)
- Settings page with TTS Engines tab rendering schema-driven forms (Phase 7)
- Plugin developer guide and template created (Phase 8)

## Deliverables

- pip entry-point discovery for `studio.tts` entry point group
- plugin dependency auto-detection and guided install flow
- plugin security boundary documentation
- external TTS API authentication (optional API key)
- external TTS API rate limiting
- external TTS API access control (local-only vs. LAN binding)
- studio-as-TTS-gateway documentation and usage examples
- example third-party plugin as proof-of-concept
- OpenAPI documentation auto-generated from API routes
- plugin submission guidelines and review process

## Deliverables Checklist

- [ ] Entry-point discovery via `importlib.metadata` implemented
- [ ] Plugin dependency detection with UI install prompt implemented
- [ ] Plugin security boundary documented
- [ ] API key authentication implemented
- [ ] API rate limiting implemented (queue-based + request-level)
- [ ] LAN binding option with configuration implemented
- [ ] Studio-as-TTS-gateway documentation written
- [ ] Example third-party plugin created and tested
- [ ] OpenAPI/Swagger documentation generated and accessible
- [ ] Plugin submission guidelines published
- [ ] CONTRIBUTING.md updated with plugin contribution workflow

## Scope

- this phase enables community contributions but does not mandate a plugin marketplace or centralized distribution
- pip-installable plugins are an alternative to drop-in folders, not a replacement
- API authentication and rate limiting are functional but intentionally simple for local use
- no cloud-hosted plugin registry or automatic update checking

## Tests

- entry-point discovery with mock pip packages
- API key authentication flow (valid key, invalid key, no key when required)
- rate limiting under concurrent external requests
- plugin isolation: deliberately bad plugin does not crash TTS Server
- OpenAPI spec validation
- LAN binding acceptance test

## Verification Checklist

- [ ] Entry-point discovery tests pass
- [ ] API key authentication tests pass
- [ ] Rate limiting tests pass
- [ ] Plugin isolation tests pass
- [ ] OpenAPI spec is valid and accessible
- [ ] LAN binding test passes

## Exit Gate

- a community-contributed plugin can be installed (drop-in or pip), verified, configured through the UI, and used for synthesis via both Studio projects and the external API
