import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectLibrary } from './useProjectLibrary';
import { api } from '../api';
import { MemoryRouter } from 'react-router-dom';

// Mock the API
vi.mock('../api', () => ({
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
      author: '',
      cover: undefined,
    });
    expect(onSelectProject).toHaveBeenCalledWith('new_id');
    expect(mockNavigate).toHaveBeenCalledWith('/project/new_id');
  });

  it('handles delete click and confirmation', async () => {
    (api.fetchProjects as any).mockResolvedValue([{ id: '1', name: 'Project 1' }]);
    (api.deleteProject as any).mockResolvedValue({ status: 'success' });

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

    // Test confirmDelete
    await act(async () => {
      await result.current.confirmDelete();
    });

    expect(api.deleteProject).toHaveBeenCalledWith('1');
    expect(api.fetchProjects).toHaveBeenCalledTimes(2); // Initial + after delete
    expect(result.current.deleteModal.isOpen).toBe(false);
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

  it('handles drag and drop', () => {
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

    act(() => {
      result.current.handleDrop(dropEvent as any);
    });
    expect(result.current.isDragging).toBe(false);
  });
});
