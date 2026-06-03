import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveOutputPage } from '@/pages/LiveOutput/LiveOutputPage';
import { publishStudioSocketMessage, resetStudioSocketBusForTests } from '@/store/studioSocketBus';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';
import { clearTtsCommunicationTimeline, recordWebsocketDebugMessage } from '@/utils/runtimeDebug';
const publishEvent = (topic: string, eventKind: string, payload: any, ids: any = {}) => {
  act(() => {
    publishStudioSocketMessage({
      type: 'studio_event',
      version: 1,
      topic,
      eventKind,
      source: 'backend',
      emittedAt: Date.now() / 1000,
      pluginId: null,
      ids,
      payload,
    });
  });
};

describe('LiveOutputPage & Table Consumer Filters', () => {
  beforeEach(() => {
    resetStudioSocketBusForTests();
    resetLiveEventAuditForTests();
    clearTtsCommunicationTimeline();
    delete (window as any).__ttsCommunicationTimeline;
  });

  it('renders the header and description of the page', () => {
    render(<LiveOutputPage />);
    expect(screen.getByText('Live Output Stream')).toBeInTheDocument();
    expect(screen.getByText(/Internal audit log of normalized websocket events/)).toBeInTheDocument();
    expect(screen.getByText('Event map')).toBeInTheDocument();
    expect(screen.getByText('main-queue')).toBeInTheDocument();
    expect(screen.getByText('jobs.lifecycle, queue.items, chapters.lifecycle, chapters.progress')).toBeInTheDocument();
  });

  it('renders topic toggle buttons without the old all-minus-logs shortcut', () => {
    render(<LiveOutputPage />);

    // Assert buttons for the topic toggles are present
    expect(screen.getByRole('button', { name: 'All' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'All minus tts.logs' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'jobs.lifecycle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'queue.items' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'chapters.lifecycle' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'chapters.progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'segments.progress' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'voice.test' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tts.logs' })).toBeInTheDocument();
  });

  it('renders socket trace status and recent consumed websocket frames', async () => {
    act(() => {
      recordWebsocketDebugMessage('useQueueSync', {
        type: 'studio_event',
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        source: 'backend',
        job_id: 'job-1',
        payload: {
          status: 'running',
          progress: 0.25,
          message: 'loading',
        },
      }, JSON.stringify({
        type: 'studio_event',
        topic: 'queue.items',
        eventKind: 'queue_item_status',
      }));
    });

    render(<LiveOutputPage />);

    const traceBlock = screen.getByText('Socket trace').closest('details');
    expect(traceBlock).toBeInTheDocument();
    expect(traceBlock?.textContent).toContain('Connection:');
    await waitFor(() => {
      expect(traceBlock?.textContent).toContain('Traced frames: 1');
      expect(traceBlock?.textContent).toContain('queue.items');
      expect(traceBlock?.textContent).toContain('queue_item_status');
    });
  });

  it('toggles topic visibility and filters rows without hiding unrelated topics', async () => {
    // 1. Publish some events
    publishEvent('chapters.progress', 'chapter_progress', { status: 'running', progress: 0.5 }, { jobId: 'job-1' }); // frameId 1 -> chapters.progress
    publishEvent('jobs.lifecycle', 'job_lifecycle', { status: 'running', reasonCode: 'START_SYNTHESIS', message: 'Running synthesis' }, { jobId: 'job-2' }); // frameId 2 -> jobs.lifecycle
    publishEvent('tts.logs', 'tts_log', { line: 'Synthesizing line' });                                             // frameId 3 -> tts.logs
    publishEvent('system.events', 'unknown', { details: 'unobserved' });                                            // frameId 4 -> system.unknown
    publishEvent('projects.lifecycle', 'project_invalidated', { reasonCode: 'updated', changedFields: [] }, { projectId: 'proj-1' }); // frameId 5 -> projects.lifecycle

    render(<LiveOutputPage />);

    // Initially, 'All' should show all 5 frames
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(5);

    // Hide tts.logs only
    fireEvent.click(screen.getByRole('button', { name: 'tts.logs' }));
    const rowsNoLogs = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsNoLogs).toHaveLength(4);
    expect(Array.from(rowsNoLogs).map(r => r.getAttribute('data-frame-id'))).not.toContain('3');

    // Hide queue.items and keep the rest visible
    publishEvent('queue.items', 'queue_item_status', { status: 'running', progress: 0.2 }, { jobId: 'job-3' }); // frameId 6
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'queue.items' }));
    const rowsQueueHidden = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsQueueHidden).toHaveLength(4);

    // Reset to all
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(6);
  });

  it('still renders the event map consumer labels for routing reference', () => {
    render(<LiveOutputPage />);
    expect(screen.getByRole('button', { name: 'main-queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'chapter-state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'segment-state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tts-diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'voice-test-state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'project-state' })).toBeInTheDocument();
  });

  it('uses event map consumer names as topic presets for the table', () => {
    publishEvent('jobs.lifecycle', 'job_lifecycle', { status: 'running' }, { jobId: 'job-1' });
    publishEvent('queue.items', 'queue_item_status', { status: 'queued' }, { jobId: 'job-2' });
    publishEvent('chapters.lifecycle', 'chapter_lifecycle', { reasonCode: 'chapter_updated' }, { chapterId: 'chap-1' });
    publishEvent('chapters.progress', 'chapter_progress', { status: 'running', progress: 0.5 }, { jobId: 'job-3' });
    publishEvent('voice.test', 'voice_test_progress', { status: 'running', progress: 0.2 }, { jobId: 'job-4' });
    publishEvent('segments.progress', 'segment_progress', { status: 'running', progress: 0.2 }, { jobId: 'job-5', segmentId: 'seg-1' });
    publishEvent('tts.logs', 'tts_log', { line: 'debug line' });

    render(<LiveOutputPage />);

    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(7);

    fireEvent.click(screen.getByRole('button', { name: 'main-queue' }));
    let visibleFrameIds = Array.from(document.querySelectorAll('tbody tr[data-frame-id]')).map(row => row.getAttribute('data-frame-id'));
    expect(visibleFrameIds).toEqual(['1', '2', '3', '4']);

    fireEvent.click(screen.getByRole('button', { name: 'segment-state' }));
    visibleFrameIds = Array.from(document.querySelectorAll('tbody tr[data-frame-id]')).map(row => row.getAttribute('data-frame-id'));
    expect(visibleFrameIds).toEqual(['1', '6']);
  });

  it('proves the main-queue event map does not list segments.progress', () => {
    render(<LiveOutputPage />);
    const mainQueueLabel = screen.getByRole('button', { name: 'main-queue' });
    expect(mainQueueLabel).toBeInTheDocument();

    const row = mainQueueLabel.closest('div');
    expect(row).toBeInTheDocument();
    expect(row!.textContent).not.toContain('segments.progress');
  });

  it('filters based on explicit topic visibility rather than subscriber observations', () => {
    // 1. Publish events: tts.logs, chapters.progress, jobs.lifecycle. No subscriber observations!
    publishEvent('tts.logs', 'tts_log', { line: 'Synthesizing line' });                                         // frameId 1, topic tts.logs
    publishEvent('chapters.progress', 'chapter_progress', { status: 'running', progress: 0.5 }, { jobId: 'job-1' }); // frameId 2, topic chapters.progress
    publishEvent('jobs.lifecycle', 'job_lifecycle', { status: 'running', reasonCode: 'START_SYNTHESIS', message: 'Running synthesis' }, { jobId: 'job-2' }); // frameId 3, topic jobs.lifecycle

    render(<LiveOutputPage />);

    // Proves frames still appear under All without any subscriber observations
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(3);

    // Proves jobs.lifecycle can be hidden independently
    fireEvent.click(screen.getByRole('button', { name: 'jobs.lifecycle' }));
    const rowsWithoutJobs = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsWithoutJobs).toHaveLength(2);
    expect(Array.from(rowsWithoutJobs).map(row => row.getAttribute('data-frame-id'))).not.toContain('3');

    // Proves chapters.progress can be hidden independently
    fireEvent.click(screen.getByRole('button', { name: 'chapters.progress' }));
    const rowsWithoutChapterProgress = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsWithoutChapterProgress).toHaveLength(1);
    expect(Array.from(rowsWithoutChapterProgress).map(row => row.getAttribute('data-frame-id'))).not.toContain('2');

    // Proves tts.logs can be hidden independently
    fireEvent.click(screen.getByRole('button', { name: 'tts.logs' }));
    const ttsRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(ttsRows).toHaveLength(0);

    // Restore all topics
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(3);
  });

  it('displays ETA from queue.items etaSeconds or eta_seconds, accepting 0 as 0s', () => {
    publishEvent('queue.items', 'queue_item_status', { status: 'running', etaSeconds: 42 }, { jobId: 'job-1' }); // frameId 1
    publishEvent('queue.items', 'queue_item_status', { status: 'running', eta_seconds: 0 }, { jobId: 'job-2' }); // frameId 2

    render(<LiveOutputPage />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('42s');
    expect(rows[1].textContent).toContain('0s');
  });

  it('proves tts.logs does not display or derive ETA', () => {
    publishEvent('tts.logs', 'tts_log', { line: '[PROGRESS] 80% job-1, ETA 12 seconds' }); // frameId 1

    render(<LiveOutputPage />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(1);
    // Should display '-' for ETA, and not derive '12s'
    expect(rows[0].textContent).not.toContain('12s');
  });
});
