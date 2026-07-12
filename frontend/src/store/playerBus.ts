import { useSyncExternalStore } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PlayerScope = 'segment' | 'chapter' | 'preview' | 'book';

export interface PlayerBusState {
  scope: PlayerScope | null;
  title: string;
  subtitle?: string;
  audioUrl: string | null;
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
  onEnded?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onError?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /**
   * Known duration in seconds, supplied by the caller when already available
   * (e.g. backend metadata) so the player never passes through `duration: 0`
   * — the "unknown duration" state that PlayerBar's fitsLegibly() treats as
   * "show the waveform" (see playerRepresentation.ts). Without this, a
   * multi-hour book-scope file goes through that optimistic window until
   * the browser's own <audio> loadedmetadata fires, during which
   * WaveformStrip can start a full wavesurfer decode of the entire file —
   * for a multi-hour audiobook that's enough memory/CPU to hang or crash
   * the tab, not just render briefly wrong. Omit only when the real
   * duration genuinely isn't known yet (segment/chapter playback, where the
   * file is small enough that the bootstrap window is harmless).
   */
  initialDuration?: number;
}

// ---------------------------------------------------------------------------
// Module-scoped private state
// ---------------------------------------------------------------------------

const IDLE_STATE: PlayerBusState = {
  scope: null,
  title: '',
  subtitle: undefined,
  audioUrl: null,
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
    playing: true,
    position: 0,
    duration: opts.initialDuration ?? 0,
    queue: {
      hasPrev: opts.hasPrev ?? false,
      hasNext: opts.hasNext ?? false,
    },
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
