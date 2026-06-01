import { describe, it, expect } from 'vitest';
import { createHydrationCoordinator, selectActiveQueueCount } from '@/api/hydration/index';
import type { ProcessingQueueItem } from '@/types';
import type { LiveOverlayState } from '@/store/live-jobs';

describe('HydrationCoordinator', () => {
  const coordinator = createHydrationCoordinator();

  it('creates a snapshot with second-based timestamps (P1 Fix Check)', () => {
    const items: ProcessingQueueItem[] = [{ id: '1', status: 'queued' } as any];
    const before = Date.now() / 1000;
    const snapshot = coordinator.createSnapshot(items, 'bootstrap');
    const after = Date.now() / 1000;
    
    expect(snapshot.items).toEqual(items);
    expect(snapshot.hydratedAtSeconds).toBeGreaterThanOrEqual(before);
    expect(snapshot.hydratedAtSeconds).toBeLessThanOrEqual(after);
    // Ensure it's not in milliseconds (milliseconds would be ~1000x larger)
    expect(snapshot.hydratedAtSeconds).toBeLessThan(2000000000); 
  });

  it('captures hydration source metadata in snapshots', () => {
    const items: ProcessingQueueItem[] = [];
    const bootstrap = coordinator.createSnapshot(items, 'bootstrap');
    expect(bootstrap.source).toBe('bootstrap');

    const reconnect = coordinator.createSnapshot(items, 'reconnect');
    expect(reconnect.source).toBe('reconnect');

    const refresh = coordinator.createSnapshot(items, 'refresh');
    expect(refresh.source).toBe('refresh');
  });

  it('merges overlays into queue items (Stability Check)', () => {
    const snapshot = coordinator.createSnapshot([
      { id: 'job1', status: 'queued', progress: 0 } as any,
      { id: 'job2', status: 'running', progress: 0.1 } as any,
    ]);

    const overlays: LiveOverlayState = {
      eventsById: {
        job1: {
          status: 'running',
          progress: 0.5,
          updated_at: 1000,
          render_group_count: 3,
          completed_render_groups: 1,
          active_render_group_index: 2,
          total_render_weight: 100,
          completed_render_weight: 40,
          active_render_group_weight: 20,
          grouped_progress: 0.5,
        },
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged[0].status).toBe('running');
    expect(merged[0].progress).toBe(0.5);
    expect(merged[0]).toMatchObject({
      render_group_count: 3,
      completed_render_groups: 1,
      active_render_group_index: 2,
      total_render_weight: 100,
      completed_render_weight: 40,
      active_render_group_weight: 20,
      grouped_progress: 0.5,
    });
    expect(merged[1].status).toBe('running');
    expect(merged[1].progress).toBe(0.1);
  });

  it('hydrates a live queue item from overlay data before the snapshot refresh arrives', () => {
    const snapshot = coordinator.createSnapshot([]);

    const overlays: LiveOverlayState = {
      eventsById: {
        job1: {
          project_id: 'proj-1',
          chapter_id: 'chap-1',
          engine: 'xtts',
          custom_title: 'Chapter 1',
          status: 'queued',
          progress: 0,
          updated_at: 1000,
          created_at: 900,
          render_group_count: 2,
          completed_render_groups: 1,
          active_render_group_index: 1,
          total_render_weight: 50,
          completed_render_weight: 25,
          active_render_group_weight: 25,
          grouped_progress: 0.5,
        }
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('job1');
    expect(merged[0].chapter_id).toBe('chap-1');
    expect(merged[0].project_id).toBe('proj-1');
    expect(merged[0].status).toBe('queued');
    expect(merged[0]).toMatchObject({
      render_group_count: 2,
      completed_render_groups: 1,
      active_render_group_index: 1,
      total_render_weight: 50,
      completed_render_weight: 25,
      active_render_group_weight: 25,
      grouped_progress: 0.5,
    });
  });

  it('filters segment-classified overlay jobs out of the chapter queue', () => {
    const snapshot = coordinator.createSnapshot([]);

    const overlays: LiveOverlayState = {
      eventsById: {
        job1: {
          project_id: 'proj-1',
          chapter_id: 'chap-1',
          engine: 'xtts',
          custom_title: 'Chapter 1',
          classification: 'segment',
          status: 'running',
          progress: 0.25,
          updated_at: 1000,
          created_at: 900,
        }
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged).toHaveLength(0);
    expect(selectActiveQueueCount(merged)).toBe(0);
  });

  it('keeps segment-capable chapter jobs visible in the main queue', () => {
    const snapshot = coordinator.createSnapshot([
      {
        id: 'job-segment-capable-chapter',
        project_id: 'proj-1',
        chapter_id: 'chap-1',
        status: 'running',
        progress: 0.2,
        has_segment_support: true,
        classification: 'chapter',
      } as any,
    ]);

    const merged = coordinator.mergeQueueWithOverlays(snapshot, { eventsById: {} });
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('job-segment-capable-chapter');
    expect(selectActiveQueueCount(merged)).toBe(1);
  });

  it('hydrates a segment-capable chapter queue item from live overlay data', () => {
    const snapshot = coordinator.createSnapshot([]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-live-segment-capable': {
          project_id: 'proj-1',
          chapter_id: 'chap-1',
          classification: 'chapter',
          status: 'running',
          progress: 0,
          updated_at: 1000,
          created_at: 900,
        },
      },
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('job-live-segment-capable');
    expect(merged[0].status).toBe('running');
  });

  it('keeps a recent terminal overlay visible long enough for queue history', () => {
    const now = 1713210000;
    const snapshot = coordinator.createSnapshot([]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-terminal-overlay': {
          project_id: 'proj-1',
          chapter_id: 'chap-1',
          classification: 'chapter',
          status: 'done',
          progress: 1,
          updated_at: now - 3,
          completed_at: now - 3,
        },
      },
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays, now * 1000);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('job-terminal-overlay');
    expect(merged[0].status).toBe('done');
  });

  it('does not keep stale terminal overlays after the history handoff window', () => {
    const now = 1713210000;
    const snapshot = coordinator.createSnapshot([]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-stale-terminal-overlay': {
          project_id: 'proj-1',
          chapter_id: 'chap-1',
          classification: 'chapter',
          status: 'done',
          progress: 1,
          updated_at: now - 60,
          completed_at: now - 60,
        },
      },
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays, now * 1000);
    expect(merged).toHaveLength(0);
  });

  it('stays stable when thinner live data arrives (Merge Rule Check)', () => {
    const snapshot = coordinator.createSnapshot([
      { id: 'job1', status: 'running', progress: 0.5, eta_seconds: 30 } as any
    ]);

    // Thinner data: just progress, no ETA
    const overlays: LiveOverlayState = {
      eventsById: {
        job1: { progress: 0.6, updated_at: 2000 }
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged[0].progress).toBe(0.6);
    expect(merged[0].status).toBe('running');
    expect(merged[0].eta_seconds).toBe(30); // Preserved from snapshot
  });

  it('applies finalizing hold for indeterminate cloud jobs (Heuristic Check)', () => {
    const now = 1713210000; // Seconds
    const snapshot = coordinator.createSnapshot([
      { 
        id: 'job-cloud',
        status: 'done',
        engine: 'mixed',
        chapter_id: 'chap1',
        completed_at: now - 5,
        chapter_audio_status: 'processing'
      } as any
    ]);

    const merged = coordinator.mergeQueueWithOverlays(snapshot, { eventsById: {} }, now * 1000);
    expect(merged[0].status).toBe('finalizing');
    expect(merged[0].progress).toBe(1.0);
  });

  it('counts active jobs correctly', () => {
    const queue: ProcessingQueueItem[] = [
      { status: 'running' } as any,
      { status: 'queued' } as any,
      { status: 'done' } as any,
      { status: 'finalizing' } as any,
    ];
    expect(selectActiveQueueCount(queue)).toBe(3);
  });

  it('propagates active_segment_id and active_segment_progress from overlay to merged item', () => {
    // Regression: mergeQueueWithOverlays was not forwarding active_segment_id or
    // active_segment_progress from the live overlay delta into the merged queue item,
    // causing QueueItem to always receive undefined for these fields and fall back to
    // displaying job.progress (the snapshot value) instead of the live segment progress.
    const snapshot = coordinator.createSnapshot([
      {
        id: 'job-seg',
        status: 'running',
        progress: 0,
        chapter_id: 'chap-1',
        active_segment_id: undefined,
        active_segment_progress: undefined,
      } as any,
    ]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-seg': {
          status: 'running',
          progress: 0.44,
          updated_at: Date.now() / 1000,
          active_segment_id: 'seg-abc',
          active_segment_progress: 0.8,
        },
      },
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged[0].active_segment_id).toBe('seg-abc');
    expect(merged[0].active_segment_progress).toBe(0.8);
  });

  it('does not filter out a chapter job if segment_ids is present but overlay specifies classification: chapter', () => {
    const snapshot = coordinator.createSnapshot([
      {
        id: 'job-chapter-with-segs',
        status: 'running',
        chapter_id: 'chap-1',
        segment_ids: ['seg-1', 'seg-2'],
        classification: undefined,
      } as any,
    ]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-chapter-with-segs': {
          status: 'running',
          classification: 'chapter',
          updated_at: Date.now() / 1000,
        },
      },
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('job-chapter-with-segs');
  });

  it('does not resurrect progress from snapshot when merged status is queued or preparing', () => {
    const snapshot = coordinator.createSnapshot([
      { id: 'job-requeued', status: 'running', progress: 0.75 } as any
    ]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-requeued': {
          status: 'queued',
          progress: 0,
          updated_at: Date.now() / 1000,
        }
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged[0].status).toBe('queued');
    expect(merged[0].progress).toBe(0); // Forced to 0, not Math.max(0, 0.75)
  });

  it('preserves eta_updated_at in hydration merge', () => {
    const snapshot = coordinator.createSnapshot([
      { id: 'job-eta', status: 'running', progress: 0.2, eta_seconds: 30, eta_updated_at: 1000 } as any
    ]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-eta': {
          status: 'running',
          progress: 0.3,
          eta_seconds: 25,
          eta_updated_at: 1010,
          updated_at: 1010,
        }
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged[0].eta_updated_at).toBe(1010);
  });

  it('clears eta_updated_at when the overlay clears eta_seconds', () => {
    const snapshot = coordinator.createSnapshot([
      { id: 'job-eta-clear', status: 'running', progress: 0.9, eta_seconds: 5, eta_updated_at: 1000 } as any
    ]);

    const overlays: LiveOverlayState = {
      eventsById: {
        'job-eta-clear': {
          status: 'running',
          progress: 0.9,
          eta_seconds: null,
          eta_updated_at: 1005,
          updated_at: 1005,
        }
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged[0].eta_seconds).toBeUndefined();
    expect(merged[0].eta_updated_at).toBeUndefined();
  });
});
