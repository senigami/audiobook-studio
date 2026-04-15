import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import type { ProcessingQueueItem } from '../types';
import { useWebSocket } from './useWebSocket';
import { isStudioJobEvent } from '../api/contracts/events';
import { createLiveJobsStore } from '../store/live-jobs';
import { createHydrationCoordinator, selectActiveQueueCount } from '../api/hydration';

const FALLBACK_POLL_MS = 60000;

export const useQueueSync = () => {
  const [queue, setQueue] = useState<ProcessingQueueItem[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [isReconnecting, setIsReconnecting] = useState(false);

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
    try {
      const items = await api.getProcessingQueue();
      const snapshot = coordinatorRef.current.createSnapshot(items, source);
      lastSnapshotRef.current = snapshot;
      
      // On reconnect/refresh, prune overlays older than the snapshot (units: seconds)
      if (source !== 'bootstrap') {
        storeRef.current.pruneOlderThan(snapshot.hydratedAt);
      }

      updateDerivedState();
      setLoading(false);
      setIsReconnecting(false);
    } catch (e) {
      console.error(`Failed to refresh queue (${source})`, e);
      setLoading(false);
    }
  }, [updateDerivedState]);

  const onMessage = useCallback((data: any) => {
    if (isStudioJobEvent(data)) {
      storeRef.current.applyEvent(data);
      updateDerivedState();
    }
  }, [updateDerivedState]);

  const { connected } = useWebSocket('/ws', onMessage);

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
    refreshQueue
  };
};
