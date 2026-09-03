import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { useChapterText } from '@/pages/Book/lib/useChapterText';
import type { Chapter } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchChapter: vi.fn(),
    updateChapter: vi.fn(),
    addProcessingQueue: vi.fn(),
  },
}));

const draftChapter: Chapter = {
  id: 'ch-1',
  project_id: 'book-1',
  title: 'Draft Chapter',
  text_content: 'Original text',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'unprocessed',
  audio_file_path: null,
  text_last_modified: null,
  audio_generated_at: null,
  char_count: 13,
  word_count: 2,
  sent_count: 1,
  predicted_audio_length: null,
  audio_length_seconds: 0,
  total_segments_count: 0,
  done_segments_count: 0,
};

const producedChapter: Chapter = {
  ...draftChapter,
  id: 'ch-produced',
  audio_status: 'done',
  has_wav: true,
  text_content: 'Produced text',
};

describe('useChapterText — flush on unmount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchChapter).mockResolvedValue(draftChapter);
    vi.mocked(api.updateChapter).mockResolvedValue({
      status: 'ok',
      chapter: { ...draftChapter, text_content: 'Updated text' },
    });
    vi.mocked(api.addProcessingQueue).mockResolvedValue({ status: 'ok' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('flushes a pending save via api.updateChapter when unmounted before the debounce fires', async () => {
    vi.useFakeTimers();

    const { result, unmount } = renderHook(() => useChapterText(draftChapter));

    // Wait for initial fetchChapter to settle.
    await act(async () => {});

    // Trigger a text change so hasTextChanges becomes true.
    act(() => {
      result.current.setText('Updated text');
    });

    // The debounce timer (1500ms) has NOT elapsed yet — do not advance timers.
    expect(api.updateChapter).not.toHaveBeenCalled();

    // Unmount before the debounce fires.
    unmount();

    // The flush must have fired the save synchronously in the cleanup.
    expect(api.updateChapter).toHaveBeenCalledTimes(1);
    expect(api.updateChapter).toHaveBeenCalledWith('ch-1', { text_content: 'Updated text' });
  });

  it('does NOT double-save when the debounce already completed before unmount', async () => {
    vi.useFakeTimers();

    const { result, unmount } = renderHook(() => useChapterText(draftChapter));
    await act(async () => {});

    act(() => {
      result.current.setText('Updated text');
    });

    // Let the debounced save complete normally.
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(api.updateChapter).toHaveBeenCalledTimes(1);

    // Now unmount — there should be no second call.
    unmount();

    expect(api.updateChapter).toHaveBeenCalledTimes(1);
  });

  it('does NOT flush for produced chapters on unmount', async () => {
    vi.useFakeTimers();
    vi.mocked(api.fetchChapter).mockResolvedValue(producedChapter);

    const { result, unmount } = renderHook(() => useChapterText(producedChapter));
    await act(async () => {});

    // Produced chapters: isProduced = true, autosave is gated off.
    // setText would change text but the autosave effect bails early.
    act(() => {
      result.current.setText('Tampered text');
    });

    unmount();

    // No flush should have happened.
    expect(api.updateChapter).not.toHaveBeenCalled();
  });
});

describe('useChapterText — confirmResync queue submission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchChapter).mockResolvedValue(producedChapter);
    vi.mocked(api.updateChapter).mockResolvedValue({
      status: 'ok',
      chapter: { ...producedChapter, text_content: 'Resynced text' },
    });
    vi.mocked(api.addProcessingQueue).mockResolvedValue({ status: 'ok' });
  });

  it('re-queues the chapter (forced rebuild) after a successful resync save', async () => {
    const { result } = renderHook(() => useChapterText(producedChapter));
    await act(async () => {});

    act(() => {
      result.current.setText('Resynced text');
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.confirmResync();
    });

    expect(success).toBe(true);
    expect(api.updateChapter).toHaveBeenCalledWith('ch-produced', { text_content: 'Resynced text' });
    expect(api.addProcessingQueue).toHaveBeenCalledWith(
      producedChapter.project_id,
      producedChapter.id,
      0,
      producedChapter.speaker_profile_name || undefined,
      true,
    );
  });

  it('still resolves true when the queue re-submission fails, but logs the error', async () => {
    vi.mocked(api.addProcessingQueue).mockRejectedValue(new Error('queue unavailable'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() => useChapterText(producedChapter));
    await act(async () => {});

    act(() => {
      result.current.setText('Resynced text');
    });

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.confirmResync();
    });

    expect(success).toBe(true);
    expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to queue chapter after resync', expect.any(Error));
    consoleErrorSpy.mockRestore();
  });
});
