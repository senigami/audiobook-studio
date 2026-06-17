/**
 * Bug B2 regression: consecutive sentence assignments in the same section must not 409.
 *
 * The failure mode: `handleScriptAssign` captures `scriptViewData.base_revision_id` from
 * its `useCallback` closure. After the first assignment the server returns a NEW revision id,
 * but React hasn't re-rendered yet so the closure still holds the old id. A rapid second
 * assignment therefore sends the stale id, triggering a `RevisionMismatch` / 409.
 *
 * Fix: the hook stores the latest revision id in a `useRef`, updated synchronously on each
 * successful response, so consecutive calls always use the most recent revision id.
 */
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChapterAssignments } from '@/hooks/chapter/useChapterAssignments';
import { api } from '@/api';

// Mock only the network boundary (R2 — mock only what is outside the unit under test)
vi.mock('@/api', () => ({
  api: {
    saveScriptAssignments: vi.fn(),
    fetchSegments: vi.fn(),
  },
}));

// Minimal helpers to build typed test payloads
const makeScriptView = (revisionId: string) => ({
  chapter_id: 'ch-1',
  base_revision_id: revisionId,
  paragraphs: [],
  spans: [
    { id: 'span-1', order_index: 0, text: 'Hello.', sanitized_text: 'Hello.', character_id: null, speaker_profile_name: null, status: 'draft', audio_file_path: null, audio_generated_at: null, char_count: 6, sanitized_char_count: 6 },
    { id: 'span-2', order_index: 1, text: 'World.', sanitized_text: 'World.', character_id: null, speaker_profile_name: null, status: 'draft', audio_file_path: null, audio_generated_at: null, char_count: 6, sanitized_char_count: 6 },
  ],
  render_batches: [],
  audio_groups: [],
});

const INITIAL_REV = 'rev-0';
const AFTER_FIRST_REV = 'rev-1';
const AFTER_SECOND_REV = 'rev-2';

describe('useChapterAssignments — consecutive assignment revision tracking (B2)', () => {
  // Shared mock state simulating what the parent component provides
  let scriptViewData: ReturnType<typeof makeScriptView> | null;
  let setScriptViewData: ReturnType<typeof vi.fn>;
  let setSegments: ReturnType<typeof vi.fn>;

  const buildState = () => ({
    scriptViewData,
    setScriptViewData,
    setSegments,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    scriptViewData = makeScriptView(INITIAL_REV);
    setScriptViewData = vi.fn((updater) => {
      if (typeof updater === 'function') {
        scriptViewData = updater(scriptViewData) ?? scriptViewData;
      } else {
        scriptViewData = updater;
      }
    });
    setSegments = vi.fn();

    // fetchSegments always resolves immediately with empty array
    (api.fetchSegments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
  });

  // ---------------------------------------------------------------------------
  // B2 regression: second call must use the revision id returned by the first
  // ---------------------------------------------------------------------------
  it('second handleScriptAssign uses the revision id from the first response, not the initial stale id', async () => {
    // First call returns rev-1; second call returns rev-2
    (api.saveScriptAssignments as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeScriptView(AFTER_FIRST_REV))  // response to first assign
      .mockResolvedValueOnce(makeScriptView(AFTER_SECOND_REV)); // response to second assign

    const { result } = renderHook(() =>
      useChapterAssignments(
        buildState() as any,
        'ch-1',
        [],
        [],
        [],
        vi.fn()
      )
    );

    // First assignment on span-1
    await act(async () => {
      await result.current.handleScriptAssign(['span-1'], 'char-A', null);
    });

    // Verify first call was made with the initial revision id
    expect(api.saveScriptAssignments).toHaveBeenNthCalledWith(
      1,
      'ch-1',
      expect.objectContaining({ base_revision_id: INITIAL_REV })
    );

    // Second assignment on span-2 — must use the revision id from the FIRST response (rev-1),
    // not the original stale value (rev-0). This is the B2 bug: pre-fix code sends rev-0 here.
    await act(async () => {
      await result.current.handleScriptAssign(['span-2'], 'char-B', null);
    });

    expect(api.saveScriptAssignments).toHaveBeenNthCalledWith(
      2,
      'ch-1',
      expect.objectContaining({ base_revision_id: AFTER_FIRST_REV })
    );

    // Both calls should have succeeded (no 409 / onConflict)
    expect(api.saveScriptAssignments).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // Genuine concurrency protection must remain: a truly stale id still 409s
  // ---------------------------------------------------------------------------
  it('still calls onConflict when the server returns 409', async () => {
    const conflictError = Object.assign(new Error('Conflict'), { status: 409 });
    (api.saveScriptAssignments as ReturnType<typeof vi.fn>).mockRejectedValueOnce(conflictError);

    const onConflict = vi.fn();

    const { result } = renderHook(() =>
      useChapterAssignments(
        buildState() as any,
        'ch-1',
        [],
        [],
        [],
        vi.fn()
      )
    );

    await act(async () => {
      await result.current.handleScriptAssign(['span-1'], 'char-A', null, onConflict);
    });

    expect(onConflict).toHaveBeenCalledTimes(1);
    // Should not re-throw or call loadChapter
    expect(api.fetchSegments).not.toHaveBeenCalled();
  });

  // ---------------------------------------------------------------------------
  // Same fix must apply to handleScriptAssignRange
  // ---------------------------------------------------------------------------
  it('second handleScriptAssignRange uses the revision id from the first response', async () => {
    (api.saveScriptAssignments as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(makeScriptView(AFTER_FIRST_REV))
      .mockResolvedValueOnce(makeScriptView(AFTER_SECOND_REV));

    const range = {
      start_span_id: 'span-1',
      start_offset: 0,
      end_span_id: 'span-1',
      end_offset: 3,
    };

    const { result } = renderHook(() =>
      useChapterAssignments(
        buildState() as any,
        'ch-1',
        [],
        [],
        [],
        vi.fn()
      )
    );

    await act(async () => {
      await result.current.handleScriptAssignRange(range, 'char-A', null);
    });

    expect(api.saveScriptAssignments).toHaveBeenNthCalledWith(
      1,
      'ch-1',
      expect.objectContaining({ base_revision_id: INITIAL_REV })
    );

    await act(async () => {
      await result.current.handleScriptAssignRange(range, 'char-B', null);
    });

    expect(api.saveScriptAssignments).toHaveBeenNthCalledWith(
      2,
      'ch-1',
      expect.objectContaining({ base_revision_id: AFTER_FIRST_REV })
    );

    expect(api.saveScriptAssignments).toHaveBeenCalledTimes(2);
  });
});
