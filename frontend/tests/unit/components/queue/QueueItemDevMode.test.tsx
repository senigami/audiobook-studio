/**
 * QueueItemDevMode.test.tsx
 *
 * Tests that the "Copy Debug Info" button in QueueItem is absent by default
 * and visible when developer mode is enabled.
 *
 * Mocks: PredictiveProgressBar (external component boundary), localStorage (external storage).
 * Does NOT mock QueueItem or devMode.
 */

import { render, screen } from '@testing-library/react';
import { QueueItem } from '@/components/queue/QueueItem';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { STORAGE_KEY } from '@/utils/devMode';

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ onDisplayProgress, progress }: any) => {
    React.useEffect(() => { onDisplayProgress?.(progress); }, [progress, onDisplayProgress]);
    return <div data-testid="queue-item-progress-bar" data-progress={progress} />;
  },
}));

const defaultJob = {
  id: 'job-42',
  status: 'running',
  chapter_title: 'Ch 1',
  project_name: 'Proj',
  split_part: 0,
  started_at: 1000,
  updated_at: 1000,
} as any;

const defaultProps = {
  job: defaultJob,
  localPaused: false,
  formatJobTitle: (j: any) => j.chapter_title,
  formatTime: () => '00:00',
  onRemove: vi.fn(),
};

describe('QueueItem debug copy button dev mode gating', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('does not render the debug copy button when dev mode is off', () => {
    render(<QueueItem {...defaultProps} />);
    expect(screen.queryByTestId('debug-copy-btn-job-42')).toBeNull();
  });

  it('renders the debug copy button when dev mode is on', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    render(<QueueItem {...defaultProps} />);
    expect(screen.getByTestId('debug-copy-btn-job-42')).toBeTruthy();
  });
});
