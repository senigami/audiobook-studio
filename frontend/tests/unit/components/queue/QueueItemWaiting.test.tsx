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
    const { container } = render(
      <QueueItem
        job={waitingJob}
        localPaused={false}
        formatJobTitle={(j) => (j as ProcessingQueueItem).chapter_title ?? ''}
        formatTime={(s: number) => `T${s}`}
        onRemove={vi.fn()}
      />
    );
    expect(screen.getAllByText('Waiting to start')).toHaveLength(1);
    expect(screen.queryByText('Queued')).toBeNull();
    expect(screen.queryByText(/Processing/)).toBeNull();
    expect(container.querySelector('[data-testid*="eta" i]')).toBeNull();
    expect(container.textContent).not.toMatch(/T120|\b120\b|\b2m\b|remaining|ETA/i);
  });
});
