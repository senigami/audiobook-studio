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
        job1: { status: 'running', progress: 0.5, updated_at: 1000 },
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged[0].status).toBe('running');
    expect(merged[0].progress).toBe(0.5);
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
        }
      }
    };

    const merged = coordinator.mergeQueueWithOverlays(snapshot, overlays);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('job1');
    expect(merged[0].chapter_id).toBe('chap-1');
    expect(merged[0].project_id).toBe('proj-1');
    expect(merged[0].status).toBe('queued');
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
});
