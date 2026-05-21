import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LiveOutputTab } from '@/pages/ChapterEditor/components/LiveOutputTab';
import { clearTtsCommunicationTimeline, recordWebsocketDebugMessage } from '@/utils/runtimeDebug';

describe('LiveOutputTab', () => {
  beforeEach(() => {
    clearTtsCommunicationTimeline();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('renders tts log lines and socket messages in timeline order', async () => {
    recordWebsocketDebugMessage('useJobs', {
      type: 'tts_log_line',
      job_id: 'job-current',
      chapter_id: 'chap-1',
      line: '[START_SEGMENT] seg-1',
      marker: 'START_SEGMENT',
      sequence: 1,
      received_at: 1,
    });
    recordWebsocketDebugMessage('useJobs', {
      type: 'job_updated',
      job_id: 'job-current',
      chapter_id: 'chap-1',
      source: 'test-source',
      updates: {
        message: 'Rendering segment seg-1...',
        progress: 0.42,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.5,
        active_render_group_index: 1,
        render_group_count: 4,
        completed_render_groups: 2,
        completed_render_weight: 40,
        total_render_weight: 100,
        active_render_group_weight: 20,
        reason_code: 'segment_start',
      },
    });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="job-current" />);

    expect(screen.getByText('[START_SEGMENT] seg-1')).toBeInTheDocument();
    expect(screen.getByText('Rendering segment seg-1...')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('1/4')).toBeInTheDocument();
    expect(screen.getByText('2/4')).toBeInTheDocument();
    expect(screen.getByText('40/100 active 20')).toBeInTheDocument();
  });

  it('clears, filters, pauses, and copies the visible timeline', async () => {
    recordWebsocketDebugMessage('useJobs', {
      type: 'tts_log_line',
      job_id: 'job-current',
      chapter_id: 'chap-1',
      line: '[PROGRESS] 40% job-current',
      marker: 'PROGRESS',
      sequence: 1,
      received_at: 1,
    });
    recordWebsocketDebugMessage('useJobs', {
      type: 'tts_log_line',
      job_id: 'job-other',
      chapter_id: 'chap-2',
      line: '[PROGRESS] 80% job-other',
      marker: 'PROGRESS',
      sequence: 1,
      received_at: 2,
    });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="job-current" />);

    expect(screen.getByText('[PROGRESS] 40% job-current')).toBeInTheDocument();
    expect(screen.getByText('[PROGRESS] 80% job-other')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Live output filter'), { target: { value: 'chapter' } });
    expect(screen.queryByText('[PROGRESS] 80% job-other')).not.toBeInTheDocument();


    fireEvent.click(screen.getByRole('button', { name: 'Pause autoscroll' }));
    expect(screen.getByRole('button', { name: 'Resume autoscroll' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Live output filter'), { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('job-other'));
    });


    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No live output captured yet.')).toBeInTheDocument();
  });

  it('colours rows by audience: blue=queue, yellow=chapter, green=both', () => {
    recordWebsocketDebugMessage('useJobs', { type: 'queue_updated' });
    recordWebsocketDebugMessage('useJobs', { type: 'tts_log_line', job_id: 'j', chapter_id: 'chap-1', line: 'l', marker: 'raw', sequence: 1 });
    recordWebsocketDebugMessage('useJobs', { type: 'studio_job_event', job_id: 'j', chapter_id: 'chap-1', status: 'running' });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="j" />);

    // Switch to "all" so every entry is visible regardless of chapter/job filter
    fireEvent.change(screen.getByLabelText('Live output filter'), { target: { value: 'all' } });

    const rows = document.querySelectorAll('tr[data-audience]');
    expect(rows).toHaveLength(3);
    const audiences = Array.from(rows).map(r => r.getAttribute('data-audience'));
    expect(audiences).toContain('queue');
    expect(audiences).toContain('chapter');
    expect(audiences).toContain('both');
  });

  it('shows a legend explaining row color meanings', () => {
    render(<LiveOutputTab chapterId="chap-1" currentJobId="j" />);

    const legend = screen.getByTestId('audience-legend');
    expect(legend).toBeInTheDocument();
    expect(legend.textContent).toContain('Queue');
    expect(legend.textContent).toContain('Chapter');
    expect(legend.textContent).toContain('Both');
  });

  it('shows consumer (listener) in each row', () => {
    recordWebsocketDebugMessage('useQueueSync', { type: 'queue_updated' });
    recordWebsocketDebugMessage('useJobs', { type: 'tts_log_line', job_id: 'j', chapter_id: 'chap-1', line: 'log', marker: 'raw', sequence: 1 });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="j" />);
    fireEvent.change(screen.getByLabelText('Live output filter'), { target: { value: 'all' } });

    const rows = document.querySelectorAll('tr[data-audience]');
    expect(rows).toHaveLength(2);
    // The consumer column should show the listener name
    expect(rows[0].textContent).toContain('useQueueSync');
    expect(rows[1].textContent).toContain('useJobs');
  });
  it('merges duplicate both entries into a single row with combined listeners', () => {
    // Record the same studio_job_event from both hooks
    recordWebsocketDebugMessage('useJobs', { type: 'studio_job_event', job_id: 'j', chapter_id: 'chap-1' });
    recordWebsocketDebugMessage('useQueueSync', { type: 'studio_job_event', job_id: 'j', chapter_id: 'chap-1' });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="j" />);
    fireEvent.change(screen.getByLabelText('Live output filter'), { target: { value: 'all' } });

    const rows = document.querySelectorAll('tr[data-audience]');
    const bothRows = Array.from(rows).filter(r => r.getAttribute('data-audience') === 'both');
    expect(bothRows).toHaveLength(1);
    const text = bothRows[0].textContent || '';
    expect(text).toContain('useJobs');
    expect(text).toContain('useQueueSync');
  });

  it('defaults to showing all output (unfiltered) by default', () => {
    recordWebsocketDebugMessage('useJobs', {
      type: 'tts_log_line',
      job_id: 'job-other',
      chapter_id: 'chap-2',
      line: '[PROGRESS] 80% job-other',
      marker: 'PROGRESS',
      sequence: 1,
      received_at: 2,
    });

    render(<LiveOutputTab chapterId="chap-1" currentJobId="job-current" />);
    expect(screen.getByText('[PROGRESS] 80% job-other')).toBeInTheDocument();
  });
});
