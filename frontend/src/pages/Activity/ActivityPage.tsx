import React, { useMemo } from 'react';
import type { Job, ProcessingQueueItem } from '@/types';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { QueueStats } from '@/components/queue/QueueStats';

export interface ActivityPageProps {
  paused: boolean;
  jobs: Record<string, Job>;
  queue: ProcessingQueueItem[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  connected?: boolean;
  isReconnecting?: boolean;
}

const ActivityPage: React.FC<ActivityPageProps> = ({
  paused,
  jobs,
  queue,
  loading,
  onRefresh,
  connected,
  isReconnecting,
}) => {
  const connectionState = useMemo(() => {
    if (isReconnecting) return 'reconnecting';
    if (connected === false) return 'disconnected';
    return 'connected';
  }, [connected, isReconnecting]);

  return (
    <div className="activity-page" data-connection-state={connectionState}>
      <div className="activity-page__columns">
        <div className="activity-page__main">
          <GlobalQueue
            paused={paused}
            jobs={jobs}
            queue={queue}
            loading={loading}
            onRefresh={onRefresh}
            compact={false}
          />
        </div>

        <aside className="activity-page__stats" aria-label="Activity stats">
          <div className="activity-page__stats-panel">
            <h2 className="activity-page__stats-title">Stats</h2>
            <QueueStats queue={queue} jobs={jobs} />
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ActivityPage;
