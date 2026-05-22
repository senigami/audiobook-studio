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

  it('dispatches a jobs.progress frame only to the jobs.progress handler', () => {
    const onJobs = vi.fn();
    const onQueue = vi.fn();
    subscribeToLiveEventTopics({
      'jobs.progress': onJobs,
      'queue.lifecycle': onQueue,
    });

    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'j1', status: 'running', progress: 0.4 });

    expect(onJobs).toHaveBeenCalledTimes(1);
    expect(onQueue).not.toHaveBeenCalled();

    const [event, context] = onJobs.mock.calls[0];
    expect(event.topic).toBe('jobs.progress');
    expect(event.rawType).toBe('studio_job_event');
    expect(context.rawData).toMatchObject({ type: 'studio_job_event', job_id: 'j1' });
    expect(context.envelope?.frameId).toBe(1);
  });

  it('dispatches a queue.lifecycle frame only to the queue.lifecycle handler', () => {
    const onJobs = vi.fn();
    const onQueue = vi.fn();
    subscribeToLiveEventTopics({
      'jobs.progress': onJobs,
      'queue.lifecycle': onQueue,
    });

    publishStudioSocketMessage({ type: 'queue_updated', reason: 'job_started' });

    expect(onJobs).not.toHaveBeenCalled();
    expect(onQueue).toHaveBeenCalledTimes(1);
    const [event] = onQueue.mock.calls[0];
    expect(event.eventKind).toBe('queue_invalidated');
  });

  it('routes job_updated frames to jobs.progress with rawType preserved for shape-discrimination', () => {
    const handler = vi.fn();
    subscribeToLiveEventTopics({ 'jobs.progress': handler });

    publishStudioSocketMessage({
      type: 'job_updated',
      job_id: 'j2',
      updates: { status: 'running', progress: 0.5 },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const [event, context] = handler.mock.calls[0];
    expect(event.topic).toBe('jobs.progress');
    expect(event.rawType).toBe('job_updated');
    expect(context.rawData.updates).toEqual({ status: 'running', progress: 0.5 });
  });

  it('does not invoke any handler when no matching topic is registered', () => {
    const onChapter = vi.fn();
    subscribeToLiveEventTopics({ 'chapter.invalidate': onChapter });

    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'j1', status: 'running' });
    publishStudioSocketMessage({ type: 'queue_updated' });

    expect(onChapter).not.toHaveBeenCalled();
  });

  it('returns an unsubscribe that detaches the topic handlers', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeToLiveEventTopics({ 'jobs.progress': handler });

    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'j', status: 'running' });
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    publishStudioSocketMessage({ type: 'studio_job_event', job_id: 'j', status: 'running' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('routes segment_progress legacy frames to jobs.progress', () => {
    const handler = vi.fn();
    subscribeToLiveEventTopics({ 'jobs.progress': handler });

    publishStudioSocketMessage({
      type: 'segment_progress',
      job_id: 'j1',
      chapter_id: 'c1',
      segment_id: 'seg-9',
      progress: 0.5,
    });

    expect(handler).toHaveBeenCalledTimes(1);
    const [event] = handler.mock.calls[0];
    expect(event.topic).toBe('jobs.progress');
    expect(event.segmentId).toBe('seg-9');
  });
});
