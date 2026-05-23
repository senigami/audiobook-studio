import { describe, expect, it } from 'vitest';
import {
  appendLiveEventSubscriber,
  normalizeStudioSocketEnvelope,
  type LiveEventRecord,
  type StudioSocketEnvelope,
} from '@/api/contracts/liveEvents';

const envelope = <T,>(data: T, frameId = 1): StudioSocketEnvelope<T> => ({
  frameId,
  receivedAt: `2026-05-21T12:00:${String(frameId).padStart(2, '0')}.000Z`,
  data,
  raw: JSON.stringify(data),
});

describe('live event contract', () => {
  it('preserves unknown frames as system.events audit events', () => {
    const event = normalizeStudioSocketEnvelope(envelope({
      type: 'new_backend_event',
      custom: true,
    }, 5));

    expect(event).toMatchObject({
      frameId: 5,
      rawType: 'new_backend_event',
      topic: 'system.events',
      category: 'system',
      eventKind: 'unknown',
      payload: {
        type: 'new_backend_event',
        custom: true,
      },
    });
  });

  it('dedupes subscriber observations by frame and subscriber', () => {
    const record: LiveEventRecord = {
      event: normalizeStudioSocketEnvelope(envelope({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_invalidated',
        source: 'backend',
        emittedAt: 1234567,
        pluginId: null,
        ids: { projectId: null, chapterId: null, jobId: null, segmentId: null },
        payload: { reason: 'test', changedFields: [] }
      }, 6)),
      subscribers: [],
    };

    appendLiveEventSubscriber(record, 'queue-sync', 'handled', 'hydrated queue');
    appendLiveEventSubscriber(record, 'queue-sync', 'handled', 'duplicate ignored');
    appendLiveEventSubscriber(record, 'live-output', 'recorded');

    expect(record.subscribers).toEqual([
      expect.objectContaining({
        subscriber: 'queue-sync',
        action: 'handled',
        detail: 'hydrated queue',
      }),
      expect.objectContaining({
        subscriber: 'live-output',
        action: 'recorded',
      }),
    ]);
  });

  describe('canonical studio_event normalization', () => {
    it('passes through canonical studio_event envelopes unaltered', () => {
      const canonicalEvent = {
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        source: 'backend.source',
        emittedAt: 1779486175.62,
        pluginId: null,
        ids: {
          projectId: 'project-1',
          chapterId: 'chapter-1',
          jobId: 'job-1',
          segmentId: null,
        },
        payload: {
          status: 'running',
          progress: 0.5,
          etaSeconds: 60,
          message: 'active',
          reasonCode: 'ok',
          classification: 'job',
          changedFields: null,
        },
      };

      const event = normalizeStudioSocketEnvelope(envelope(canonicalEvent));

      expect(event).toMatchObject({
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        projectId: 'project-1',
        chapterId: 'chapter-1',
        jobId: 'job-1',
        segmentId: null,
        payload: canonicalEvent.payload,
      });
    });

    it('handles plugin-private namespaced topics', () => {
      const canonicalEvent = {
        type: 'studio_event',
        version: 1,
        topic: 'plugins.tts_xtts.synthesis',
        eventKind: 'custom_metric',
        source: 'backend.source',
        emittedAt: 1779486175.62,
        pluginId: 'tts_xtts',
        ids: {
          projectId: 'project-1',
          chapterId: null,
          jobId: null,
          segmentId: null,
        },
        payload: {
          customValue: 42,
        },
      };

      const event = normalizeStudioSocketEnvelope(envelope(canonicalEvent));

      expect(event).toMatchObject({
        topic: 'plugins.tts_xtts.synthesis',
        eventKind: 'custom_metric',
        pluginId: 'tts_xtts',
        payload: canonicalEvent.payload,
      });
    });

    it('handles canonical studio_event envelope for chapters.progress', () => {
      const canonicalEvent = {
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        source: 'backend.source',
        emittedAt: 1779486175.62,
        pluginId: null,
        ids: {
          projectId: 'project-1',
          chapterId: 'chapter-1',
          jobId: 'job-1',
          segmentId: null,
        },
        payload: {
          status: 'running',
          progress: 0.75,
          groupedProgress: 0.5,
          etaSeconds: 120,
          message: 'Rendering chapter',
          reasonCode: null,
          renderGroupCount: 10,
          completedRenderGroups: 5,
        },
      };

      const event = normalizeStudioSocketEnvelope(envelope(canonicalEvent));

      expect(event).toMatchObject({
        topic: 'chapters.progress',
        category: 'chapter',
        eventKind: 'chapter_progress',
        projectId: 'project-1',
        chapterId: 'chapter-1',
        jobId: 'job-1',
        payload: canonicalEvent.payload,
      });
    });

    it('handles canonical studio_event envelope for segments.progress', () => {
      const canonicalEvent = {
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        source: 'backend.source',
        emittedAt: 1779486175.62,
        pluginId: null,
        ids: {
          projectId: 'project-1',
          chapterId: 'chapter-1',
          jobId: 'job-1',
          segmentId: 'segment-1',
        },
        payload: {
          status: 'running',
          progress: 0.3,
          segmentIndex: 2,
          segmentCount: 5,
          message: 'Synthesizing...',
          reasonCode: null,
        },
      };

      const event = normalizeStudioSocketEnvelope(envelope(canonicalEvent));

      expect(event).toMatchObject({
        topic: 'segments.progress',
        category: 'segment',
        eventKind: 'segment_progress',
        projectId: 'project-1',
        chapterId: 'chapter-1',
        jobId: 'job-1',
        segmentId: 'segment-1',
        payload: canonicalEvent.payload,
      });
    });

    it('handles canonical studio_event envelope for tts.logs', () => {
      const canonicalEvent = {
        type: 'studio_event',
        version: 1,
        topic: 'tts.logs',
        eventKind: 'tts_log',
        source: 'backend.source',
        emittedAt: 1779486175.62,
        pluginId: 'tts_xtts',
        ids: {
          projectId: 'project-1',
          chapterId: 'chapter-1',
          jobId: 'job-1',
          segmentId: null,
        },
        payload: {
          line: 'Engine initialization done',
          level: 'INFO',
          sequence: 12,
          pluginId: 'tts_xtts',
          jobId: 'job-1',
          chapterId: 'chapter-1',
          source: 'backend.source',
        },
      };

      const event = normalizeStudioSocketEnvelope(envelope(canonicalEvent));

      expect(event).toMatchObject({
        topic: 'tts.logs',
        category: 'log',
        eventKind: 'tts_log',
        projectId: 'project-1',
        chapterId: 'chapter-1',
        jobId: 'job-1',
        payload: canonicalEvent.payload,
      });
    });

    it('handles canonical studio_event envelope for projects.lifecycle', () => {
      const canonicalEvent = {
        type: 'studio_event',
        version: 1,
        topic: 'projects.lifecycle',
        eventKind: 'project_invalidated',
        source: 'backend.source',
        emittedAt: 1779486175.62,
        pluginId: null,
        ids: {
          projectId: 'project-1',
          chapterId: null,
          jobId: 'job-1',
          segmentId: null,
        },
        payload: {
          reason: 'project_membership_change',
          changedFields: ['status'],
        },
      };

      const event = normalizeStudioSocketEnvelope(envelope(canonicalEvent));

      expect(event).toMatchObject({
        topic: 'projects.lifecycle',
        category: 'project',
        eventKind: 'project_invalidated',
        projectId: 'project-1',
        jobId: 'job-1',
        payload: canonicalEvent.payload,
      });
    });
  });


});
