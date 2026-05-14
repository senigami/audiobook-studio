import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { recordStudioDebugSnapshot, shouldEnableStudioDebugLogging } from '@/utils/runtimeDebug';

describe('shouldEnableStudioDebugLogging', () => {
  const originalLocalStorage = window.localStorage;

  beforeEach(() => {
    const storageState = new Map<string, string>();
    const fakeLocalStorage = {
      getItem: (key: string) => storageState.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storageState.set(key, value);
      },
      removeItem: (key: string) => {
        storageState.delete(key);
      },
      clear: () => {
        storageState.clear();
      },
    } as Storage;

    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: fakeLocalStorage,
    });
    delete (window as any).__studioDebugSnapshots;
    delete (window as any).__studioDebugLast;
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: originalLocalStorage,
    });
    delete (window as any).__studioDebugSnapshots;
    delete (window as any).__studioDebugLast;
    window.history.replaceState({}, '', '/');
  });

  it('returns false by default', () => {
    expect(shouldEnableStudioDebugLogging()).toBe(false);
  });

  it('returns true when localStorage studioDebug is enabled', () => {
    window.localStorage.setItem('studioDebug', '1');

    expect(shouldEnableStudioDebugLogging()).toBe(true);
  });

  it('returns true when debug query param is present', () => {
    window.history.replaceState({}, '', '/?debug=1');

    expect(shouldEnableStudioDebugLogging()).toBe(true);
  });

  it('returns true when studioDebug query param is present', () => {
    window.history.replaceState({}, '', '/?studioDebug=true');

    expect(shouldEnableStudioDebugLogging()).toBe(true);
  });

  it('stores snapshots in the global debug buffer when enabled', () => {
    window.localStorage.setItem('studioDebug', '1');

    recordStudioDebugSnapshot('chapter', { chapterId: 'chap-1', status: 'processing' });

    expect((window as any).__studioDebugSnapshots).toHaveLength(1);
    expect((window as any).__studioDebugSnapshots[0]).toMatchObject({
      tag: 'chapter',
      payload: { chapterId: 'chap-1', status: 'processing' },
    });
    expect((window as any).__studioDebugLast).toMatchObject({
      tag: 'chapter',
      payload: { chapterId: 'chap-1', status: 'processing' },
    });
  });
});
