import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveOutputTable as LiveOutputTab } from '@/components/LiveOutputTable';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
} from '@/store/studioSocketBus';
import {
  recordLiveEventSubscriberObservation,
  resetLiveEventAuditForTests,
} from '@/store/liveEventAuditStore';

const publish = (data: any) => {
  act(() => {
    publishStudioSocketMessage(data);
  });
};

describe('LiveOutputTab', () => {
  beforeEach(() => {
    resetStudioSocketBusForTests();
    resetLiveEventAuditForTests();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders one row per published websocket frame with normalized domain columns', () => {
    publish({
      type: 'tts_log_line',
      job_id: 'job-current',
      chapter_id: 'chap-1',
      line: '[START_SEGMENT] seg-1',
      marker: 'START_SEGMENT',
      sequence: 1,
    });
    publish({
      type: 'job_updated',
      job_id: 'job-current',
      chapter_id: 'chap-1',
      source: 'test-source',
      updates: {
        message: 'Rendering segment seg-1...',
        progress: 0.42,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.5,
        reason_code: 'segment_start',
      },
    });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="job-current" />);

    expect(screen.getByText('[START_SEGMENT] seg-1')).toBeInTheDocument();
    expect(screen.getByText('Rendering segment seg-1...', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent);
    expect(headers).toEqual(expect.arrayContaining([
      'Time', 'Topic', 'Category', 'Event', 'Handled by',
      'Job', 'Chapter', 'Segment', 'Job %', 'Segment %',
      'Reason', 'Source', 'Message',
    ]));
  });

  it('renders distinct same-job studio_job_event frames as separate rows in insertion order', () => {
    publish({ type: 'studio_job_event', job_id: 'job-same', status: 'queued' });
    publish({ type: 'studio_job_event', job_id: 'job-same', status: 'running' });

    render(<LiveOutputTab />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-frame-id')).toBe('1');
    expect(rows[1].getAttribute('data-frame-id')).toBe('2');
    expect(rows[0].textContent).toContain('queued');
    expect(rows[1].textContent).toContain('running');
  });

  it('merges subscriber observations on the same frame into one row without duplicating subscriber names', () => {
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running' });
    const frameId = 1;
    act(() => {
      recordLiveEventSubscriberObservation(frameId, 'chapter-state', 'handled');
      recordLiveEventSubscriberObservation(frameId, 'main-queue', 'handled');
      recordLiveEventSubscriberObservation(frameId, 'chapter-state', 'handled');
    });

    render(<LiveOutputTab />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(1);
    const subscribersCell = rows[0].querySelector('[data-testid="subscribers-cell"]');
    expect(subscribersCell?.textContent).toBe('chapter-state, main-queue');
  });

  it('shows unknown/unhandled frames as system.events audit rows', () => {
    publish({ type: 'mystery_backend_event', foo: 'bar' });

    render(<LiveOutputTab />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('system.events');
    expect(rows[0].textContent).toContain('mystery_backend_event');
  });

  it('updates the table live as new frames arrive after mount', () => {
    render(<LiveOutputTab />);
    expect(screen.getByText('No live output captured yet.')).toBeInTheDocument();

    publish({ type: 'studio_job_event', job_id: 'job-live', status: 'running' });

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('running');
  });

  it('filters by consumer when toggle buttons are clicked', () => {
    publish({ type: 'studio_job_event', job_id: 'job-1' });
    publish({ type: 'queue_updated' });
    act(() => {
      recordLiveEventSubscriberObservation(1, 'chapter-state', 'handled');
      recordLiveEventSubscriberObservation(2, 'main-queue', 'handled');
    });

    render(<LiveOutputTab />);
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(2);

    // chapter-state listens to chapters.lifecycle, chapters.progress, and segments.progress (both match since job-1 maps to queue.items and queue_updated maps to queue.items... wait! Actually, job-1 has no active segment or classification, so it maps to queue.items. queue_updated maps to queue.items. Does chapter-state listen to queue.items? No! chapter-state listens to ['chapters.lifecycle', 'chapters.progress', 'segments.progress'].
    // Wait! Let's check which events match which consumers:
    // job-1 -> maps to queue.items.
    // queue_updated -> maps to queue.items.
    // So both events have topic queue.items.
    // main-queue listens to queue.items. So main-queue matches both events.
    // chapter-state does NOT listen to queue.items. So chapter-state matches 0 events.
    // Let's adjust the test expectations accordingly:
    // main-queue: 2 match
    // chapter-state: 0 match
    // tts-diagnostics: 0 match
    fireEvent.click(screen.getByRole('button', { name: 'main-queue' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'chapter-state' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'tts-diagnostics' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: /all/i }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(2);
  });

  it('clears the audit and copies the visible rows as JSON', async () => {
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running' });
    publish({ type: 'studio_job_event', job_id: 'job-2', status: 'running' });

    render(<LiveOutputTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('job-2'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No live output captured yet.')).toBeInTheDocument();
  });

  it('toggles autoscroll pause without removing rows', () => {
    publish({ type: 'studio_job_event', job_id: 'job-1', status: 'running' });

    render(<LiveOutputTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause autoscroll' }));
    expect(screen.getByRole('button', { name: 'Resume autoscroll' })).toBeInTheDocument();
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(1);
  });

});
