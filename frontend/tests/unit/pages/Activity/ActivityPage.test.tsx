import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ActivityPage from '@/pages/Activity/ActivityPage';
import type { Job, ProcessingQueueItem } from '@/types';

vi.mock('@/api', () => ({
  api: {
    toggleQueuePause: vi.fn().mockResolvedValue({}),
    reorderProcessingQueue: vi.fn().mockResolvedValue({}),
    removeProcessingQueue: vi.fn().mockResolvedValue({}),
    clearCompletedJobs: vi.fn().mockResolvedValue({}),
    clearProcessingQueue: vi.fn().mockResolvedValue({}),
    cancelChapterGeneration: vi.fn().mockResolvedValue({}),
    fetchSystemResources: vi.fn().mockResolvedValue({
      cpu_pct: 10,
      ram_used_gb: 2,
      ram_total_gb: 16,
      vram_used_gb: null,
      vram_total_gb: null,
    }),
    fetchEngineConcurrency: vi.fn().mockResolvedValue({ global_cap: 1, engines: [] }),
    fetchHome: vi.fn().mockResolvedValue({
      render_stats: {
        sample_count: 2,
        word_count: 3200,
        chars: 18400,
        audio_duration_seconds: 3660,
        render_duration_seconds: 3720,
        audio_hours_rendered: 1.02,
        render_hours_spent: 1.03,
        since_timestamp: 1710000000,
        by_engine: [],
      },
    }),
  },
}));

describe('ActivityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the full queue surface with stats and history controls', async () => {
    const queue: ProcessingQueueItem[] = [
        {
          id: 'job-running',
          status: 'running',
          split_part: 0,
          created_at: 1710000000,
          completed_at: null,
          chapter_title: 'Active Chapter',
          project_name: 'Project Alpha',
          progress: 0.5,
          eta_seconds: 120,
        },
      {
        id: 'job-queued',
        status: 'queued',
        split_part: 0,
        created_at: 1710000100,
        completed_at: null,
        chapter_title: 'Queued Chapter',
        project_name: 'Project Alpha',
        eta_seconds: 60,
      },
      {
        id: 'job-done',
        status: 'done',
        split_part: 0,
        created_at: 1710000200,
        completed_at: 1710000800,
        chapter_title: 'Completed Chapter',
        project_name: 'Project Alpha',
        produced_audio_length: 75,
        produced_chars: 1024,
      },
      {
        id: 'job-sample',
        status: 'done',
        split_part: 0,
        created_at: 1710000300,
        completed_at: 1710000400,
        chapter_title: 'Sample Session',
        project_name: null,
        engine: 'voice_test',
        custom_title: 'Sample Session',
      },
    ];

    const jobs: Record<string, Job> = {
      'job-running': {
        id: 'job-running',
        status: 'running',
        split_part: 0,
        created_at: 1710000000,
        completed_at: null,
        chapter_title: 'Active Chapter',
        project_name: 'Project Alpha',
        progress: 0.5,
        eta_seconds: 120,
      } as Job,
      'job-queued': {
        id: 'job-queued',
        status: 'queued',
        split_part: 0,
        created_at: 1710000100,
        completed_at: null,
        chapter_title: 'Queued Chapter',
        project_name: 'Project Alpha',
        eta_seconds: 60,
      } as Job,
      'job-done': {
        id: 'job-done',
        status: 'done',
        split_part: 0,
        created_at: 1710000200,
        completed_at: 1710000800,
        chapter_title: 'Completed Chapter',
        project_name: 'Project Alpha',
        produced_audio_length: 75,
        produced_chars: 1024,
      } as Job,
      'job-sample': {
        id: 'job-sample',
        status: 'done',
        split_part: 0,
        created_at: 1710000300,
        completed_at: 1710000400,
        chapter_title: 'Sample Session',
        project_name: null,
        engine: 'voice_test',
        custom_title: 'Sample Session',
      } as Job,
    };

    render(
      <MemoryRouter>
        <ActivityPage
          paused={false}
          jobs={jobs}
          queue={queue}
          loading={false}
          connected={true}
          isReconnecting={false}
          engines={[
            {
              engine_id: 'xtts',
              display_name: 'XTTS',
              status: 'ready',
              verified: true,
              enabled: true,
              version: '1.0.0',
              local: true,
              cloud: false,
              network: false,
              languages: ['en'],
              capabilities: [],
              resource: {},
              author: 'Studio',
              homepage: '',
              calibrated_cps: 12.5,
              calibration_confidence_percent: 85,
              settings_schema: {},
            } as any,
          ]}
          onRefresh={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Global Queue')).toBeTruthy();
    expect(screen.getByText('Stats')).toBeTruthy();
    expect(screen.getByText('Engine calibration')).toBeTruthy();
    expect(screen.getByText(/Pause All Jobs/i)).toBeTruthy();
    expect(screen.getByText(/Completed \/ Failed History/i)).toBeTruthy();
    expect(screen.getAllByText('2m remaining').length).toBeGreaterThan(0);

    expect(await screen.findByText('Production')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Samples' }));
    fireEvent.click(screen.getByText(/Completed \/ Failed History/i));

    await waitFor(() => {
      expect(screen.getByText('Sample Session')).toBeTruthy();
      expect(screen.queryByText('Completed Chapter')).toBeNull();
      expect(screen.getByText('Active Chapter')).toBeTruthy();
    });
  });
});
