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
      topic: 'jobs.progress',
      category: 'segment',
      eventKind: 'segment_started',
      segmentId: 'segment-1',
      payload: {
        active_segment_id: 'segment-1',
        active_segment_progress: undefined,
      },
    });
    expect(segmentProgress).toMatchObject({
      topic: 'jobs.progress',
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
      topic: 'jobs.progress',
      category: 'job',
      eventKind: 'job_terminal',
      segmentId: null,
      payload: {
        status: 'done',
        progress: 1,
        active_segment_id: null,
        active_segment_progress: 0,
      },
    });
  });

  it('preserves unknown frames as system.unknown audit events', () => {
    const event = normalizeStudioSocketEnvelope(envelope({
      type: 'new_backend_event',
      custom: true,
    }, 5));

    expect(event).toMatchObject({
      frameId: 5,
      rawType: 'new_backend_event',
      topic: 'system.unknown',
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
});
