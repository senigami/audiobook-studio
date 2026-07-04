import { useState, useEffect, useCallback, useRef } from 'react';
import type { GlobalState } from '@/types';

const STARTUP_RETRY_MS = 1000;
// Debounce window for external refetch calls (reconnect, job completion bursts).
// Multiple calls within this window coalesce into a single fetch.
const REFETCH_DEBOUNCE_MS = 300;

const isStartupReady = (data: GlobalState | null) => data?.system_info?.startup_ready !== false;

export const useInitialData = () => {
  const [data, setData] = useState<GlobalState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const fetchHome = useCallback(async () => {
    try {
      const res = await fetch('/api/home', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`Failed to load application data (HTTP ${res.status})`);
      }
      const json = await res.json();
      setData(json);
      setError(null);
      const ready = isStartupReady(json);
      setLoading(!ready);
      return ready;
    } catch (e) {
      console.error('Failed to fetch home data', e);
      setError(e instanceof Error ? e.message : 'Failed to load application data');
      setLoading(true);
      return false;
    }
  }, []);

  // Debounced refetch for external callers (reconnect, job completion). Rapid
  // back-to-back calls within REFETCH_DEBOUNCE_MS coalesce to a single fetch so
  // a reconnect + simultaneous job-done event doesn't fire two /api/home requests.
  const refetch = useCallback(() => {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      void fetchHome();
    }, REFETCH_DEBOUNCE_MS);
  }, [fetchHome]);

  useEffect(() => {
    cancelledRef.current = false;

    const poll = async () => {
      clearRetryTimer();
      const ready = await fetchHome();
      if (!ready && !cancelledRef.current) {
        retryTimerRef.current = window.setTimeout(() => {
          void poll();
        }, STARTUP_RETRY_MS);
      }
    };

    void poll();

    return () => {
      cancelledRef.current = true;
      clearRetryTimer();
      if (debounceTimerRef.current !== null) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [fetchHome, clearRetryTimer]);

  return { data, loading, error, refetch };
};
