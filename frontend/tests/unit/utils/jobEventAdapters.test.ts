import { describe, it, expect } from 'vitest';
import { adaptEventToJobUpdates, copyRenderGroupFields } from '@/utils/jobEventAdapters';
import { pickOverlayFields } from '@/utils/queueOverlayFields';

describe('jobEventAdapters — active_segments_map (W-PAR 006)', () => {
  it('extracts active_segments_map from a chapter progress payload into the job updates', () => {
    const event = {
      topic: 'chapters.progress',
      jobId: 'job-1',
      projectId: 'proj-1',
      chapterId: 'chap-1',
      payload: {
        status: 'running',
        progress: 0.5,
        active_segments_map: {
          S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 },
          S2: { phase: 'preparing', progress: 0, eta_seconds: null, indeterminate: true },
        },
      },
    };

    const updates = adaptEventToJobUpdates(event);

    expect(updates.active_segments_map).toEqual({
      S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 },
      S2: { phase: 'preparing', progress: 0, eta_seconds: null, indeterminate: true },
    });
  });

  it('passes active_segments_map through the QUEUE_OVERLAY_FIELDS whitelist', () => {
    const rawUpdates = {
      progress: 0.5,
      active_segments_map: {
        S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 },
      },
      some_unrelated_field: 'should not survive',
    };

    const picked = pickOverlayFields(rawUpdates);

    expect(picked.active_segments_map).toEqual({
      S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 },
    });
    expect(picked.some_unrelated_field).toBeUndefined();
  });

  it('copyRenderGroupFields carries active_segments_map unless excludeSegmentFields is set', () => {
    const source = {
      active_segments_map: { S1: { phase: 'rendering', progress: 0.3, eta_seconds: 10 } },
    };

    const target: Record<string, any> = {};
    copyRenderGroupFields(target, source);
    expect(target.active_segments_map).toEqual(source.active_segments_map);

    const excludedTarget: Record<string, any> = {};
    copyRenderGroupFields(excludedTarget, source, true);
    expect(excludedTarget.active_segments_map).toBeUndefined();
  });
});
