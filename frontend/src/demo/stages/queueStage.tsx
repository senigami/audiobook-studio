/**
 * queueStage — mounts the real GlobalQueue driven by useQueueSync.
 *
 * useQueueSync handles live bus frames (queue.items / jobs.lifecycle) so the
 * demo timeline frames will drive Processing Now / Up Next / History sections.
 * The demo REST shim stubs /api/processing_queue so bootstrap hydration works
 * without a real backend.
 *
 * GlobalQueue requires no router context itself but useQueueSync indirectly
 * imports hooks that may; we wrap in MemoryRouter to be safe.
 */

import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { useQueueSync } from '@/hooks/useQueueSync';

const QueueStageInner: React.FC = () => {
  const { queue, loading } = useQueueSync();

  return (
    <GlobalQueue
      queue={queue}
      loading={loading}
      compact={false}
    />
  );
};

export const QueueStageElement: React.FC = () => (
  <MemoryRouter>
    <QueueStageInner />
  </MemoryRouter>
);
