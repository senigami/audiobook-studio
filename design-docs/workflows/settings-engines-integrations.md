# Settings, Engines, And Integrations Workflows

Source: settings, engines/plugins, integrations/API, and site mockup platform/settings flows.

## 1. Settings defaults and admin surfaces

- Approx clicks: 4-8
- Complexity: medium
- Path: open Settings, adjust defaults, inspect About, toggle Developer mode, open dev tools
- Pain points:
  - Setup is split across Settings, About, Developer, Engines, and Integrations.
  - Autosave reduces friction but hides state changes.
  - Developer tools are easy to miss.

## 2. Plugin install, trust, and dependency confirmation

- Approx clicks: 3-6
- Complexity: high
- Path: open Engines, choose a card or registry entry, install deps/import plugin, review trust modal, confirm
- Pain points:
  - ZIP import, GitHub URL install, and official registry are separate entry points.
  - Trust confirmation is necessary but adds cognitive load.
  - Different install paths land at the same end state, so users must remember where they started.

## 3. Engine module settings

- Approx clicks: 2-6
- Complexity: medium
- Path: open Module Settings, change schema-driven fields, save or reset
- Pain points:
  - This is a second settings surface separate from General Settings.
  - Editable and computed values share the same form area.
  - Plugin-specific settings are merged elsewhere, so the full contract is not obvious.

## 4. Integrations/API request builder

- Approx clicks: 4-8
- Complexity: high
- Path: open Integrations, rotate key or enable LAN access, adjust request builder, send test request, inspect payloads
- Pain points:
  - Security-sensitive controls sit beside a live request builder.
  - LAN enablement and key rotation require explicit warning flows.
  - The recommended path is informational rather than enforced.

## Recommendation

- Collapse the copy around Settings/Engines/Integrations so setup reads like one platform flow.
- Make plugin installation a single staged flow: source, trust, confirm, refresh.
- Separate API security controls from request-building demos.

