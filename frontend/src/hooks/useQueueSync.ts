import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@/api';
import type { ProcessingQueueItem } from '@/types';
import { recordWebsocketDebugMessage } from '@/utils/runtimeDebug';
import { isStudioJobEvent } from '@/api/contracts/events';
import { createLiveJobsStore } from '@/store/live-jobs';
import { createHydrationCoordinator, selectActiveQueueCount } from '@/api/hydration';
import { subscribeStudioSocketMessages, type StudioSocketEnvelope } from '@/store/studioSocketBus';
import { useStudioSocketConnection } from '@/hooks/useStudioSocketConnection';

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
  const [activeSource, setActiveSource] = useState<'bootstrap' | 'reconnect' | 'refresh' | undefined>(undefined);
  const connected = useStudioSocketConnection();

  // Pure stores initialized once
  const storeRef = useRef(createLiveJobsStore());
  const coordinatorRef = useRef(createHydrationCoordinator());
  const lastConnectedRef = useRef(false);

  // Ref to track the latest canonical items snapshot for derived merges
  const lastSnapshotRef = useRef<any>(null);

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

  const refreshQueue = useCallback(async (source: 'bootstrap' | 'reconnect' | 'refresh' = 'refresh') => {
    setActiveSource(source);
    try {
      const items = await api.getProcessingQueue();
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


      updateDerivedState();
      setLoading(false);
      setIsReconnecting(false);
    } catch (e) {
      console.error(`Failed to refresh queue (${source})`, e);
      setLoading(false);
    } finally {
      setActiveSource(undefined);
    }
  }, [updateDerivedState]);

  const onMessage = useCallback((data: any, raw?: string, envelope?: StudioSocketEnvelope) => {
    if (isStudioJobEvent(data)) {
      recordWebsocketDebugMessage('useQueueSync', data, raw, envelope);
      storeRef.current.applyEvent(data);
      updateDerivedState();
    } else if (data.type === 'job_updated') {
      recordWebsocketDebugMessage('useQueueSync', data, raw, envelope);
      storeRef.current.applyJobUpdated(data.job_id, data.updates);
      updateDerivedState();
    } else if (data.type === 'queue_updated' || data.type === 'pause_updated') {
      // Record debug message for queue consumer
      recordWebsocketDebugMessage('useQueueSync', data, raw, envelope);
      refreshQueue('refresh');
    }
  }, [updateDerivedState, refreshQueue]);

  useEffect(() => {
    return subscribeStudioSocketMessages((data, raw, envelope) => {
      onMessage(data, raw, envelope);
    });
  }, [onMessage]);

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
