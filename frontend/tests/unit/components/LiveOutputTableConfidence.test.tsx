import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { LiveOutputTable } from '@/components/LiveOutputTable';
import { publishStudioSocketMessage } from '@/store/studioSocketBus';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';

beforeEach(() => {
  resetLiveEventAuditForTests();
});

const getConfidenceCellForRow = (rowIndex = 0): string => {
  const rows = screen.getAllByRole('row').slice(1); // skip header
  const row = rows[rowIndex];
  const headers = screen.getAllByRole('columnheader');
  const colIdx = headers.findIndex(h => h.textContent === 'Confidence');
  const cells = row.querySelectorAll('td');
  return cells[colIdx]?.textContent ?? '';
};

describe('LiveOutputTable - confidence column', () => {
  it('displays confidence as percentage when payload.confidence is present', async () => {
    render(<LiveOutputTable />);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        ids: { jobId: 'job-conf-1', chapterId: 'ch-1' },
        payload: {
          status: 'running',
          progress: 0.4, // Job % will be 40%
          confidence: 0.85, // Confidence will be 85%
        },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    });

    const confidenceText = getConfidenceCellForRow(0);
    expect(confidenceText).toBe('85%');
  });

  it('shows — placeholder in confidence column when event type has no confidence', async () => {
    render(<LiveOutputTable />);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'tts.logs',
        eventKind: 'tts_log',
        ids: {},
        payload: {
          line: 'test log line no confidence',
          level: 'INFO',
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByText('test log line no confidence')).toBeInTheDocument();
    });

    const confidenceText = getConfidenceCellForRow(0);
    expect(confidenceText).toBe('-');
  });

  it('shows warning indicator for low confidence values (below 50%)', async () => {
    render(<LiveOutputTable />);

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'jobs.lifecycle',
        eventKind: 'job_lifecycle',
        ids: { jobId: 'job-low-conf' },
        payload: {
          status: 'running',
          progress: 0.1, // Job % = 10%
          confidence: 0.3,  // Confidence = 30% — triggers warning
        },
      });
    });

    await waitFor(() => {
      expect(screen.getAllByRole('row').length).toBeGreaterThan(1);
    });

    const confidenceText = getConfidenceCellForRow(0);
    // formatConfidence renders warning span with emoji + percentage for < 50%
    expect(confidenceText).toContain('30%');
  });
});
