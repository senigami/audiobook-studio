/**
 * useDemoTransport — replays a DemoTimeline through the real socket bus.
 *
 * Uses a single setInterval (~100ms) to advance position; publishes frames
 * whose atMs has been crossed since the last tick. No per-frame timeouts.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DemoTimeline, DemoScene } from '@/demo/scenes/types';
import {
  publishStudioSocketMessage,
  setStudioSocketConnected,
} from '@/store/studioSocketBus';
import { jobsSnapshot } from '@/demo/scenes/frameBuilders';

// ---------------------------------------------------------------------------
// Types (public contract — slice 3 depends on these shapes)
// ---------------------------------------------------------------------------

export interface DemoTransportState {
  playing: boolean;
  rate: number; // 1 | 2 | 4
  sceneIndex: number;
  scene: DemoScene | null;
  scenePositionMs: number;
  looping: boolean;
}

export interface DemoTransportControls {
  play(): void;
  pause(): void;
  restart(): void;
  setRate(rate: number): void;
  jumpToScene(index: number): void;
  setLooping(looping: boolean): void;
}

// ---------------------------------------------------------------------------
// Clean-reset frame helpers
// ---------------------------------------------------------------------------

const QUEUE_INVALIDATED_FRAME = {
  type: 'studio_event' as const,
  version: 1 as const,
  topic: 'queue.items',
  eventKind: 'queue_item_invalidated',
  ids: {},
  payload: { reasonCode: 'QUEUE_INVALIDATED', changedFields: [] },
};

const publishCleanReset = () => {
  publishStudioSocketMessage(jobsSnapshot([]));
  publishStudioSocketMessage(QUEUE_INVALIDATED_FRAME);
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const TICK_MS = 100;

export function useDemoTransport(
  timeline: DemoTimeline,
  opts?: { autoPlay?: boolean },
): { state: DemoTransportState; controls: DemoTransportControls } {
  const autoPlay = opts?.autoPlay ?? false;

  const [state, setState] = useState<DemoTransportState>({
    playing: false,
    rate: 1,
    sceneIndex: 0,
    scene: timeline.scenes[0] ?? null,
    scenePositionMs: 0,
    looping: true,
  });

  // Mutable refs so the interval closure doesn't need to change on every state update
  const playingRef = useRef(false);
  const rateRef = useRef(1);
  const sceneIndexRef = useRef(0);
  const scenePositionMsRef = useRef(0);
  const loopingRef = useRef(true);
  // Tracks which frame index (within current scene) we have published up to
  const nextFrameIdxRef = useRef(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync refs → state helper (called from interval, should only flush visible changes)
  const flushState = useCallback(() => {
    setState(prev => {
      const sceneIndex = sceneIndexRef.current;
      const scene = timeline.scenes[sceneIndex] ?? null;
      const scenePositionMs = scenePositionMsRef.current;
      const playing = playingRef.current;
      const rate = rateRef.current;
      const looping = loopingRef.current;

      if (
        prev.playing === playing &&
        prev.rate === rate &&
        prev.sceneIndex === sceneIndex &&
        prev.scene === scene &&
        prev.scenePositionMs === scenePositionMs &&
        prev.looping === looping
      ) {
        return prev;
      }
      return { playing, rate, sceneIndex, scene, scenePositionMs, looping };
    });
  }, [timeline]);

  // Move to a scene (by ref mutation only — state flush happens on next tick or explicitly)
  const gotoScene = useCallback(
    (index: number, publishReset: boolean) => {
      if (publishReset) {
        publishCleanReset();
      }
      sceneIndexRef.current = index;
      scenePositionMsRef.current = 0;
      nextFrameIdxRef.current = 0;
    },
    [],
  );

  // Main tick
  const tick = useCallback(() => {
    if (!playingRef.current) return;

    const advanceMs = TICK_MS * rateRef.current;
    const prevPosition = scenePositionMsRef.current;
    const newPosition = prevPosition + advanceMs;

    const sceneIdx = sceneIndexRef.current;
    const scene = timeline.scenes[sceneIdx];
    if (!scene) return;

    // Publish all frames whose atMs is in [prevPosition, newPosition)
    // (nextFrameIdxRef tracks first unpublished frame)
    const frames = scene.frames;
    let fi = nextFrameIdxRef.current;
    while (fi < frames.length && frames[fi].atMs <= newPosition) {
      publishStudioSocketMessage(frames[fi].data);
      fi++;
    }
    nextFrameIdxRef.current = fi;

    // Check scene end
    if (newPosition >= scene.durationMs) {
      const nextSceneIdx = sceneIdx + 1;
      if (nextSceneIdx < timeline.scenes.length) {
        // Advance to next scene
        gotoScene(nextSceneIdx, false);
        scenePositionMsRef.current = 0;
      } else {
        // End of timeline
        if (loopingRef.current) {
          publishCleanReset();
          gotoScene(0, false);
        } else {
          playingRef.current = false;
          scenePositionMsRef.current = scene.durationMs;
        }
      }
    } else {
      scenePositionMsRef.current = newPosition;
    }

    flushState();
  }, [timeline, gotoScene, flushState]);

  // Start / stop interval
  const startInterval = useCallback(() => {
    if (intervalRef.current != null) return;
    intervalRef.current = setInterval(tick, TICK_MS);
  }, [tick]);

  const stopInterval = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Mount / unmount
  useEffect(() => {
    setStudioSocketConnected(true);

    if (autoPlay) {
      playingRef.current = true;
      startInterval();
      flushState();
    }

    return () => {
      stopInterval();
      setStudioSocketConnected(false);
    };
  }, []); // mount/unmount only — intentionally empty deps

  // Controls
  const play = useCallback(() => {
    if (playingRef.current) return;
    playingRef.current = true;
    startInterval();
    flushState();
  }, [startInterval, flushState]);

  const pause = useCallback(() => {
    if (!playingRef.current) return;
    playingRef.current = false;
    stopInterval();
    flushState();
  }, [stopInterval, flushState]);

  const restart = useCallback(() => {
    stopInterval();
    publishCleanReset();
    gotoScene(0, false);
    playingRef.current = false;
    flushState();
  }, [stopInterval, gotoScene, flushState]);

  const setRate = useCallback(
    (rate: number) => {
      rateRef.current = rate;
      flushState();
    },
    [flushState],
  );

  const jumpToScene = useCallback(
    (index: number) => {
      const clampedIndex = Math.max(0, Math.min(index, timeline.scenes.length - 1));
      stopInterval();
      gotoScene(clampedIndex, true);
      playingRef.current = false;
      flushState();
    },
    [timeline, stopInterval, gotoScene, flushState],
  );

  const setLooping = useCallback(
    (looping: boolean) => {
      loopingRef.current = looping;
      flushState();
    },
    [flushState],
  );

  const controls: DemoTransportControls = { play, pause, restart, setRate, jumpToScene, setLooping };

  return { state, controls };
}
