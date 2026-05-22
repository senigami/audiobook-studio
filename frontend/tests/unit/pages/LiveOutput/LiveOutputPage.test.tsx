import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveOutputPage } from '@/pages/LiveOutput/LiveOutputPage';
import { publishStudioSocketMessage, resetStudioSocketBusForTests } from '@/store/studioSocketBus';
import { recordLiveEventSubscriberObservation, resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';

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

  it('toggles active filter and filters rows by consumer observations correctly', async () => {
    // 1. Publish some events
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running' }); // frameId 1
    publish({ type: 'queue_updated', reason: 'test-reason' });               // frameId 2
    publish({ type: 'tts_log_line', line: 'Synthesizing line' });             // frameId 3
    publish({ type: 'mystery_backend_event', details: 'unobserved' });        // frameId 4

    // 2. Add observations
    act(() => {
      recordLiveEventSubscriberObservation(1, 'jobs-state', 'handled');
      recordLiveEventSubscriberObservation(2, 'queue-sync', 'handled');
      recordLiveEventSubscriberObservation(3, 'tts-diagnostics', 'handled');
    });

    render(<LiveOutputPage />);

    // Initially, 'All' should show all 4 frames
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(4);

    // Filter to jobs-state
    fireEvent.click(screen.getByRole('button', { name: 'jobs-state' }));
    const rowsJobs = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsJobs).toHaveLength(1);
    expect(rowsJobs[0].getAttribute('data-frame-id')).toBe('1');

    // Filter to queue-sync
    fireEvent.click(screen.getByRole('button', { name: 'queue-sync' }));
    const rowsQueue = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsQueue).toHaveLength(1);
    expect(rowsQueue[0].getAttribute('data-frame-id')).toBe('2');

    // Filter to tts-diagnostics
    fireEvent.click(screen.getByRole('button', { name: 'tts-diagnostics' }));
    const rowsTts = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rowsTts).toHaveLength(1);
    expect(rowsTts[0].getAttribute('data-frame-id')).toBe('3');

    // Go back to All
    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(4);
  });
});
