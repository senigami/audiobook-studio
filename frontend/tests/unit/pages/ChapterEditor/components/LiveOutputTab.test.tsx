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
    expect(screen.queryByText('[PROGRESS] 80% job-other')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Live output filter'), { target: { value: 'all' } });
    expect(screen.getByText('[PROGRESS] 80% job-other')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pause autoscroll' }));
    expect(screen.getByRole('button', { name: 'Resume autoscroll' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Copy JSON' }));
    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining('job-other'));
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByText('No live output captured yet.')).toBeInTheDocument();
  });
});
