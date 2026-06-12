import { render, screen, fireEvent } from '@testing-library/react';
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
        chapter_title: 'Running Chapter',
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
    ];

    const jobs: Record<string, Job> = {
      'job-running': {
        id: 'job-running',
        status: 'running',
        split_part: 0,
        created_at: 1710000000,
        completed_at: null,
        chapter_title: 'Running Chapter',
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
          onRefresh={vi.fn()}
        />
      </MemoryRouter>
    );

    expect(screen.getByText('Global Queue')).toBeTruthy();
    expect(screen.getByText('Stats')).toBeTruthy();
    expect(screen.getByText(/Pause All Jobs/i)).toBeTruthy();
    expect(screen.getByText(/Completed \/ Failed History/i)).toBeTruthy();
    expect(screen.getAllByText('2m remaining').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByText(/Completed \/ Failed History/i));

    expect(await screen.findByText('Completed Chapter')).toBeTruthy();
  });
});
