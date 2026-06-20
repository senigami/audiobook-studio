import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayerScope = 'segment' | 'chapter' | 'preview';

/** An alternate scope source registered alongside the primary — enables the scope toggle. */
export interface AltScope {
  scope: PlayerScope;
  audioUrl: string;
  title?: string;
  subtitle?: string;
}

export interface PlayerBusState {
  scope: PlayerScope | null;
  title: string;
  subtitle?: string;
  audioUrl: string | null;
  /** When present, a second source the user can switch to via switchScope(). */
  altScope?: AltScope;
  playing: boolean;
  position: number;   // seconds
  duration: number;   // seconds
  queue: { hasPrev: boolean; hasNext: boolean };
  requestId: number;     // increments on every loadAndPlay
  seekRequestId: number; // increments on every seek() call
}

export interface LoadAndPlayOptions {
  scope: PlayerScope;
  title: string;
  subtitle?: string;
  audioUrl: string;
  /** Optional alternate source to register — enables the Segment↔Chapter scope toggle. */
  altScope?: AltScope;
  onEnded?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onError?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

// ---------------------------------------------------------------------------
// Module-scoped private state
// ---------------------------------------------------------------------------

const IDLE_STATE: PlayerBusState = {
  scope: null,
  title: '',
  subtitle: undefined,
  audioUrl: null,
  altScope: undefined,
  playing: false,
  position: 0,
  duration: 0,
  queue: { hasPrev: false, hasNext: false },
  requestId: 0,
  seekRequestId: 0,
};

let state: PlayerBusState = { ...IDLE_STATE, queue: { ...IDLE_STATE.queue } };
let cachedSnapshot: PlayerBusState = state;
let nextRequestId = 1;

const listeners = new Set<() => void>();

let callbacks: {
  onEnded?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onError?: () => void;
} = {};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function notifyListeners(): void {
  cachedSnapshot = { ...state };
  listeners.forEach(l => l());
}

function setState(patch: Partial<PlayerBusState>): void {
  state = { ...state, ...patch };
  notifyListeners();
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function loadAndPlay(opts: LoadAndPlayOptions): void {
  callbacks = {
    onEnded: opts.onEnded,
    onPrev: opts.onPrev,
    onNext: opts.onNext,
    onError: opts.onError,
  };
  setState({
    scope: opts.scope,
    title: opts.title,
    subtitle: opts.subtitle,
    audioUrl: opts.audioUrl,
    altScope: opts.altScope,
    playing: true,
    position: 0,
    duration: 0,
    queue: {
      hasPrev: opts.hasPrev ?? false,
      hasNext: opts.hasNext ?? false,
    },
    requestId: nextRequestId++,
  });
}

/**
 * Swap the active {scope, audioUrl, title, subtitle} with the registered altScope.
 * Bumps requestId so PlayerBar reloads + plays the swapped source.
 * No-op when altScope is undefined.
 */
export function switchScope(): void {
  if (!state.altScope) return;

  const incoming = state.altScope;
  const outgoing: AltScope = {
    scope: state.scope!,
    audioUrl: state.audioUrl!,
    title: state.title,
    subtitle: state.subtitle,
  };

  setState({
    scope: incoming.scope,
    audioUrl: incoming.audioUrl,
    title: incoming.title ?? state.title,
    subtitle: incoming.subtitle,
    altScope: outgoing,
    position: 0,
    duration: 0,
    requestId: nextRequestId++,
  });
}

export function play(): void {
  setState({ playing: true });
}

export function pause(): void {
  setState({ playing: false });
}

export function stop(): void {
  callbacks = {};
  state = { ...IDLE_STATE, queue: { ...IDLE_STATE.queue } };
  notifyListeners();
}

export function seek(seconds: number): void {
  setState({ position: seconds, seekRequestId: state.seekRequestId + 1 });
}

export function skip(deltaSeconds: number): void {
  const next = Math.max(0, Math.min(state.position + deltaSeconds, state.duration || state.position));
  seek(next);
}

export function reportTime(position: number, duration: number): void {
  setState({ position, duration });
}

export function notifyEnded(): void {
  callbacks.onEnded?.();
}

export function notifyError(): void {
  callbacks.onError?.();
}

export function notifyPrev(): void {
  callbacks.onPrev?.();
}

export function notifyNext(): void {
  callbacks.onNext?.();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): PlayerBusState {
  return cachedSnapshot;
}

export function usePlayerBus(): PlayerBusState {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// ---------------------------------------------------------------------------
// Test utilities
// ---------------------------------------------------------------------------

export function resetPlayerBusForTests(): void {
  listeners.clear();
  callbacks = {};
  nextRequestId = 1;
  state = { ...IDLE_STATE, queue: { ...IDLE_STATE.queue } };
  cachedSnapshot = state;
}
