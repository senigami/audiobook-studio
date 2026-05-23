import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
} from '@/store/studioSocketBus';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';
import { subscribeToLiveEventTopics } from '@/store/liveEventTopicRouter';

describe('liveEventTopicRouter', () => {
  beforeEach(() => {
    resetStudioSocketBusForTests();
    resetLiveEventAuditForTests();
  });

  it('dispatches a chapters.progress frame only to the chapters.progress handler', () => {
    const onChapter = vi.fn();
    const onSegment = vi.fn();
    subscribeToLiveEventTopics({
      'chapters.progress': onChapter,
      'segments.progress': onSegment,
    });

    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'chapters.progress',
      eventKind: 'chapter_progress',
      ids: { chapterId: 'chap-1' },
      payload: { status: 'running', progress: 0.5 },
    });

    expect(onChapter).toHaveBeenCalledTimes(1);
    expect(onSegment).not.toHaveBeenCalled();

    const [event, context] = onChapter.mock.calls[0];
    expect(event.topic).toBe('chapters.progress');
    expect(context.rawData.topic).toBe('chapters.progress');
  });

  it('dispatches a segments.progress frame only to the segments.progress handler', () => {
    const onChapter = vi.fn();
    const onSegment = vi.fn();
    subscribeToLiveEventTopics({
      'chapters.progress': onChapter,
      'segments.progress': onSegment,
    });

    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'segments.progress',
      eventKind: 'segment_progress',
      ids: { segmentId: 'seg-1' },
      payload: { status: 'running', progress: 0.3 },
    });

    expect(onSegment).toHaveBeenCalledTimes(1);
    expect(onChapter).not.toHaveBeenCalled();

    const [event] = onSegment.mock.calls[0];
    expect(event.topic).toBe('segments.progress');
  });

  it('dispatches a queue.items frame only to the queue.items handler', () => {
    const onQueue = vi.fn();
    const onChapter = vi.fn();
    subscribeToLiveEventTopics({
      'queue.items': onQueue,
      'chapters.progress': onChapter,
    });

    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'queue.items',
      eventKind: 'queue_item_status',
      payload: { status: 'running', progress: 0.4 },
    });

    expect(onQueue).toHaveBeenCalledTimes(1);
    expect(onChapter).not.toHaveBeenCalled();
  });

  it('does not route segments.progress to jobs.progress handler after compatibility shim removal', () => {
    const handler = vi.fn();
    subscribeToLiveEventTopics({ 'jobs.progress': handler } as any);

    publishStudioSocketMessage({
      type: 'segment_progress',
      job_id: 'job-1',
      segment_id: 'seg-1',
      progress: 0.5,
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not route queue.items to queue.lifecycle handler after compatibility shim removal', () => {
    const handler = vi.fn();
    subscribeToLiveEventTopics({ 'queue.lifecycle': handler } as any);

    publishStudioSocketMessage({
      type: 'queue_updated',
      reason: 'test',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe that detaches the topic handlers', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToLiveEventTopics({ 'chapters.progress': handler });

    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'chapters.progress',
      eventKind: 'chapter_progress',
      payload: { status: 'running', progress: 0.5 },
    });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic: 'chapters.progress',
      eventKind: 'chapter_progress',
      payload: { status: 'running', progress: 0.6 },
    });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
