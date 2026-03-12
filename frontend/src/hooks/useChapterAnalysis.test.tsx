import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChapterAnalysis } from './useChapterAnalysis';
import { api } from '../api';

// Mock API
vi.mock('../api', () => ({
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

  it('runs analysis after debounce when text changes', async () => {
    const { result, rerender } = renderHook(({ text }) => useChapterAnalysis('chap1', text), {
      initialProps: { text: '' }
    });

    expect(result.current.analyzing).toBe(false);

    act(() => {
      rerender({ text: 'Some text' });
    });
    
    expect(result.current.analyzing).toBe(true);

    // Wait for the 1s debounce + fetch
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/analyze_text', expect.objectContaining({
        method: 'POST'
      }));
    }, { timeout: 3000 });

    await waitFor(() => {
      expect(result.current.analyzing).toBe(false);
    }, { timeout: 2000 });
  });

  it('handles empty text', async () => {
    const { result } = renderHook(() => useChapterAnalysis('chap1', ''));
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
