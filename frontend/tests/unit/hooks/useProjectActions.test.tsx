import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectActions } from '@/hooks/useProjectActions';
import { api } from '@/api';
import * as toast from '@/utils/toast';

// Mock API
vi.mock('@/api', () => ({
  api: {
    createChapter: vi.fn(),
    updateProject: vi.fn(),
    deleteChapter: vi.fn(),
    reorderChapters: vi.fn(),
    addProcessingQueue: vi.fn(),
    resetChapter: vi.fn(),
    assembleProject: vi.fn(),
    deleteAudiobook: vi.fn(),
  },
}));

describe('useProjectActions', () => {
  const projectId = 'proj1';
  const onDataRefresh = vi.fn().mockResolvedValue(undefined);
  const navigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it('handles createChapter', async () => {
    (api.createChapter as any).mockResolvedValue({ status: 'success' });
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));

    let success;
    await act(async () => {
      success = await result.current.handleCreateChapter('Title', 'Content', null, 0);
    });

    expect(success).toBe(true);
    expect(api.createChapter).toHaveBeenCalledWith(projectId, {
      title: 'Title',
      text_content: 'Content',
      sort_order: 0,
      file: undefined
    });
    expect(onDataRefresh).toHaveBeenCalled();
  });

  it('shows a toast when createChapter fails', async () => {
    const toastSpy = vi.spyOn(toast, 'emitToast').mockImplementation(() => undefined);
    (api.createChapter as any).mockRejectedValue(new Error('network error'));
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));

    let success;
    await act(async () => {
      success = await result.current.handleCreateChapter('Title', 'Content', null, 0);
    });

    expect(success).toBe(false);
    expect(toastSpy).toHaveBeenCalledWith("Couldn't create chapter. Please try again.");
    expect(onDataRefresh).not.toHaveBeenCalled();
  });

  it('handles updateProject', async () => {
    (api.updateProject as any).mockResolvedValue({ status: 'success' });
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));

    let success;
    await act(async () => {
      success = await result.current.handleUpdateProject({ name: 'New Name', series: 'Series', series_position: 2, author: 'Author' });
    });

    expect(success).toBe(true);
    expect(api.updateProject).toHaveBeenCalledWith(projectId, {
      name: 'New Name',
      series: 'Series',
      series_position: 2,
      author: 'Author',
      cover: undefined
    });
    expect(onDataRefresh).toHaveBeenCalled();
  });

  it('handles deleteChapter', async () => {
    (api.deleteChapter as any).mockResolvedValue({ status: 'success' });
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));

    let success;
    await act(async () => {
      success = await result.current.handleDeleteChapter('chap1');
    });

    expect(success).toBe(true);
    expect(api.deleteChapter).toHaveBeenCalledWith('chap1');
    expect(onDataRefresh).toHaveBeenCalled();
  });

  it('handles reorderChapters with debounce', async () => {
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));
    const chapters = [{ id: 'c1' }, { id: 'c2' }] as any;

    await act(async () => {
      result.current.handleReorderChapters(chapters);
    });

    expect(api.reorderChapters).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(api.reorderChapters).toHaveBeenCalledWith(projectId, ['c1', 'c2']);
  });

  it('handles queueChapter', async () => {
    (api.addProcessingQueue as any).mockResolvedValue({ status: 'success' });
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));

    let success;
    await act(async () => {
      success = await result.current.handleQueueChapter('chap1', 'voice1');
    });

    expect(success).toBe(true);
    expect(api.addProcessingQueue).toHaveBeenCalledWith(projectId, 'chap1', 0, 'voice1', false);
    // A plain queue must NOT reset the chapter (existing segment audio is preserved).
    expect(api.resetChapter).not.toHaveBeenCalled();
    expect(onDataRefresh).toHaveBeenCalled();
  });

  it('rebuild queueChapter resets the chapter and forces re-render', async () => {
    (api.addProcessingQueue as any).mockResolvedValue({ status: 'success' });
    (api.resetChapter as any).mockResolvedValue({ status: 'ok' });
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));

    let success;
    await act(async () => {
      success = await result.current.handleQueueChapter('chap1', 'voice1', true);
    });

    expect(success).toBe(true);
    // Rebuild must clear existing audio first, then queue with force_rerender=true.
    expect(api.resetChapter).toHaveBeenCalledWith('chap1');
    expect(api.addProcessingQueue).toHaveBeenCalledWith(projectId, 'chap1', 0, 'voice1', true);
    expect(onDataRefresh).toHaveBeenCalled();
  });

  it('handles queueAllUnprocessed', async () => {
    (api.addProcessingQueue as any).mockResolvedValue({ status: 'success' });
    const onOpenQueue = vi.fn();
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate, onOpenQueue));
    
    const chapters = [
        { id: 'c1', audio_status: 'unprocessed' },
        { id: 'c2', audio_status: 'done' }
    ] as any;
    const jobs = {};

    let res;
    await act(async () => {
      res = await result.current.handleQueueAllUnprocessed(chapters, jobs);
    });

    expect((res as any).success).toBe(true);
    expect(api.addProcessingQueue).toHaveBeenCalledTimes(1); // Only c1
    expect(api.addProcessingQueue).toHaveBeenCalledWith(projectId, 'c1', 0, undefined);
    expect(onOpenQueue).toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalledWith('/queue');
  });

  it('handles assembleProject', async () => {
    (api.assembleProject as any).mockResolvedValue({ status: 'success' });
    const { result } = renderHook(() => useProjectActions(projectId, onDataRefresh, navigate));

    let success;
    await act(async () => {
      success = await result.current.handleAssembleProject(['c1', 'c2']);
    });

    expect(success).toBe(true);
    expect(api.assembleProject).toHaveBeenCalledWith(projectId, ['c1', 'c2']);
  });
});
