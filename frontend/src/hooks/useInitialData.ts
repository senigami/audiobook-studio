import { useState, useEffect, useCallback } from 'react';
import type { GlobalState } from '../types';

export const useInitialData = () => {
  const [data, setData] = useState<GlobalState | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHome = useCallback(async () => {
    try {
      const res = await fetch('/api/home', { cache: 'no-store' });
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error('Failed to fetch home data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHome();
  }, [fetchHome]);

  return { data, loading, refetch: fetchHome };
};
