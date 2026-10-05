/**
 * RenderControlsStrip is a straight re-export of ChapterScriptToolbar
 * (@/pages/ChapterEditor/components/ChapterHeader) — that component's own
 * behavior is exhaustively covered by ChapterHeader.test.tsx and
 * ChapterHeaderProgressContract.test.tsx. This file only confirms the
 * re-export alias itself resolves to a working component (import/export
 * wiring), since @/pages/Book/studio/RenderControlsStrip is still the
 * import path used by CastTool.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RenderControlsStrip } from '@/pages/Book/studio/RenderControlsStrip';

describe('RenderControlsStrip', () => {
  it('renders as the ChapterScriptToolbar re-export', () => {
    render(
      <RenderControlsStrip
        chapter={{
          id: 'chapter-1',
          project_id: 'book-1',
          audio_status: 'unprocessed',
        } as any}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        status={{
          hasChapterAudio: false,
          effectiveQueueLocked: false,
          isQueued: false,
          queueStatus: null,
          liveSegmentProgressJob: null,
          liveSegmentProgressValue: 0,
          generatingSegmentIdsCount: 0,
          liveSegmentProgressIsRenderBlock: false,
          segmentProgressBarSelection: {
            selectedEtaSeconds: null,
            selectedEtaBasis: null,
            selectedUpdatedAt: null,
            isSegmentStartAtZero: false,
          },
        } as any}
      />,
    );

    expect(screen.getByRole('button', { name: /queue/i })).toBeInTheDocument();
  });
});
