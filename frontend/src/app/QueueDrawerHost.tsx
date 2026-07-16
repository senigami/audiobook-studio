import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Drawer } from '@/pages/Voices/components/VoiceUtils';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import type { Job, ProcessingQueueItem } from '@/types';

/**
 * Owns the queue-drawer open/closed state and the `/queue` route redirect
 * (visiting `/queue` opens the drawer over whatever page was already showing
 * instead of navigating to a dedicated route).
 */
export function useQueueDrawer() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const prevPathRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname === '/queue') {
      setIsOpen(true);
      const target = prevPathRef.current === '/queue' ? '/' : prevPathRef.current;
      navigate(target, { replace: true });
    } else {
      prevPathRef.current = location.pathname;
    }
  }, [location.pathname, navigate]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  return { isOpen, open, close, toggle };
}

interface QueueDrawerHostProps {
  isOpen: boolean;
  onClose: () => void;
  paused: boolean;
  jobs?: Record<string, Job>;
  queue: ProcessingQueueItem[];
  loading: boolean;
  onRefresh: () => void;
}

export function QueueDrawerHost({ isOpen, onClose, paused, jobs, queue, loading, onRefresh }: QueueDrawerHostProps) {
  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Processing Queue">
      <GlobalQueue
        paused={paused}
        jobs={jobs}
        queue={queue}
        loading={loading}
        onRefresh={onRefresh}
        compact={true}
      />
    </Drawer>
  );
}
