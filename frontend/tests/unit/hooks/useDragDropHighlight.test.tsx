import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useDragDropHighlight } from '@/hooks/useDragDropHighlight';

describe('useDragDropHighlight', () => {
  it('ignores non-file drags', () => {
    const onDropFiles = vi.fn();
    const { result } = renderHook(() => useDragDropHighlight(onDropFiles));
    const preventDefault = vi.fn();

    act(() => {
      result.current.dragDropProps.onDragEnter({
        preventDefault,
        dataTransfer: { types: ['text/plain'], files: [] },
      } as any);
      result.current.dragDropProps.onDragOver({
        preventDefault,
        dataTransfer: { types: ['text/plain'], files: [] },
      } as any);
    });

    expect(result.current.isDragging).toBe(false);

    act(() => {
      result.current.dragDropProps.onDrop({
        preventDefault,
        dataTransfer: { types: ['text/plain'], files: [] },
      } as any);
    });

    expect(onDropFiles).not.toHaveBeenCalled();
    expect(result.current.isDragging).toBe(false);
  });

  it('tracks drag state, handles nested enters, and forwards dropped files', async () => {
    const onDropFiles = vi.fn();
    const { result } = renderHook(() => useDragDropHighlight(onDropFiles));
    const file = new File(['content'], 'chapter.txt', { type: 'text/plain' });
    const preventDefault = vi.fn();
    const fileDrag = { types: ['Files'], files: [file] };

    act(() => {
      result.current.dragDropProps.onDragEnter({ preventDefault, dataTransfer: fileDrag } as any);
      result.current.dragDropProps.onDragEnter({ preventDefault, dataTransfer: fileDrag } as any);
    });

    expect(result.current.isDragging).toBe(true);

    act(() => {
      result.current.dragDropProps.onDragLeave({ preventDefault, dataTransfer: fileDrag } as any);
    });

    expect(result.current.isDragging).toBe(true);

    await act(async () => {
      result.current.dragDropProps.onDrop({
        preventDefault,
        dataTransfer: fileDrag,
      } as any);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(onDropFiles).toHaveBeenCalledWith([file]);
    expect(result.current.isDragging).toBe(false);
  });
});
