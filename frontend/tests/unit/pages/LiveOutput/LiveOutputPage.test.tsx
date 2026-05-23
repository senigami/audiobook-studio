import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveOutputPage } from '@/pages/LiveOutput/LiveOutputPage';
import { publishStudioSocketMessage, resetStudioSocketBusForTests } from '@/store/studioSocketBus';
import { recordLiveEventSubscriberObservation, resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';
import { LIVE_EVENT_CONSUMERS } from '@/config/liveEventConsumers';


const publish = (data: any) => {
  act(() => {
    publishStudioSocketMessage(data);
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
  });

  it('toggles active filter and filters rows by consumer listening definitions correctly', async () => {
    // 1. Publish some events
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running', classification: 'chapter' }); // frameId 1 -> chapters.progress
    publish({ type: 'queue_updated', reason: 'test-reason' });                                           // frameId 2 -> queue.items
    publish({ type: 'tts_log_line', line: 'Synthesizing line' });                                         // frameId 3 -> tts.logs
    publish({ type: 'mystery_backend_event', details: 'unobserved' });                                    // frameId 4 -> system.unknown

    // 2. Add observations (Handled by column will display these)
    act(() => {
      recordLiveEventSubscriberObservation(1, 'chapter-state', 'handled');
      recordLiveEventSubscriberObservation(2, 'main-queue', 'handled');
      recordLiveEventSubscriberObservation(3, 'tts-diagnostics', 'handled');
    });

    render(<LiveOutputPage />);

    // Initially, 'All' should show all 4 frames
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(4);

    // Filter to main-queue (listens to queue.items and chapters.progress)
    fireEvent.click(screen.getByRole('button', { name: 'main-queue' }));
    const rowsQueue = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsQueue).toHaveLength(2);
    const queueIds = Array.from(rowsQueue).map(r => r.getAttribute('data-frame-id'));
    expect(queueIds).toContain('1');
    expect(queueIds).toContain('2');

    // Filter to chapter-state (listens to chapters.lifecycle, chapters.progress, and segments.progress)
    fireEvent.click(screen.getByRole('button', { name: 'chapter-state' }));
    const rowsChapter = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsChapter).toHaveLength(1);
    expect(rowsChapter[0].getAttribute('data-frame-id')).toBe('1');

    // Filter to tts-diagnostics (listens to tts.logs)
    fireEvent.click(screen.getByRole('button', { name: 'tts-diagnostics' }));
    const rowsTts = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsTts).toHaveLength(1);
    expect(rowsTts[0].getAttribute('data-frame-id')).toBe('3');

    // Go back to All
    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(4);
  });

  it('derives filter buttons from the explicit consumer registry', () => {
    render(<LiveOutputPage />);
    LIVE_EVENT_CONSUMERS.forEach(consumer => {
      expect(screen.getByRole('button', { name: consumer.label })).toBeInTheDocument();
    });
  });

  it('filters based on explicit consumer-listening definitions rather than subscriber observations', () => {
    // 1. Publish events: tts.logs, chapters.progress, queue.items. No subscriber observations!
    publish({ type: 'tts_log_line', line: 'Synthesizing line' });                                         // frameId 1, topic tts.logs
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running', classification: 'chapter' }); // frameId 2, topic chapters.progress
    publish({ type: 'queue_updated', reason: 'test-reason' });                                           // frameId 3, topic queue.items

    render(<LiveOutputPage />);

    // Proves frames with no observations still appear under All
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(3);

    // Proves main-queue matches chapters.progress and queue.items
    fireEvent.click(screen.getByRole('button', { name: 'main-queue' }));
    const mainQueueRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(mainQueueRows).toHaveLength(2); // job-1 & queue_updated
    const mainQueueIds = Array.from(mainQueueRows).map(row => row.getAttribute('data-frame-id'));
    expect(mainQueueIds).toContain('2');
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
    expect(chapterRows).toHaveLength(1);
    expect(chapterRows[0].getAttribute('data-frame-id')).toBe('2');
  });
});
