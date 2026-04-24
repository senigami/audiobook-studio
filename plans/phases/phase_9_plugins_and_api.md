# Phase 9: Plugin Ecosystem And External Surfaces

## Objective

Open the stabilized Studio 2.0 architecture outward to contributors and external clients after the product shell, portability foundation, and plugin UX are already solid.

## Prerequisites

- TTS Server running as a managed subprocess with watchdog (Phase 5)
- Settings page with schema-driven TTS Engines tab complete (Phase 7 baseline)
- Queue companion drawer and shell behavior stabilized (Phase 8)
- Project snapshot/export foundation in place (Phase 8)
- Plugin setup and recovery diagnostics hardened (Phase 8)

## Deliverables

- pip entry-point discovery for the `studio.tts` entry point group
- plugin dependency auto-detection and guided install flow beyond simple local refresh guidance
- plugin security boundary documentation for third-party contributors and users
- external TTS API authentication (optional API key)
- external TTS API rate limiting
- external TTS API access control (local-only vs LAN binding)
- studio-as-TTS-gateway documentation and usage examples
- example third-party plugin as proof-of-concept
- OpenAPI documentation generated from the public API routes
- plugin submission guidelines and review process

## Deliverables Checklist

- [ ] Entry-point discovery via `importlib.metadata` implemented
- [ ] Plugin dependency detection and guided install flow implemented
- [ ] Plugin security boundary documented
- [ ] API key authentication implemented
- [ ] API rate limiting implemented
- [ ] LAN binding option with configuration implemented
- [ ] Studio-as-TTS-gateway documentation written
- [ ] Example third-party plugin created and tested
- [ ] OpenAPI/Swagger documentation generated and accessible
- [ ] Plugin submission guidelines published
- [ ] CONTRIBUTING.md updated with plugin contribution workflow

## Scope

- this phase enables community contributions and external client usage after the core product is stable
- pip-installable plugins are an alternative to drop-in folders, not a replacement
- API authentication and rate limiting should stay intentionally simple for local-first use
- no plugin marketplace, cloud registry, or automatic update checking
- keep the plugin contract generic; do not fork built-in and third-party engines into separate UI or runtime models

## Tests

- entry-point discovery with mock pip packages
- plugin dependency detection/install-guidance tests
- API key authentication flow tests
- rate limiting under concurrent external requests
- plugin isolation tests so a bad plugin does not crash the TTS Server
- OpenAPI spec validation
- LAN binding acceptance test

## Verification Checklist

- [ ] Entry-point discovery tests pass
- [ ] Plugin dependency guidance tests pass
- [ ] API key authentication tests pass
- [ ] Rate limiting tests pass
- [ ] Plugin isolation tests pass
- [ ] OpenAPI spec is valid and accessible
- [ ] LAN binding test passes

## Exit Gate

- a community-contributed plugin can be installed by folder drop-in or pip packaging, verified, configured through the same schema-driven UI, and used safely
- external clients can access the TTS API through a documented, authenticated, and rate-limited surface
