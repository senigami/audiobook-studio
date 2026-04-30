# Backend Boundaries

Use this file for routing, service layers, queue policy, and legacy migration boundaries.

## Core Rules

- Route handlers should call domain services and orchestrator services, not engine-specific or worker-specific code directly.
- Engine wrappers must not decide scheduling policy.
- Queue tasks must declare resource needs; they must not acquire ad-hoc locks scattered through task code.
- Keep domain logic, orchestration logic, engine integration, and infrastructure concerns in separate modules.
- Prefer explicit repositories and services over ad-hoc data access from route handlers and workers.
- During migration, compatibility adapters are acceptable, but they should live in explicit legacy or adapter layers.
- Do not let temporary migration code redefine the long-term architecture.
