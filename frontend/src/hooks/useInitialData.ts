import { useState, useEffect, useCallback, useRef } from 'react';
import type { GlobalState } from '../types';

const STARTUP_RETRY_MS = 1000;

const isStartupReady = (data: GlobalState | null) => data?.system_info?.startup_ready !== false;

export const useInitialData = () => {
  const [data, setData] = useState<GlobalState | null>(null);
  const [loading, setLoading] = useState(true);
  const retryTimerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const fetchHome = useCallback(async () => {
    try {
      const res = await fetch('/api/home', { cache: 'no-store' });
      const json = await res.json();
      setData(json);
      const ready = isStartupReady(json);
      setLoading(!ready);
      return ready;
    } catch (e) {
      console.error('Failed to fetch home data', e);
      setLoading(true);
      return false;
    }
  }, []);

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
    };
  }, [fetchHome, clearRetryTimer]);

  return { data, loading, refetch: fetchHome };
};
