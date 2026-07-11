import React, { useMemo, useState } from 'react';
import type { Job, ProcessingQueueItem, TtsEngine } from '@/types';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { QueueStats } from '@/components/queue/QueueStats';
import { EngineCalibrationCard } from '@/pages/Activity/components/EngineCalibrationCard';
import { ProductionTallyCard } from '@/pages/Activity/components/ProductionTallyCard';
import { SegmentRenderMonitor } from '@/components/progress/SegmentRenderMonitor/SegmentRenderMonitor';
import { useDevMode } from '@/utils/devMode';
import { DEV_FIXTURE_RENDER_MONITOR_JOB } from '@/pages/Activity/devSegmentRenderMonitorFixture';

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
  const devMode = useDevMode();
  const connectionState = useMemo(() => {
    if (isReconnecting) return 'reconnecting';
    if (connected === false) return 'disconnected';
    return 'connected';
  }, [connected, isReconnecting]);

  return (
    <div className="activity-page" data-connection-state={connectionState}>
      <div className="activity-page__columns">
        <div className="activity-page__main">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              History
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
          {/*
            TEMPORARY (W-PAR Phase 2 foundation slice, dev-gated): there is no
            real per-segment character-count hydration path into the Activity
            page yet, so this renders a local fixture rather than live segment
            data. Remove the fixture import once real hydration lands and feed
            SegmentRenderMonitor from the actual active job's segment map.
          */}
          {devMode && (
            <div style={{ marginBottom: '1.5rem' }}>
              <SegmentRenderMonitor
                segments={DEV_FIXTURE_RENDER_MONITOR_JOB.segments}
                cap={DEV_FIXTURE_RENDER_MONITOR_JOB.cap}
              />
            </div>
          )}
          <GlobalQueue
            paused={paused}
            jobs={jobs}
            queue={queue}
            loading={loading}
            onRefresh={onRefresh}
            compact={false}
            historyFilter={historyFilter}
          />
        </div>

        <aside className="activity-page__stats" aria-label="Activity stats">
          <div className="activity-page__stats-panel">
            <h2 className="activity-page__stats-title">Stats</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
