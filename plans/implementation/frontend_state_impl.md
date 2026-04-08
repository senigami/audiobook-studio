# Implementation Blueprint: Frontend Communication & State (Studio 2.0)

This is the frontend state model I want us to implement.

## 1. State Ownership

### Canonical Entity State

Owned by API-backed queries and feature data hooks:

- projects
- chapters
- blocks
- voice profiles
- settings

### Live Overlay State

Owned by the store:

- active job progress
- queue waiting reasons
- reconnect status
- recovered-job markers
- transient notifications
- smoothed live progress presentation state where needed for stable UX

### Local Editor Session State

Owned by the store or feature-local session layer:

- selected block ids
- pending local edits
- draft dirty state
- panel visibility
- playback selection

## 2. Files I Want To Create

- `frontend/src/store/live-jobs.ts`
- `frontend/src/store/editor-session.ts`
- `frontend/src/api/contracts/events.ts`
- `frontend/src/api/hydration/reconnect.ts`

## 3. Merge Procedure

1. Load canonical entity state from the API.
2. Load or reconnect the live overlay state.
3. Overlay progress, queue status, and waiting reasons without mutating canonical entities.
4. Merge local editor draft state last so in-progress edits are protected.

## 3.1 Anti-Regression Rules

The current product already protects users from noisy live-state regressions. Studio 2.0 should preserve that behavior intentionally.

- do not let stale socket events regress active status casually
- do not let active progress move backward unless the server explicitly indicates reset/retry/revision invalidation
- keep established run timing stable unless the job actually restarted
- coalesce tiny ETA changes that only create visual churn

## 4. Reconnect Procedure

1. Detect socket reconnect.
2. Rehydrate visible route entities plus active jobs via REST.
3. Resume socket updates.
4. Clear stale overlay state that no longer matches canonical entities.

## 5. UX Requirements

- Every feature must define loading, empty, error, reconnecting, and recovered states.
- Queue state must remain server-confirmed.
- Only reversible local edits should appear optimistic.
- Predictive progress smoothing is allowed only as a presentation layer over authoritative backend state.

## 6. Testing Plan

- store merge tests
- reconnect hydration tests
- editor-draft protection tests
- component tests for waiting and failure reasons
