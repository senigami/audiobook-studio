import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveOutputPage } from '@/pages/LiveOutput/LiveOutputPage';
import { publishStudioSocketMessage, resetStudioSocketBusForTests } from '@/store/studioSocketBus';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';
import { LIVE_EVENT_CONSUMERS } from '@/config/liveEventConsumers';


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
  });

  it('renders the header and description of the page', () => {
    render(<LiveOutputPage />);
    expect(screen.getByText('Live Output Stream')).toBeInTheDocument();
    expect(screen.getByText(/Internal audit log of normalized websocket events/)).toBeInTheDocument();
    expect(screen.getByText('Event map')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'main-queue' })).toBeInTheDocument();
    expect(screen.getByText('jobs.lifecycle')).toBeInTheDocument();
  });

  it('renders filter toggle buttons for all plus the consumer names', () => {
    render(<LiveOutputPage />);

    // Assert that the dropdown is not present
    expect(screen.queryByLabelText('Live output filter')).not.toBeInTheDocument();

    // Assert buttons for all and each consumer are present
    expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'main-queue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'chapter-state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'segment-state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tts-diagnostics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'project-state' })).toBeInTheDocument();
  });

  it('toggles active filter and filters rows by consumer listening definitions correctly', async () => {
    // 1. Publish some events
    publishEvent('chapters.progress', 'chapter_progress', { status: 'running', progress: 0.5 }, { jobId: 'job-1' }); // frameId 1 -> chapters.progress
    publishEvent('jobs.lifecycle', 'job_lifecycle', { status: 'running', reasonCode: 'START_SYNTHESIS', message: 'Running synthesis' }, { jobId: 'job-2' }); // frameId 2 -> jobs.lifecycle
    publishEvent('tts.logs', 'tts_log', { line: 'Synthesizing line' });                                             // frameId 3 -> tts.logs
    publishEvent('system.events', 'unknown', { details: 'unobserved' });                                            // frameId 4 -> system.unknown
    publishEvent('projects.lifecycle', 'project_invalidated', { reasonCode: 'updated', changedFields: [] }, { projectId: 'proj-1' }); // frameId 5 -> projects.lifecycle

    render(<LiveOutputPage />);

    // Initially, 'All' should show all 5 frames
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(5);

    // Filter to main-queue (listens to jobs.lifecycle)
    fireEvent.click(screen.getByRole('button', { name: 'main-queue' }));
    const rowsQueue = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsQueue).toHaveLength(1);
    const queueIds = Array.from(rowsQueue).map(r => r.getAttribute('data-frame-id'));
    expect(queueIds).not.toContain('1');
    expect(queueIds).toContain('2');

    // Filter to chapter-state (listens to jobs.lifecycle, chapters.lifecycle, chapters.progress, and segments.progress)
    fireEvent.click(screen.getByRole('button', { name: 'chapter-state' }));
    const rowsChapter = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsChapter).toHaveLength(2);
    expect(Array.from(rowsChapter).map(r => r.getAttribute('data-frame-id'))).toEqual(expect.arrayContaining(['1', '2']));

    // Filter to tts-diagnostics (listens to tts.logs)
    fireEvent.click(screen.getByRole('button', { name: 'tts-diagnostics' }));
    const rowsTts = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsTts).toHaveLength(1);
    expect(rowsTts[0].getAttribute('data-frame-id')).toBe('3');

    // Filter to project-state (listens to projects.lifecycle)
    fireEvent.click(screen.getByRole('button', { name: 'project-state' }));
    const rowsProj = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsProj).toHaveLength(1);
    expect(rowsProj[0].getAttribute('data-frame-id')).toBe('5');

    // Go back to All
    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(5);
  });

  it('derives filter buttons from the explicit consumer registry', () => {
    render(<LiveOutputPage />);
    LIVE_EVENT_CONSUMERS.forEach(consumer => {
      expect(screen.getByRole('button', { name: consumer.label })).toBeInTheDocument();
    });
  });

  it('filters based on explicit consumer-listening definitions rather than subscriber observations', () => {
    // 1. Publish events: tts.logs, chapters.progress, jobs.lifecycle. No subscriber observations!
    publishEvent('tts.logs', 'tts_log', { line: 'Synthesizing line' });                                         // frameId 1, topic tts.logs
    publishEvent('chapters.progress', 'chapter_progress', { status: 'running', progress: 0.5 }, { jobId: 'job-1' }); // frameId 2, topic chapters.progress
    publishEvent('jobs.lifecycle', 'job_lifecycle', { status: 'running', reasonCode: 'START_SYNTHESIS', message: 'Running synthesis' }, { jobId: 'job-2' }); // frameId 3, topic jobs.lifecycle

    render(<LiveOutputPage />);

    // Proves frames still appear under All without any subscriber observations
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(3);

    // Proves main-queue matches jobs.lifecycle
    fireEvent.click(screen.getByRole('button', { name: 'main-queue' }));
    const mainQueueRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(mainQueueRows).toHaveLength(1); // job_lifecycle only
    const mainQueueIds = Array.from(mainQueueRows).map(row => row.getAttribute('data-frame-id'));
    expect(mainQueueIds).not.toContain('2');
    expect(mainQueueIds).toContain('3');
    expect(mainQueueIds).not.toContain('1'); // No tts.logs

    // Proves tts-diagnostics only matches tts logs
    fireEvent.click(screen.getByRole('button', { name: 'tts-diagnostics' }));
    const ttsRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(ttsRows).toHaveLength(1); // tts_log_line
    expect(ttsRows[0].getAttribute('data-frame-id')).toBe('1');

    // Proves chapter-state matches chapters.progress
    fireEvent.click(screen.getByRole('button', { name: 'chapter-state' }));
    const chapterRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(chapterRows).toHaveLength(2);
    expect(Array.from(chapterRows).map(row => row.getAttribute('data-frame-id'))).toEqual(expect.arrayContaining(['2', '3']));
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
