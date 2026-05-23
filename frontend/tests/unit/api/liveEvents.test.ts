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
  it('normalizes TTS log frames to the tts.logs topic', () => {
    const event = normalizeStudioSocketEnvelope(envelope({
      type: 'tts_log_line',
      job_id: 'job-1',
      project_id: 'project-1',
      chapter_id: 'chapter-1',
      line: 'Loading model...',
      marker: 'raw',
      sequence: 2,
      received_at: 1779396535.09,
      source: 'app.orchestration.scheduler.orchestrator_helpers.log_listener',
    }));

    expect(event).toMatchObject({
      frameId: 1,
      rawType: 'tts_log_line',
      topic: 'tts.logs',
      category: 'log',
      eventKind: 'tts_log',
      jobId: 'job-1',
      projectId: 'project-1',
      chapterId: 'chapter-1',
      payload: {
        line: 'Loading model...',
        marker: 'raw',
        sequence: 2,
        backendReceivedAt: 1779396535.09,
      },
    });
  });

  it('distinguishes segment start from segment progress', () => {
    const segmentStart = normalizeStudioSocketEnvelope(envelope({
      type: 'studio_job_event',
      job_id: 'job-1',
      status: 'running',
      active_segment_id: 'segment-1',
      progress: 0.1,
      reason_code: 'segment_start',
    }, 2));

    const segmentProgress = normalizeStudioSocketEnvelope(envelope({
      type: 'studio_job_event',
      job_id: 'job-1',
      status: 'running',
      active_segment_id: 'segment-1',
      active_segment_progress: 0.4,
      progress: 0.2,
      reason_code: 'synthesis_progress',
    }, 3));

    expect(segmentStart).toMatchObject({
      topic: 'segments.progress',
      category: 'segment',
      eventKind: 'segment_started',
      segmentId: 'segment-1',
      payload: {
        active_segment_id: 'segment-1',
        active_segment_progress: undefined,
      },
    });
    expect(segmentProgress).toMatchObject({
      topic: 'segments.progress',
      category: 'segment',
      eventKind: 'segment_progress',
      segmentId: 'segment-1',
      payload: {
        active_segment_id: 'segment-1',
        active_segment_progress: 0.4,
      },
    });
  });

  it('normalizes terminal job frames without treating cleared segment progress as active progress', () => {
    const event = normalizeStudioSocketEnvelope(envelope({
      type: 'job_updated',
      job_id: 'job-1',
      status: 'done',
      progress: 1,
      active_segment_id: null,
      active_segment_progress: 0,
    }, 4));

    expect(event).toMatchObject({
      topic: 'queue.items',
      category: 'queue',
      eventKind: 'queue_item_status',
      segmentId: null,
      payload: {
        status: 'done',
        progress: 1,
        active_segment_id: null,
        active_segment_progress: 0,
      },
    });
  });

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
      event: normalizeStudioSocketEnvelope(envelope({ type: 'queue_updated' }, 6)),
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

  describe('legacy to canonical topic mapping', () => {
    it('maps legacy project_updated to projects.lifecycle', () => {
      const projEv = normalizeStudioSocketEnvelope(envelope({
        type: 'project_updated',
        project_id: 'project-1',
        reason: 'update',
        changed_fields: ['title'],
      }));
      expect(projEv.topic).toBe('projects.lifecycle');
      expect(projEv.category).toBe('project');
      expect(projEv.eventKind).toBe('project_invalidated');
      expect(projEv.projectId).toBe('project-1');
      expect(projEv.payload).toMatchObject({
        reason: 'update',
        changedFields: ['title'],
      });
    });

    it('maps legacy queue_updated and pause_updated to queue.items', () => {
      const queueEv = normalizeStudioSocketEnvelope(envelope({
        type: 'queue_updated',
        reason: 'job_status_change',
        changed_fields: ['status'],
      }));
      expect(queueEv.topic).toBe('queue.items');

      const pauseEv = normalizeStudioSocketEnvelope(envelope({
        type: 'pause_updated',
        paused: true,
      }));
      expect(pauseEv.topic).toBe('queue.items');
    });

    it('maps legacy chapter_updated to chapters.lifecycle', () => {
      const chapEv = normalizeStudioSocketEnvelope(envelope({
        type: 'chapter_updated',
        chapter_id: 'chap-123',
        reason: 'edit',
      }));
      expect(chapEv.topic).toBe('chapters.lifecycle');
    });

    it('maps legacy segments_updated to segments.lifecycle', () => {
      const segEv = normalizeStudioSocketEnvelope(envelope({
        type: 'segments_updated',
        chapter_id: 'chap-123',
        reason: 'rebuild',
      }));
      expect(segEv.topic).toBe('segments.lifecycle');
    });

    it('maps legacy tts_log_line to tts.logs and test_progress to voice.test', () => {
      const logEv = normalizeStudioSocketEnvelope(envelope({
        type: 'tts_log_line',
        line: 'log line',
      }));
      expect(logEv.topic).toBe('tts.logs');

      const testEv = normalizeStudioSocketEnvelope(envelope({
        type: 'test_progress',
        name: 'voice-a',
        progress: 0.5,
      }));
      expect(testEv.topic).toBe('voice.test');
    });

    it('maps legacy jobs events to chapters.progress, segments.progress or queue.items', () => {
      // 1. segment classification -> segments.progress
      const segProg = normalizeStudioSocketEnvelope(envelope({
        type: 'studio_job_event',
        job_id: 'job-1',
        status: 'running',
        classification: 'segment',
        active_segment_id: 'seg-1',
        active_segment_progress: 0.5,
      }));
      expect(segProg.topic).toBe('segments.progress');

      // 2. chapter classification -> chapters.progress
      const chapProg = normalizeStudioSocketEnvelope(envelope({
        type: 'studio_job_event',
        job_id: 'job-1',
        status: 'running',
        classification: 'chapter',
      }));
      expect(chapProg.topic).toBe('chapters.progress');

      // 3. job classification -> queue.items
      const jobProg = normalizeStudioSocketEnvelope(envelope({
        type: 'studio_job_event',
        job_id: 'job-1',
        status: 'running',
        classification: 'job',
      }));
      expect(jobProg.topic).toBe('queue.items');
    });
  });
});
