# Phase 5: Orchestrator Beside Legacy Queue

## Objective

Introduce the 2.0 orchestrator under feature flags while the legacy queue still exists.

## Deliverables

- task hierarchy
- scheduler policies
- resource claims
- recovery logic
- explicit special job classes for mixed, bake, sample build/test, and export repair

## Deliverables Checklist

- [ ] Task hierarchy implemented
- [ ] Scheduler policies implemented
- [ ] Resource claim model implemented
- [ ] Recovery logic implemented
- [ ] Mixed job class implemented
- [ ] Bake job class implemented
- [ ] Sample build/test job classes implemented
- [ ] Export repair job class implemented

## Scope

- parallel introduction, not immediate replacement
- isolated validation of queue behavior
- preserve current job-purpose concepts even if implementation changes

## Tests

- scheduler fairness tests
- recovery tests
- cancel/retry tests
- mixed/bake/sample/export-repair tests
- shadow validation where practical

## Verification Checklist

- [ ] Scheduler fairness tests pass
- [ ] Recovery tests pass
- [ ] Cancel/retry tests pass
- [ ] Mixed/bake/sample/export-repair tests pass
- [ ] Shadow validation completed where practical

## Exit Gate

- representative backend flows can run through the 2.0 queue safely behind a flag
