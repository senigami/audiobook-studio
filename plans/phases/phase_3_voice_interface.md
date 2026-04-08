# Phase 3: Voice Interface And Preview/Test Flows

## Objective

Move engine behavior behind the new voice contract while preserving current capabilities and purpose.

## Deliverables

- engine base contract
- engine registry
- voice bridge
- XTTS wrapper
- Voxtral wrapper
- preview/test flow contract
- module readiness and health model

## Deliverables Checklist

- [ ] Engine base contract implemented
- [ ] Engine registry implemented
- [ ] Voice bridge implemented
- [ ] XTTS wrapped behind the new contract
- [ ] Voxtral wrapped behind the new contract
- [ ] Preview/test flow contract implemented
- [ ] Module readiness and health model implemented

## Scope

- preserve current synthesis capability
- preserve preview/test concept
- no full queue cutover yet

## Tests

- mock engine tests
- wrapper contract tests
- preflight validation tests
- preview/test isolated tests

## Verification Checklist

- [ ] Mock engine tests pass
- [ ] Wrapper contract tests pass
- [ ] Preflight validation tests pass
- [ ] Preview/test isolated tests pass

## Exit Gate

- synthesis and preview/test logic can be reasoned about through the new voice boundary
