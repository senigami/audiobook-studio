import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { QueueItem } from '@/components/queue/QueueItem';
import type { ProcessingQueueItem } from '@/types';

const waitingJob = {
  id: 'job-wait-1',
  status: 'waiting_for_resources',
  chapter_title: 'Chapter 1',
  project_name: 'Project A',
  split_part: 0,
  engine: 'xtts',
  eta_seconds: 120,
  updated_at: 1000,
} as unknown as ProcessingQueueItem;

describe('QueueItem waiting_for_resources row', () => {
  it('reads "Waiting to start" and shows no live ETA', () => {
    render(
      <QueueItem
        job={waitingJob}
        localPaused={false}
        formatJobTitle={(j) => (j as ProcessingQueueItem).chapter_title ?? ''}
        formatTime={(s: number) => `T${s}`}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getByText('Waiting to start')).toBeTruthy();
    expect(screen.queryByText(/Processing/)).toBeNull();
    expect(screen.queryByText(/remaining|ETA/i)).toBeNull();
  });
});
