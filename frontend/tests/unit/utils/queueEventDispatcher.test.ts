import { describe, it, expect, vi } from 'vitest';
import { dispatchQueueEvent } from '@/utils/queueEventDispatcher';
import type { LiveEvent } from '@/api/contracts/liveEvents';

// Minimal helper to build a LiveEvent-shaped object for testing.
function makeEvent(overrides: Partial<LiveEvent> = {}): LiveEvent {
  return {
    frameId: 1,
    receivedAt: new Date().toISOString(),
    rawType: 'studio_event',
    topic: 'queue.items',
    category: 'queue',
    eventKind: 'queue_item_status',
    source: 'backend',
    jobId: null,
    projectId: null,
    chapterId: null,
    segmentId: null,
    pluginId: null,
    payload: {},
    ...overrides,
  } as LiveEvent;
}

// Minimal deps — all no-ops unless the test overrides them.
function makeDeps(overrides: Partial<Parameters<typeof dispatchQueueEvent>[2]> = {}) {
  return {
    refreshQueue: vi.fn(),
    applyJobUpdated: vi.fn(),
    pickOverlay: vi.fn((raw) => ({ ...raw })),
    isHydrated: vi.fn(() => true),
    getSnapshotStatus: vi.fn(() => undefined),
    getStoreStatus: vi.fn(() => undefined),
    isKnownInSnapshot: vi.fn(() => false),
    isKnownInStore: vi.fn(() => false),
    updateDerivedState: vi.fn(),
    ...overrides,
  };
}

// ── Topic routing ────────────────────────────────────────────────────────────

describe('dispatchQueueEvent — queue.items invalidated', () => {
  it('triggers refreshQueue("refresh") for queue_item_invalidated', () => {
    const deps = makeDeps();
    const event = makeEvent({ topic: 'queue.items', eventKind: 'queue_item_invalidated' });
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result).toEqual({ action: 'refresh', source: 'refresh' });
    expect(deps.refreshQueue).toHaveBeenCalledWith('refresh');
  });

  it('triggers refreshQueue("refresh") for queue_paused', () => {
    const deps = makeDeps();
    const event = makeEvent({ topic: 'queue.items', eventKind: 'queue_paused' });
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result).toEqual({ action: 'refresh', source: 'refresh' });
    expect(deps.refreshQueue).toHaveBeenCalledWith('refresh');
  });

  it('triggers refreshQueue("refresh") for chapters.lifecycle regardless of jobId', () => {
    const deps = makeDeps();
    const event = makeEvent({ topic: 'chapters.lifecycle', eventKind: 'chapter_lifecycle' });
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result).toEqual({ action: 'refresh', source: 'refresh' });
    expect(deps.refreshQueue).toHaveBeenCalledWith('refresh');
  });
});

describe('dispatchQueueEvent — overlay-only guard (unknown job)', () => {
  it('skips chapters.progress for an unknown job (no row creation)', () => {
    const deps = makeDeps({
      isKnownInSnapshot: vi.fn(() => false),
      isKnownInStore: vi.fn(() => false),
    });
    const event = makeEvent({
      topic: 'chapters.progress',
      eventKind: 'chapter_progress',
      jobId: 'unknown-job',
    });
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result.action).toBe('skipped');
    expect(deps.applyJobUpdated).not.toHaveBeenCalled();
    expect(deps.refreshQueue).not.toHaveBeenCalled();
  });

  it('skips jobs.lifecycle for an unknown job', () => {
    const deps = makeDeps();
    const event = makeEvent({
      topic: 'jobs.lifecycle',
      eventKind: 'job_lifecycle',
      jobId: 'ghost-job',
    });
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result.action).toBe('skipped');
  });

  it('allows chapters.progress for a job known in the store', () => {
    const deps = makeDeps({
      isKnownInSnapshot: vi.fn(() => false),
      isKnownInStore: vi.fn(() => true),
      getStoreStatus: vi.fn(() => 'running'),
    });
    const event = makeEvent({
      topic: 'chapters.progress',
      eventKind: 'chapter_progress',
      jobId: 'store-job',
      payload: { progress: 0.5, etaSeconds: 10 },
    } as any);
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result.action).toBe('overlay');
    expect(deps.applyJobUpdated).toHaveBeenCalledWith('store-job', expect.any(Object));
  });
});

describe('dispatchQueueEvent — queue.items authority (creates row)', () => {
  it('calls applyJobUpdated for queue.items even for an unknown job', () => {
    const deps = makeDeps({
      isKnownInSnapshot: vi.fn(() => false),
      isKnownInStore: vi.fn(() => false),
    });
    const event = makeEvent({
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      jobId: 'new-job',
      payload: { status: 'queued', progress: 0, classification: 'chapter' },
    } as any);
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result.action).toBe('overlay');
    expect(deps.applyJobUpdated).toHaveBeenCalledWith('new-job', expect.any(Object));
    expect(deps.updateDerivedState).toHaveBeenCalled();
  });
});

describe('dispatchQueueEvent — terminal refetch', () => {
  it('triggers refreshQueue("terminal") for a terminal jobs.lifecycle frame', () => {
    const deps = makeDeps({
      isKnownInSnapshot: vi.fn(() => true),
      getSnapshotStatus: vi.fn(() => 'running'),
    });
    // adaptEventToJobUpdates reads payload.status; provide it via the event payload
    const event = makeEvent({
      topic: 'jobs.lifecycle',
      eventKind: 'job_lifecycle',
      jobId: 'job-1',
      payload: { status: 'done', reasonCode: null },
    } as any);
    const result = dispatchQueueEvent(event, { status: 'done' }, deps);
    expect(result).toEqual({ action: 'refresh', source: 'terminal' });
    expect(deps.refreshQueue).toHaveBeenCalledWith('terminal');
  });

  it('triggers refreshQueue("refresh") when QUEUE_INVALIDATED reasonCode on jobs.lifecycle', () => {
    const deps = makeDeps({
      isKnownInSnapshot: vi.fn(() => true),
      getSnapshotStatus: vi.fn(() => 'running'),
    });
    const event = makeEvent({
      topic: 'jobs.lifecycle',
      eventKind: 'job_lifecycle',
      jobId: 'job-invalidated',
      payload: { status: 'running', reasonCode: 'QUEUE_INVALIDATED' },
    } as any);
    const result = dispatchQueueEvent(event, { reasonCode: 'QUEUE_INVALIDATED' }, deps);
    expect(result).toEqual({ action: 'refresh', source: 'refresh' });
    expect(deps.refreshQueue).toHaveBeenCalledWith('refresh');
  });

  it('does NOT refetch for a non-terminal jobs.lifecycle frame', () => {
    const deps = makeDeps({
      isKnownInSnapshot: vi.fn(() => true),
      getSnapshotStatus: vi.fn(() => 'running'),
    });
    const event = makeEvent({
      topic: 'jobs.lifecycle',
      eventKind: 'job_lifecycle',
      jobId: 'job-running',
      payload: { status: 'running' },
    } as any);
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result.action).toBe('overlay');
    expect(deps.refreshQueue).not.toHaveBeenCalled();
  });
});

describe('dispatchQueueEvent — unhandled topics', () => {
  it('returns unhandled for an unrecognized topic with no jobId', () => {
    const deps = makeDeps();
    const event = makeEvent({ topic: 'tts.logs', eventKind: 'tts_log', jobId: null });
    const result = dispatchQueueEvent(event, {}, deps);
    expect(result.action).toBe('unhandled');
    expect(deps.applyJobUpdated).not.toHaveBeenCalled();
    expect(deps.refreshQueue).not.toHaveBeenCalled();
  });
});
