import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/api';
import type { ProcessingQueueItem } from '@/types';
import { recordWebsocketDebugMessage } from '@/utils/runtimeDebug';
import {
  recordLiveEventSubscriberObservation,
  getLiveEventAuditRecordByFrameId,
} from '@/store/liveEventAuditStore';
import { createLiveJobsStore } from '@/store/live-jobs';
import { createHydrationCoordinator, selectActiveQueueCount } from '@/api/hydration';
import { subscribeStudioSocketMessages } from '@/store/studioSocketBus';
import { useStudioSocketConnection } from '@/hooks/useStudioSocketConnection';
import { dispatchQueueEvent, QUEUE_HANDLED_TOPICS } from '@/utils/queueEventDispatcher';
import { pickOverlayFields } from '@/utils/queueOverlayFields';

const FALLBACK_POLL_MS = 60000;
// Grace window for reconnect overlay pruning. Events that arrive on the websocket
// during the reconnect API call have server-side updated_at stamps that may be
// slightly behind the wall-clock time when the API response is received. Subtracting
// this buffer ensures we never prune overlays that are still fresh.
const PRUNE_GRACE_SECONDS = 5;


export const useQueueSync = () => {
  const [queue, setQueue] = useState<ProcessingQueueItem[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [activeSource, setActiveSource] = useState<'bootstrap' | 'terminal' | 'reconnect' | 'refresh' | undefined>(undefined);
  const connected = useStudioSocketConnection();

  // Pure stores initialized once
  const storeRef = useRef(createLiveJobsStore());
  const coordinatorRef = useRef(createHydrationCoordinator());
  const lastConnectedRef = useRef(false);

  // Ref to track the latest canonical items snapshot for derived merges
  const lastSnapshotRef = useRef<any>(null);

  // F3: Buffer events that arrive before the first snapshot lands
  const pendingEventsRef = useRef<Array<() => void>>([]);

  // F4: Hydration generation counter — incremented on each hydration start
  const hydrationGenerationRef = useRef(0);

  const updateDerivedState = useCallback(() => {
    if (!lastSnapshotRef.current) return;
    const merged = coordinatorRef.current.mergeQueueWithOverlays(
      lastSnapshotRef.current,
      storeRef.current.getState()
    );
    setQueue(merged);
    setQueueCount(selectActiveQueueCount(merged));
  }, []);

  const isFirstConnectRef = useRef(true);

  const refreshQueue = useCallback(async (source: 'bootstrap' | 'terminal' | 'reconnect' | 'refresh' = 'refresh') => {
    // F4: Capture and increment the generation counter so concurrent hydrations
    // can detect when a newer one has superseded them.
    hydrationGenerationRef.current += 1;
    const myGeneration = hydrationGenerationRef.current;

    setActiveSource(source);
    try {
      const items = await api.getProcessingQueue();

      // F4: If a newer hydration started after us, discard our result.
      if (myGeneration !== hydrationGenerationRef.current) return;

      const snapshot = coordinatorRef.current.createSnapshot(items, source);
      lastSnapshotRef.current = snapshot;

      // On reconnect only: prune overlays that predate the new snapshot. This clears
      // stale overlays accumulated during a disconnect. We intentionally skip this for
      // 'refresh' (queue_updated-triggered) because the server updated_at timestamps
      // on in-flight events are often slightly behind the wall-clock time at which the
      // API response arrives, causing valid live overlays to be pruned and progress to
      // disappear until the next event arrives.
      if (source === 'reconnect') {
        storeRef.current.pruneOlderThan(snapshot.hydratedAtSeconds - PRUNE_GRACE_SECONDS);
      }

      // F3: Replay any events that arrived while snapshot was null, then clear buffer.
      const buffered = pendingEventsRef.current.splice(0);
      for (const replayFn of buffered) {
        replayFn();
      }

      updateDerivedState();
      setLoading(false);
      setIsReconnecting(false);
    } catch (e) {
      console.error(`Failed to refresh queue (${source})`, e);
      // F3: Hydration failed and lastSnapshotRef is still null, so the buffered
      // events have no snapshot to replay against. Drop them to bound the buffer —
      // a subsequent successful hydration re-reads canonical state and supersedes
      // any incremental events that would have been replayed. Only the latest
      // hydration owns the buffer; older superseded ones must not clear it.
      if (myGeneration === hydrationGenerationRef.current) {
        pendingEventsRef.current.length = 0;
      }
      setLoading(false);
    } finally {
      if (myGeneration === hydrationGenerationRef.current) {
        setActiveSource(undefined);
      }
    }
  }, [updateDerivedState]);

  useEffect(() => {
    return subscribeStudioSocketMessages((data, raw, envelope) => {
      const record = getLiveEventAuditRecordByFrameId(envelope?.frameId);
      if (!record) return;

      const event = record.event;
      const payload = event.payload as any;

      if (!QUEUE_HANDLED_TOPICS.has(event.topic)) return;

      recordWebsocketDebugMessage('useQueueSync', data, raw, envelope);

      // F3: Helper that performs the actual state mutation. When the snapshot
      // has not yet landed we capture it as a closure and push it onto the
      // pending buffer; it will be replayed in order once the snapshot is set.
      const applyEvent = () => {
        const result = dispatchQueueEvent(event, payload, {
          refreshQueue,
          applyJobUpdated: (jobId, updates) => storeRef.current.applyJobUpdated(jobId, updates),
          pickOverlay: pickOverlayFields,
          isHydrated: () => !!lastSnapshotRef.current,
          getSnapshotStatus: (jobId) =>
            lastSnapshotRef.current?.items.find((item: any) => item.id === jobId)?.status,
          getStoreStatus: (jobId) =>
            storeRef.current.getState().eventsById[jobId]?.status,
          isKnownInSnapshot: (jobId) =>
            !!lastSnapshotRef.current?.items.some((item: any) => item.id === jobId),
          isKnownInStore: (jobId) =>
            !!storeRef.current.getState().eventsById[jobId],
          updateDerivedState,
        });

        if (result.action !== 'unhandled' && result.action !== 'skipped') {
          recordLiveEventSubscriberObservation(envelope?.frameId, 'main-queue', 'handled');
        }
      };

      if (!lastSnapshotRef.current) {
        // Snapshot not yet available — buffer the event for replay after hydration.
        pendingEventsRef.current.push(applyEvent);
      } else {
        applyEvent();
      }
    });
  }, [updateDerivedState, refreshQueue]);

  // 1. Bootstrap
  useEffect(() => {
    refreshQueue('bootstrap');
  }, [refreshQueue]);

  // 2. Reconnect & Reconnecting state
  useEffect(() => {
    if (connected && !lastConnectedRef.current) {
      // Avoid redundant refresh on initial mount connection
      if (isFirstConnectRef.current) {
        isFirstConnectRef.current = false;
      } else {
        refreshQueue('reconnect');
      }
    } else if (!connected && lastConnectedRef.current) {
      // Just disconnected
      setIsReconnecting(true);
    }
    lastConnectedRef.current = connected;
  }, [connected, refreshQueue]);

  // 3. Fallback poll while disconnected
  useEffect(() => {
    if (connected) return;
    const interval = setInterval(() => {
      refreshQueue('refresh');
    }, FALLBACK_POLL_MS);
    return () => clearInterval(interval);
  }, [connected, refreshQueue]);

  return {
    queue,
    queueCount,
    loading,
    connected,
    isReconnecting,
    activeSource,
    refreshQueue
  };
};
