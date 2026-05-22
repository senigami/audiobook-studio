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
    expect(screen.getByRole('button', { name: 'jobs-state' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'queue-sync' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'tts-diagnostics' })).toBeInTheDocument();
  });

  it('toggles active filter and filters rows by consumer listening definitions correctly', async () => {
    // 1. Publish some events
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running' }); // frameId 1
    publish({ type: 'queue_updated', reason: 'test-reason' });               // frameId 2
    publish({ type: 'tts_log_line', line: 'Synthesizing line' });             // frameId 3
    publish({ type: 'mystery_backend_event', details: 'unobserved' });        // frameId 4

    // 2. Add observations (Handled by column will display these)
    act(() => {
      recordLiveEventSubscriberObservation(1, 'jobs-state', 'handled');
      recordLiveEventSubscriberObservation(2, 'queue-sync', 'handled');
      recordLiveEventSubscriberObservation(3, 'tts-diagnostics', 'handled');
    });

    render(<LiveOutputPage />);

    // Initially, 'All' should show all 4 frames
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(4);

    // Filter to jobs-state (listens to jobs.progress and queue.lifecycle)
    fireEvent.click(screen.getByRole('button', { name: 'jobs-state' }));
    const rowsJobs = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsJobs).toHaveLength(2);
    const jobsIds = Array.from(rowsJobs).map(r => r.getAttribute('data-frame-id'));
    expect(jobsIds).toContain('1');
    expect(jobsIds).toContain('2');

    // Filter to queue-sync (listens to jobs.progress and queue.lifecycle)
    fireEvent.click(screen.getByRole('button', { name: 'queue-sync' }));
    const rowsQueue = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsQueue).toHaveLength(2);
    const queueIds = Array.from(rowsQueue).map(r => r.getAttribute('data-frame-id'));
    expect(queueIds).toContain('1');
    expect(queueIds).toContain('2');

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
    // 1. Publish events: tts.logs, jobs.progress, queue.lifecycle. No subscriber observations!
    publish({ type: 'tts_log_line', line: 'Synthesizing line' });                     // frameId 1, topic tts.logs
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running' });        // frameId 2, topic jobs.progress
    publish({ type: 'queue_updated', reason: 'test-reason' });                       // frameId 3, topic queue.lifecycle

    render(<LiveOutputPage />);

    // Proves frames with no observations still appear under All
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(3);

    // Proves jobs-state must not be attributed with tts.logs
    fireEvent.click(screen.getByRole('button', { name: 'jobs-state' }));
    const jobsStateRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(jobsStateRows).toHaveLength(2); // job-1 & queue_updated
    const jobsStateIds = Array.from(jobsStateRows).map(row => row.getAttribute('data-frame-id'));
    expect(jobsStateIds).toContain('2');
    expect(jobsStateIds).toContain('3');
    expect(jobsStateIds).not.toContain('1'); // No tts.logs

    // Proves tts-diagnostics only matches tts logs
    fireEvent.click(screen.getByRole('button', { name: 'tts-diagnostics' }));
    const ttsRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(ttsRows).toHaveLength(1); // tts_log_line
    expect(ttsRows[0].getAttribute('data-frame-id')).toBe('1');

    // Proves overlapping consumer definitions display the same frame in multiple filters:
    // jobs.progress and queue.lifecycle should appear in both jobs-state and queue-sync
    fireEvent.click(screen.getByRole('button', { name: 'queue-sync' }));
    const queueSyncRows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(queueSyncRows).toHaveLength(2); // jobs.progress & queue.lifecycle
    const queueSyncIds = Array.from(queueSyncRows).map(row => row.getAttribute('data-frame-id'));
    expect(queueSyncIds).toContain('2');
    expect(queueSyncIds).toContain('3');
    expect(queueSyncIds).not.toContain('1'); // No tts.logs
  });
});
