import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyTerminalLifecycleReset, TERMINAL_LIFECYCLE_STATUSES } from '@/utils/jobEventUtils';

// ---------------------------------------------------------------------------
// F9 – applyTerminalLifecycleReset unit tests
// ---------------------------------------------------------------------------

const RUNTIME_FIELDS = [
  'eta_seconds',
  'eta_basis',
  'estimated_end_at',
  'active_segment_id',
  'active_segment_progress',
  'active_segment_eta_seconds',
  'active_segment_eta_basis',
  'active_segment_updated_at',
  'active_render_batch_id',
  'active_render_batch_progress',
] as const;

const makeUpdatesWithRuntimeData = (): Record<string, any> => ({
  status: 'done',
  progress: 1,
  eta_seconds: 10,
  eta_basis: 'remaining_from_update',
  estimated_end_at: 9999,
  active_segment_id: 'seg-1',
  active_segment_progress: 0.5,
  active_segment_eta_seconds: 5,
  active_segment_eta_basis: 'remaining_from_update',
  active_segment_updated_at: 1000,
  active_render_batch_id: 'batch-1',
  active_render_batch_progress: 0.3,
});

describe('applyTerminalLifecycleReset', () => {
  it('nulls all runtime fields for each terminal lifecycle status', () => {
    for (const status of TERMINAL_LIFECYCLE_STATUSES) {
      const updates = makeUpdatesWithRuntimeData();
      updates.status = status;
      applyTerminalLifecycleReset(updates, status);

      expect(updates.eta_seconds).toBeNull();
      expect(updates.eta_basis).toBeNull();
      expect(updates.estimated_end_at).toBeNull();
      expect(updates.active_segment_id).toBeNull();
      expect(updates.active_segment_progress).toBe(0);
      expect(updates.active_segment_eta_seconds).toBeNull();
      expect(updates.active_segment_eta_basis).toBeNull();
      expect(updates.active_segment_updated_at).toBeNull();
      expect(updates.active_render_batch_id).toBeNull();
      expect(updates.active_render_batch_progress).toBeNull();
    }
  });

  it('does not modify updates for a non-terminal status (running)', () => {
    const updates = makeUpdatesWithRuntimeData();
    updates.status = 'running';
    applyTerminalLifecycleReset(updates, 'running');

    // None of the runtime fields should have been reset
    expect(updates.eta_seconds).toBe(10);
    expect(updates.active_segment_id).toBe('seg-1');
    expect(updates.active_segment_progress).toBe(0.5);
  });

  it('does not modify updates when status is undefined', () => {
    const updates = makeUpdatesWithRuntimeData();
    applyTerminalLifecycleReset(updates, undefined);
    expect(updates.eta_seconds).toBe(10);
    expect(updates.active_segment_id).toBe('seg-1');
  });

  it('does not modify updates when status is null', () => {
    const updates = makeUpdatesWithRuntimeData();
    applyTerminalLifecycleReset(updates, null);
    expect(updates.active_render_batch_id).toBe('batch-1');
  });

  it('preserves non-runtime fields after reset', () => {
    const updates = makeUpdatesWithRuntimeData();
    applyTerminalLifecycleReset(updates, 'done');
    expect(updates.progress).toBe(1);
    expect(updates.status).toBe('done');
  });
});

// ---------------------------------------------------------------------------
// F9 integration – both hooks produce identical nulled fields for 'done' event
// ---------------------------------------------------------------------------
// We test the shared helper directly and verify the exact field set it writes
// matches what both hooks relied on, so a divergence would be caught here.

describe('applyTerminalLifecycleReset – field coverage parity', () => {
  it('sets every expected field to the correct sentinel value for done', () => {
    const updates: Record<string, any> = { status: 'done' };
    applyTerminalLifecycleReset(updates, 'done');

    const expected: Record<string, any> = {
      eta_seconds: null,
      eta_basis: null,
      estimated_end_at: null,
      active_segment_id: null,
      active_segment_progress: 0,
      active_segment_eta_seconds: null,
      active_segment_eta_basis: null,
      active_segment_updated_at: null,
      active_render_batch_id: null,
      active_render_batch_progress: null,
    };

    for (const [key, val] of Object.entries(expected)) {
      expect(updates[key], `field ${key}`).toBe(val);
    }
  });
});
