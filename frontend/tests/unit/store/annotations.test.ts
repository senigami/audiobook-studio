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

  it('updates an existing annotation and updatedAt changes', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);

    saveAnnotation('chapter-1', 'seg-1', 'First note');
    const firstTime = getAnnotations('chapter-1')[0].updatedAt;

    // Advance the clock to ensure Date.now() ticks forward before the update.
    vi.setSystemTime(1_000_005);

    saveAnnotation('chapter-1', 'seg-1', 'Updated note');
    const annotations = getAnnotations('chapter-1');
    expect(annotations).toHaveLength(1);
    expect(annotations[0].notes).toBe('Updated note');
    expect(annotations[0].updatedAt).toBeGreaterThan(firstTime);

    vi.useRealTimers();
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

  it('keeps independent notes for same segmentId across different chapters (B1 collision guard)', () => {
    saveAnnotation('chapter-A', 'seg-1', 'Note from chapter A');
    saveAnnotation('chapter-B', 'seg-1', 'Note from chapter B');

    const annotsA = getAnnotations('chapter-A');
    const annotsB = getAnnotations('chapter-B');

    // Each chapter should have exactly one note
    expect(annotsA).toHaveLength(1);
    expect(annotsA[0].notes).toBe('Note from chapter A');
    expect(annotsA[0].chapterId).toBe('chapter-A');

    expect(annotsB).toHaveLength(1);
    expect(annotsB[0].notes).toBe('Note from chapter B');
    expect(annotsB[0].chapterId).toBe('chapter-B');
  });

  it('deleting a segment note in one chapter leaves the same segmentId in another chapter intact', () => {
    saveAnnotation('chapter-A', 'seg-1', 'Note from chapter A');
    saveAnnotation('chapter-B', 'seg-1', 'Note from chapter B');

    deleteAnnotation('chapter-A', 'seg-1');

    expect(getAnnotations('chapter-A')).toHaveLength(0);
    expect(getAnnotations('chapter-B')).toHaveLength(1);
    expect(getAnnotations('chapter-B')[0].notes).toBe('Note from chapter B');
  });
});
