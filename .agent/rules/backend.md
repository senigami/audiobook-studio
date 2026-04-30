# Backend Rules

Use this file when the task touches backend orchestration, queueing, progress, artifact publication, or filesystem path handling.

## Read The Right Subfile

- [`backend-artifacts.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-artifacts.md) for manifest validation, publish flow, cache immutability, and recovery safety.
- [`backend-progress.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-progress.md) for progress math, ETA rules, rounding, and update throttling.
- [`backend-boundaries.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-boundaries.md) for route/service/engine boundaries and migration discipline.
- [`backend-paths.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-paths.md) for request-derived paths and containment checks.

## Load Order

1. [`backend-progress.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-progress.md) for ETA, rounding, and progress consistency.
1. [`backend-artifacts.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-artifacts.md) for publish/recovery/immutability.
1. [`backend-paths.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-paths.md) for any request-derived path handling.
1. [`backend-boundaries.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/backend-boundaries.md) for routing, orchestration, queue policy, and migration shape.

## Pair With

- [`modular_architecture.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/modular_architecture.md) for Studio 2.0 boundary rules.
- [`verification.md`](/Users/stevendunn/GitHub-Steven/audiobook-factory/.agent/rules/verification.md) for the required backend test and lint verification.
