# Backend Boundaries

Use this file for routing, service layers, queue policy, and legacy migration boundaries.

## Core Rules

- Route handlers should call domain services and orchestrator services, not engine-specific or worker-specific code directly.
- Engine wrappers must not decide scheduling policy.
- Queue tasks must declare resource needs; they must not acquire ad-hoc locks scattered through task code.
- Keep domain logic, orchestration logic, engine integration, and infrastructure concerns in separate modules.
- Prefer explicit repositories and services over ad-hoc data access from route handlers and workers.
- Keep retryable operations idempotent. Re-running a queue task, migration helper, or external integration step should not duplicate durable state or corrupt artifacts.
- Validate request and persisted inputs before they reach domain logic, especially when they control paths, engine/plugin selection, or queue operations.
- Use structured logging with enough context to diagnose failures, but never log secrets, raw credentials, or unnecessarily large payloads.
- Use clear error boundaries: service failures should be visible and actionable, not silently converted into legacy fallbacks.
- During migration, compatibility adapters are acceptable, but they should live in explicit legacy or adapter layers.
- Do not let temporary migration code redefine the long-term architecture.
