import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RenderControlsStrip } from '@/pages/Book/studio/RenderControlsStrip';

describe('RenderControlsStrip', () => {
  it('renders queue controls and the predictive progress bar for a running render', () => {
    render(
      <RenderControlsStrip
        chapter={{
          id: 'chapter-1',
          project_id: 'book-1',
          audio_status: 'ready',
        } as any}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        onCopyDebugState={vi.fn()}
        onCommitSourceText={vi.fn()}
        canCommitSourceText={false}
        onSegmentDisplayProgress={vi.fn()}
        onProgressBarDebugSnapshot={vi.fn()}
        status={{
          hasChapterAudio: false,
          effectiveQueueLocked: false,
          isQueued: false,
          queueStatus: null,
          liveSegmentProgressJob: {
            id: 'job-1',
            status: 'running',
            progress: 0.42,
            active_segment_id: 'seg-1',
            active_segment_progress: 0.42,
            active_segment_eta_seconds: 35,
            active_segment_eta_basis: 'remaining_from_update',
            active_segment_updated_at: 123456,
            eta_seconds: 35,
            eta_basis: 'remaining_from_update',
            started_at: 123000,
            updated_at: 123456,
          },
          liveSegmentProgressValue: 0.42,
          generatingSegmentIdsCount: 1,
          liveSegmentProgressIsRenderBlock: true,
          segmentProgressBarSelection: {
            selectedEtaSeconds: 35,
            selectedEtaBasis: 'remaining_from_update',
            selectedUpdatedAt: 123456,
            isSegmentStartAtZero: false,
          },
        } as any}
        handoffState={{
          hasPending: false,
          displayedSegmentId: 'seg-1',
          displayedProgress: 0.42,
          displayedEtaSeconds: 35,
          displayedEtaBasis: 'remaining_from_update',
          displayedUpdatedAt: 123456,
          displayedJobId: 'job-1',
          notifyDisplayProgress: vi.fn(),
        } as any}
      />,
    );

    expect(screen.getByRole('button', { name: /queue/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /stop all/i })).toBeInTheDocument();
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    expect(screen.getByText(/saved/i)).toBeInTheDocument();
  });
});
