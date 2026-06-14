import { useSyncExternalStore, useMemo } from 'react';

export interface Annotation {
  segmentId: string;
  chapterId: string;
  notes: string;
  updatedAt: number;
}

const STORAGE_KEY = 'audiobook-factory:annotations';

let memoryCache: Record<string, Annotation> = {};
let lastSerialized = '';

const listeners = new Set<() => void>();

const emptyObject = {};

function loadFromStorage(): Record<string, Annotation> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return emptyObject;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (lastSerialized !== '') {
        memoryCache = emptyObject;
        lastSerialized = '';
      }
      return memoryCache;
    }
    if (raw !== lastSerialized) {
      memoryCache = JSON.parse(raw);
      lastSerialized = raw;
    }
    return memoryCache;
  } catch (err) {
    console.error('Failed to load annotations from localStorage:', err);
    return memoryCache;
  }
}

function saveToStorage(data: Record<string, Annotation>) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, raw);
    memoryCache = data;
    lastSerialized = raw;
  } catch (err) {
    console.error('Failed to save annotations to localStorage:', err);
  }
}

export function getSnapshot(): Record<string, Annotation> {
  return loadFromStorage();
}

export function getAnnotations(chapterId: string): Annotation[] {
  const all = getSnapshot();
  return Object.values(all)
    .filter((anno) => anno.chapterId === chapterId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveAnnotation(chapterId: string, segmentId: string, notes: string): void {
  const all = { ...getSnapshot() };
  all[segmentId] = {
    chapterId,
    segmentId,
    notes,
    updatedAt: Date.now(),
  };
  saveToStorage(all);
  emit();
}

export function deleteAnnotation(_chapterId: string, segmentId: string): void {
  const all = { ...getSnapshot() };
  if (all[segmentId]) {
    delete all[segmentId];
    saveToStorage(all);
    emit();
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function useAnnotations(chapterId: string): Annotation[] {
  const all = useSyncExternalStore(subscribe, getSnapshot);
  return useMemo(() => {
    return Object.values(all)
      .filter((anno) => anno.chapterId === chapterId)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [all, chapterId]);
}
