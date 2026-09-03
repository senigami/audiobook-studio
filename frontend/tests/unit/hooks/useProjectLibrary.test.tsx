import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { api } from '@/api';
import { MemoryRouter } from 'react-router-dom';
import * as toast from '@/utils/toast';

// Mock the API
vi.mock('@/api', () => ({
  api: {
    fetchProjects: vi.fn(),
    createProject: vi.fn(),
    deleteProject: vi.fn(),
  },
}));

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

describe('useProjectLibrary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter>{children}</MemoryRouter>
  );

  it('loads projects on mount', async () => {
    const mockProjects = [{ id: '1', name: 'Project 1' }];
    (api.fetchProjects as any).mockResolvedValue(mockProjects);

    const { result } = renderHook(() => useProjectLibrary(), { wrapper });

    expect(result.current.loading).toBe(true);
    
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.projects).toEqual(mockProjects);
  });

  it('handles project creation', async () => {
    (api.fetchProjects as any).mockResolvedValue([]);
    (api.createProject as any).mockResolvedValue({ status: 'success', project_id: 'new_id' });
    
    const onSelectProject = vi.fn();
    const { result } = renderHook(() => useProjectLibrary(onSelectProject), { wrapper });

    act(() => {
      result.current.setTitle('New Project');
    });

    await act(async () => {
      await result.current.handleCreateProject({ preventDefault: vi.fn() } as any);
    });

    expect(api.createProject).toHaveBeenCalledWith({
      name: 'New Project',
      series: '',
      series_position: null,
      author: '',
      cover: undefined,
    });
    expect(onSelectProject).toHaveBeenCalledWith('new_id');
    expect(mockNavigate).toHaveBeenCalledWith('/project/new_id');
  });

  it('rejects invalid series positions before project creation', async () => {
    (api.fetchProjects as any).mockResolvedValue([]);
    const toastSpy = vi.spyOn(toast, 'emitToast').mockImplementation(() => undefined);

    const onSelectProject = vi.fn();
    const { result } = renderHook(() => useProjectLibrary(onSelectProject), { wrapper });

    act(() => {
      result.current.setTitle('New Project');
      result.current.setSeriesPosition('NaN');
    });

    await act(async () => {
      await result.current.handleCreateProject({ preventDefault: vi.fn() } as any);
    });

    expect(toastSpy).toHaveBeenCalledWith('Series position must be a whole number.');
    expect(api.createProject).not.toHaveBeenCalled();
    expect(onSelectProject).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('handles delete click and confirmation — defers the actual delete behind an undo toast', async () => {
    (api.fetchProjects as any).mockResolvedValue([{ id: '1', name: 'Project 1' }]);
    (api.deleteProject as any).mockResolvedValue({ status: 'success' });
    const toastSpy = vi.spyOn(toast, 'emitToast').mockImplementation(() => undefined);

    const { result } = renderHook(() => useProjectLibrary(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));

    // Test handleDeleteClick
    act(() => {
      result.current.handleDeleteClick('1', 'Project 1');
    });

    expect(result.current.deleteModal).toEqual({
      isOpen: true,
      projectId: '1',
      projectName: 'Project 1',
    });

    // Test confirmDelete — closes the modal immediately, but defers the
    // actual delete request behind an undo toast.
    vi.useFakeTimers();
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(result.current.deleteModal.isOpen).toBe(false);
    expect(api.deleteProject).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith(
      'Project deleted.',
      expect.objectContaining({ label: 'Undo', onClick: expect.any(Function) })
    );

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(api.deleteProject).toHaveBeenCalledWith('1');
    expect(api.fetchProjects).toHaveBeenCalledTimes(2); // Initial + after delete
  });

  it('cancels the deferred project delete when Undo is clicked', async () => {
    (api.fetchProjects as any).mockResolvedValue([{ id: '1', name: 'Project 1' }]);
    (api.deleteProject as any).mockResolvedValue({ status: 'success' });
    const toastSpy = vi.spyOn(toast, 'emitToast').mockImplementation(() => undefined);

    const { result } = renderHook(() => useProjectLibrary(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.handleDeleteClick('1', 'Project 1');
    });

    vi.useFakeTimers();
    await act(async () => {
      await result.current.confirmDelete();
    });

    const [, action] = toastSpy.mock.calls[toastSpy.mock.calls.length - 1];
    (action as any).onClick();

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(api.deleteProject).not.toHaveBeenCalled();
    expect(api.fetchProjects).toHaveBeenCalledTimes(1); // Initial load only
  });

  it('handles file selection and preview', async () => {
    const { result } = renderHook(() => useProjectLibrary(), { wrapper });
    const file = new File(['(⌐□_□)'], 'chucknorris.png', { type: 'image/png' });
    
    const readAsDataURLSpy = vi.spyOn(FileReader.prototype, 'readAsDataURL');

    act(() => {
      result.current.handleFileSelection(file);
    });

    expect(readAsDataURLSpy).toHaveBeenCalledWith(file);
    
    // We can't easily wait for the reader result in renderHook without a way to observe the state change
    await waitFor(() => {
      expect(result.current.coverPreview).toBeDefined();
    });
  });

  it('handles drag and drop', async () => {
    const { result } = renderHook(() => useProjectLibrary(), { wrapper });
    const preventDefault = vi.fn();

    act(() => {
      result.current.handleDragOver({ preventDefault } as any);
    });
    expect(result.current.isDragging).toBe(true);
    expect(preventDefault).toHaveBeenCalled();

    act(() => {
      result.current.handleDragLeave({ preventDefault } as any);
    });
    expect(result.current.isDragging).toBe(false);

    const file = new File(['(⌐□_□)'], 'cover.png', { type: 'image/png' });
    const dropEvent = {
      preventDefault,
      dataTransfer: {
        files: [file]
      }
    };

    await act(async () => {
      result.current.handleDrop(dropEvent as any);
    });

    await waitFor(() => {
      expect(result.current.isDragging).toBe(false);
      expect(result.current.coverPreview).toBeDefined();
    });
  });

  it('surfaces existing series and auto-suggests the next position', async () => {
    (api.fetchProjects as any).mockResolvedValue([
      { id: '1', name: 'Book One', series: 'Chronicles', series_position: 1, created_at: 1, updated_at: 1 },
      { id: '2', name: 'Book Two', series: 'Chronicles', series_position: 2, created_at: 2, updated_at: 2 },
      { id: '3', name: 'Standalone', series: null, series_position: null, created_at: 3, updated_at: 3 },
    ]);

    const { result } = renderHook(() => useProjectLibrary(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.existingSeries).toEqual(['Chronicles']);

    act(() => {
      result.current.setSeries('Chronicles');
    });

    await waitFor(() => {
      expect(result.current.seriesPosition).toBe('3');
    });
  });
});
