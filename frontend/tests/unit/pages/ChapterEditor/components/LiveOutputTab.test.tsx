import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveOutputTable as LiveOutputTab } from '@/components/LiveOutputTable';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
} from '@/store/studioSocketBus';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';

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

describe('LiveOutputTab', () => {
  beforeEach(() => {
    resetStudioSocketBusForTests();
    resetLiveEventAuditForTests();
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it('renders one row per published websocket frame with normalized domain columns', () => {
    publishEvent('tts.logs', 'tts_log', {
      line: '[START_SEGMENT] seg-1',
      sequence: 1,
    }, { jobId: 'job-current', chapterId: 'chap-1' });

    publishEvent('segments.progress', 'segment_progress', {
      message: 'Rendering segment seg-1...',
      progress: 0.42,
      activeSegmentId: 'seg-1',
      activeSegmentProgress: 0.5,
      reasonCode: 'segment_start',
      status: 'running',
    }, { jobId: 'job-current', chapterId: 'chap-1', segmentId: 'seg-1' });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="job-current" />);

    expect(screen.getByText('[START_SEGMENT] seg-1')).toBeInTheDocument();
    expect(screen.getByText('Rendering segment seg-1...', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();

    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent);
    expect(headers).toEqual(expect.arrayContaining([
      'Time', 'Topic', 'Event', 'Job', 'Chapter', 'Segment', 'Job %',
      'Segment %', 'Group', 'ETA', 'Reason', 'Source', 'Message',
    ]));
  });

  it('renders distinct same-job studio_job_event frames as separate rows in insertion order', () => {
    publishEvent('queue.items', 'queue_item_status', { status: 'queued' }, { jobId: 'job-same' });
    publishEvent('queue.items', 'queue_item_status', { status: 'running' }, { jobId: 'job-same' });

    render(<LiveOutputTab />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute('data-frame-id')).toBe('1');
    expect(rows[1].getAttribute('data-frame-id')).toBe('2');
    expect(rows[0].textContent).toContain('queued');
    expect(rows[1].textContent).toContain('running');
  });

  it('shows unknown/unhandled frames as system.events audit rows', () => {
    publishEvent('system.events', 'mystery_backend_event', { foo: 'bar' });

    render(<LiveOutputTab />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('system.events');
    expect(rows[0].textContent).toContain('mystery_backend_event');
    expect(rows[0].textContent).toContain('foo');
  });

  it('updates the table live as new frames arrive after mount', () => {
    render(<LiveOutputTab />);
    expect(screen.getByText('No live output captured yet.')).toBeInTheDocument();

    publishEvent('queue.items', 'queue_item_status', { status: 'running' }, { jobId: 'job-live' });

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('running');
  });

  it('filters by consumer when toggle buttons are clicked', () => {
    publishEvent('queue.items', 'queue_item_status', { status: 'running' }, { jobId: 'job-1' });
    publishEvent('queue.items', 'queue_item_invalidated', { reasonCode: 'test-reason', changedFields: [] });

    render(<LiveOutputTab />);
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(2);

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
    publishEvent('queue.items', 'queue_item_status', { status: 'running' }, { jobId: 'job-1' });
    publishEvent('queue.items', 'queue_item_status', { status: 'running' }, { jobId: 'job-2' });

    render(<LiveOutputTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('job-2'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No live output captured yet.')).toBeInTheDocument();
  });

  it('toggles autoscroll pause without removing rows', () => {
    publishEvent('queue.items', 'queue_item_status', { status: 'running' }, { jobId: 'job-1' });

    render(<LiveOutputTab />);

    fireEvent.click(screen.getByRole('button', { name: 'Pause autoscroll' }));
    expect(screen.getByRole('button', { name: 'Resume autoscroll' })).toBeInTheDocument();
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(1);
  });

  it('renders ETA from segments.progress etaSeconds or eta_seconds', () => {
    publishEvent('segments.progress', 'segment_progress', {
      progress: 0.1,
      etaSeconds: 15,
    }, { jobId: 'job-1', segmentId: 'seg-1' });

    publishEvent('segments.progress', 'segment_progress', {
      progress: 0.2,
      eta_seconds: 10,
    }, { jobId: 'job-1', segmentId: 'seg-1' });

    render(<LiveOutputTab />);

    const rows = document.querySelectorAll('tbody tr[data-frame-id]');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('15s');
    expect(rows[1].textContent).toContain('10s');
  });

});
