import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  getAnnotations,
  saveAnnotation,
  deleteAnnotation,
  subscribe,
  getSnapshot,
  useAnnotations,
} from '@/store/annotations';

describe('annotations store', () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset any internal state/listeners if the store keeps local memory
    // (We will export a reset function or reset it by clearing localStorage)
  });

  it('starts with empty annotations', () => {
    const annotations = getAnnotations('chapter-1');
    expect(annotations).toEqual([]);
    expect(getSnapshot()).toEqual({});
  });

  it('can save and retrieve an annotation', () => {
    saveAnnotation('chapter-1', 'seg-1', 'This is a test note');
    
    const annotations = getAnnotations('chapter-1');
    expect(annotations).toHaveLength(1);
    expect(annotations[0]).toMatchObject({
      chapterId: 'chapter-1',
      segmentId: 'seg-1',
      notes: 'This is a test note',
    });
    expect(typeof annotations[0].updatedAt).toBe('number');
  });

  it('updates an existing annotation and updatedAt changes', async () => {
    saveAnnotation('chapter-1', 'seg-1', 'First note');
    const firstTime = getAnnotations('chapter-1')[0].updatedAt;

    // Small delay to ensure timestamp changes if based on Date.now()
    await new Promise((resolve) => setTimeout(resolve, 5));

    saveAnnotation('chapter-1', 'seg-1', 'Updated note');
    const annotations = getAnnotations('chapter-1');
    expect(annotations).toHaveLength(1);
    expect(annotations[0].notes).toBe('Updated note');
    expect(annotations[0].updatedAt).toBeGreaterThan(firstTime);
  });

  it('can delete an annotation', () => {
    saveAnnotation('chapter-1', 'seg-1', 'To be deleted');
    expect(getAnnotations('chapter-1')).toHaveLength(1);

    deleteAnnotation('chapter-1', 'seg-1');
    expect(getAnnotations('chapter-1')).toHaveLength(0);
  });

  it('supports subscribers and triggers on changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    saveAnnotation('chapter-1', 'seg-1', 'Trigger listener');
    expect(listener).toHaveBeenCalledTimes(1);

    deleteAnnotation('chapter-1', 'seg-1');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    saveAnnotation('chapter-1', 'seg-2', 'No trigger');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('provides a react hook useAnnotations', () => {
    const { result } = renderHook(() => useAnnotations('chapter-1'));
    expect(result.current).toEqual([]);

    act(() => {
      saveAnnotation('chapter-1', 'seg-1', 'Hook note');
    });

    expect(result.current).toHaveLength(1);
    expect(result.current[0].notes).toBe('Hook note');

    act(() => {
      deleteAnnotation('chapter-1', 'seg-1');
    });

    expect(result.current).toEqual([]);
  });
});
