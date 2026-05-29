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
    expect(screen.queryByText('50%')).not.toBeInTheDocument(); // Segment % should be gone/de-emphasized

    const headers = Array.from(document.querySelectorAll('th')).map(th => th.textContent);
    expect(headers).toEqual(expect.arrayContaining([
      'Time', 'Topic', 'Event', 'Job', 'Chapter', 'Segment', 'Job %',
      'Confidence', 'Group', 'ETA', 'Reason', 'Source', 'Message',
    ]));
  });

  it('renders confidence column and formats confidence values correctly based on progress and active block weight', () => {
    // 1. Running segment progress event with active render group weight
    publishEvent('segments.progress', 'segment_progress', {
      message: 'Rendering segment...',
      progress: 0.8,
      active_render_group_weight: 250,
      status: 'running',
    }, { jobId: 'job-1' });

    // 2. Running segment progress event with NO weight (should fall back to progress itself)
    publishEvent('segments.progress', 'segment_progress', {
      message: 'Rendering segment...',
      progress: 0.6,
      status: 'running',
    }, { jobId: 'job-2' });

    // 3. Terminal segment progress event
    publishEvent('segments.progress', 'segment_progress', {
      message: 'Done rendering segment...',
      progress: 1.0,
      status: 'done',
    }, { jobId: 'job-3' });

    render(<LiveOutputTab />);

    // Row 1: progress 80%, weight 250 -> confidence = (250/500) * 0.8 = 0.4 = 40% (low confidence warning)
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('⚠️ 40%')).toBeInTheDocument();

    // Row 2: progress 60%, no weight -> confidence should fall back to progress (60%)
    expect(screen.getAllByText('60%')).toHaveLength(2);

    // Row 3: status 'done' -> confidence should be 100%
    expect(screen.getAllByText('100%')).toHaveLength(2);
  });

  it('renders confidence 100% for segment_start frame at 0% progress', () => {
    publishEvent('segments.progress', 'segment_progress', {
      message: 'Starting segment...',
      progress: 0.0,
      reasonCode: 'segment_start',
      status: 'running',
    }, { jobId: 'job-1' });

    render(<LiveOutputTab />);

    // progress 0% should show '0%', and confidence should be 100%
    expect(screen.getByText('0%')).toBeInTheDocument();
    expect(screen.getByText('100%')).toBeInTheDocument();
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

  it('filters by topic toggles when buttons are clicked', () => {
    publishEvent('queue.items', 'queue_item_status', { status: 'running' }, { jobId: 'job-1' });
    publishEvent('tts.logs', 'tts_log', { line: 'noise line' });

    render(<LiveOutputTab />);
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'tts.logs' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'queue.items' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(document.querySelectorAll('tbody tr[data-frame-id]')).toHaveLength(2);

    expect(screen.queryByRole('button', { name: 'All minus tts.logs' })).not.toBeInTheDocument();
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
