import React, { useMemo, useState } from 'react';
import type { Job, ProcessingQueueItem, TtsEngine } from '@/types';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { QueueStats } from '@/components/queue/QueueStats';
import { EngineCalibrationCard } from '@/pages/Activity/components/EngineCalibrationCard';
import { ProductionTallyCard } from '@/pages/Activity/components/ProductionTallyCard';
import { SystemResourceStrip } from '@/pages/Activity/components/SystemResourceStrip';
import { useSystemResourceSamples } from '@/hooks/useSystemResourceSamples';
import { useEngineConcurrency } from '@/hooks/useEngineConcurrency';

export interface ActivityPageProps {
  paused: boolean;
  jobs: Record<string, Job>;
  queue: ProcessingQueueItem[];
  engines: TtsEngine[];
  loading: boolean;
  onRefresh: () => void | Promise<void>;
  connected?: boolean;
  isReconnecting?: boolean;
}

const HISTORY_FILTERS = ['All', 'Renders', 'Samples', 'API'] as const;

const ActivityPage: React.FC<ActivityPageProps> = ({
  paused,
  jobs,
  queue,
  engines,
  loading,
  onRefresh,
  connected,
  isReconnecting,
}) => {
  const [historyFilter, setHistoryFilter] = useState<(typeof HISTORY_FILTERS)[number]>('All');
  const { samples: resourceSamples, hasVram } = useSystemResourceSamples();
  const { engineCaps } = useEngineConcurrency();

  const connectionState = useMemo(() => {
    if (isReconnecting) return 'reconnecting';
    if (connected === false) return 'disconnected';
    return 'connected';
  }, [connected, isReconnecting]);

  // History filter chip row (All/Renders/Samples/API). Rendered by GlobalQueue
  // directly above the "Completed / Failed History" section it filters —
  // design-review fix: it previously sat at the top of the page, above the
  // "Global Queue" title, disconnected from the section it controls.
  const historyFilterControls = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 'var(--space-4)' }}>
      <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
        Filter
      </span>
      {HISTORY_FILTERS.map((filter) => {
        const active = historyFilter === filter;
        return (
          <button
            key={filter}
            type="button"
            aria-pressed={active}
            onClick={() => setHistoryFilter(filter)}
            style={{
              padding: '0.45rem 0.8rem',
              borderRadius: '9999px',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              background: active ? 'var(--accent-glow)' : 'var(--surface)',
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: active ? 'var(--shadow-sm)' : 'none',
            }}
          >
            {filter}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="activity-page" data-connection-state={connectionState}>
      <div className="activity-page__columns">
        <div className="activity-page__main">
          {/*
            W-PAR task 015: per-job segment peek strip / render monitor now
            mount inside QueueItem.tsx (one instance per concurrently-active
            job row), not here at page level — see QueueItem.tsx and
            useSegmentInventory. Previously (tasks 008/011) this page picked
            a single "first active job" and rendered one strip for it, which
            hid segment detail for every other job rendering at the same
            time.
          */}
          <GlobalQueue
            paused={paused}
            jobs={jobs}
            queue={queue}
            loading={loading}
            onRefresh={onRefresh}
            compact={false}
            historyFilter={historyFilter}
            historyFilterControls={historyFilterControls}
            engineCaps={engineCaps}
          />
        </div>

        <aside className="activity-page__stats" aria-label="Activity stats">
          <div className="activity-page__stats-panel">
            <h2 className="activity-page__stats-title">Stats</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <SystemResourceStrip
                samples={resourceSamples}
                hasVram={hasVram}
                loading={resourceSamples.length === 0}
              />
              <QueueStats queue={queue} jobs={jobs} />
              <EngineCalibrationCard engines={engines} />
              <ProductionTallyCard />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default ActivityPage;
