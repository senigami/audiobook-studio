import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChapterAnalysis } from '@/hooks/useChapterAnalysis';
import { api } from '@/api';

// Mock API
vi.mock('@/api', () => ({
  api: {
    analyzeChapter: vi.fn(),
  },
}));

describe('useChapterAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ voice_chunks: [] }),
    });
  });

  afterEach(() => {
    // Ensure fake timers are always restored to avoid cross-test leakage
    vi.useRealTimers();
  });

  it('runs analysis after debounce when text changes', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(({ text }) => useChapterAnalysis('chap1', text), {
      initialProps: { text: '' }
    });

    expect(result.current.analyzing).toBe(false);

    act(() => {
      rerender({ text: 'Some text' });
    });

    expect(result.current.analyzing).toBe(true);

    // Advance through the 1s debounce and let the mocked fetch resolve.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/analyze_text', expect.objectContaining({
      method: 'POST'
    }));
    expect(result.current.analyzing).toBe(false);
  });

  it('resets analysis to null when text changes back to empty', async () => {
    vi.useFakeTimers();

    const { result, rerender } = renderHook(({ text }) => useChapterAnalysis('chap1', text), {
      initialProps: { text: 'Some text' }
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(result.current.analysis).toEqual({ voice_chunks: [] });

    act(() => {
      rerender({ text: '' });
    });

    // The empty-text branch must clear analysis, not merely leave it unset.
    expect(result.current.analysis).toBeNull();
  });

  it('ensures voice chunks', async () => {
    const { result } = renderHook(() => useChapterAnalysis('chap1', 'text'));
    const handleSave = vi.fn().mockResolvedValue(true);
    const mockData = { voice_chunks: [{ id: 1 }] };
    (api.analyzeChapter as any).mockResolvedValue(mockData);

    await act(async () => {
      await result.current.ensureVoiceChunks(handleSave);
    });

    expect(handleSave).toHaveBeenCalled();
    expect(api.analyzeChapter).toHaveBeenCalledWith('chap1');
    expect(result.current.analysis.voice_chunks).toEqual(mockData.voice_chunks);
  });

  it('aborts previous analysis when running new one', async () => {
    const { result } = renderHook(() => useChapterAnalysis('chap1', 'text'));
    
    // Simulate multiple quick calls to runAnalysis
    await act(async () => {
      result.current.runAnalysis('first');
      result.current.runAnalysis('second');
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
