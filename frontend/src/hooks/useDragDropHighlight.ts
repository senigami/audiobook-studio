import { useCallback, useRef, useState, type DragEvent } from 'react';

type DropFilesHandler = (files: FileList) => void | Promise<void>;

function hasFileDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes('Files') || dataTransfer.files.length > 0;
}

export function useDragDropHighlight(onDropFiles: DropFilesHandler) {
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDragging(false);
  }, []);

  const onDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!hasFileDrag(event.dataTransfer)) return;
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!hasFileDrag(event.dataTransfer)) return;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const onDrop = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    if (!hasFileDrag(event.dataTransfer)) {
      resetDragState();
      return;
    }
    resetDragState();
    void onDropFiles(event.dataTransfer.files);
  }, [onDropFiles, resetDragState]);

  return {
    isDragging,
    resetDragState,
    dragDropProps: {
      onDragEnter,
      onDragOver,
      onDragLeave,
      onDrop,
    },
  };
}
