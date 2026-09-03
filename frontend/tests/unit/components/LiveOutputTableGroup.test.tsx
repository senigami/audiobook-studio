import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { LiveOutputTable } from '@/components/LiveOutputTable';
import { publishStudioSocketMessage } from '@/store/studioSocketBus';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';

beforeEach(() => {
  resetLiveEventAuditForTests();
});

const getGroupCellForRow = (rowIndex = 0): string => {
  const rows = screen.getAllByRole('row').slice(1); // skip header
  const row = rows[rowIndex];
  const headers = screen.getAllByRole('columnheader');
  const colIdx = headers.findIndex(h => h.textContent === 'Group');
  const cells = row.querySelectorAll('td');
  return cells[colIdx]?.textContent ?? '';
};

const publishSegmentFrame = (segmentIndex: number, segmentCount: number) => {
  publishStudioSocketMessage({
    type: 'studio_event',
    version: 1,
    topic: 'segments.progress',
    eventKind: 'segment_progress',
    ids: { jobId: 'job-grp-1', chapterId: 'ch-1', segmentId: `seg-${segmentIndex}` },
    payload: {
      status: 'running',
      progress: 0.5,
      segmentIndex,
      segmentCount,
      reasonCode: 'SEGMENT_PROGRESS',
    },
  });
};

describe('LiveOutputTable - group column ordinal convention', () => {
  it('renders segment frames as a 1-based group ordinal (index 0 of 4 -> 1/4)', async () => {
    render(<LiveOutputTable />);

    act(() => publishSegmentFrame(0, 4));
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));

    expect(getGroupCellForRow(0)).toBe('1/4');
  });

  it('renders the last group as M/M, not (M-1)/M (index 3 of 4 -> 4/4)', async () => {
    render(<LiveOutputTable />);

    act(() => publishSegmentFrame(3, 4));
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));

    expect(getGroupCellForRow(0)).toBe('4/4');
  });

  it('renders chapter frames from the completed count as the in-flight ordinal (2 completed of 4 -> 3/4)', async () => {
    render(<LiveOutputTable />);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-grp-2', chapterId: 'ch-1' },
        payload: {
          status: 'running',
          progress: 0.5,
          completedRenderGroups: 2,
          renderGroupCount: 4,
        },
      });
    });
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));

    expect(getGroupCellForRow(0)).toBe('3/4');
  });

  it('caps the ordinal at the group count when all groups are complete (4 completed of 4 -> 4/4)', async () => {
    render(<LiveOutputTable />);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-grp-3', chapterId: 'ch-1' },
        payload: {
          status: 'done',
          progress: 1.0,
          completedRenderGroups: 4,
          renderGroupCount: 4,
        },
      });
    });
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));

    expect(getGroupCellForRow(0)).toBe('4/4');
  });

  it('shows a dash placeholder when neither index nor completed count is present', async () => {
    render(<LiveOutputTable />);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-grp-4', chapterId: 'ch-1' },
        payload: {
          status: 'running',
          progress: 0.1,
          renderGroupCount: 4,
        },
      });
    });
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(1));

    expect(getGroupCellForRow(0)).toBe('-/4');
  });
});
