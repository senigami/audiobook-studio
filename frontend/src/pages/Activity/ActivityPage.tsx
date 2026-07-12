import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Job, ProcessingQueueItem, TtsEngine } from '@/types';
import { api } from '@/api';
import { GlobalQueue } from '@/components/queue/GlobalQueue';
import { QueueStats } from '@/components/queue/QueueStats';
import { EngineCalibrationCard } from '@/pages/Activity/components/EngineCalibrationCard';
import { ProductionTallyCard } from '@/pages/Activity/components/ProductionTallyCard';
import { SegmentRenderMonitor, FULL_STRIP_MIN } from '@/components/progress/SegmentRenderMonitor/SegmentRenderMonitor';
import { SegmentPeekStrip } from '@/components/progress/SegmentRenderMonitor/SegmentPeekStrip';
import { useDevMode } from '@/utils/devMode';
import { useSegmentInventory } from '@/hooks/useSegmentInventory';
import { isPeekStripDismissed, setPeekStripDismissed } from '@/utils/segmentPeekStripState';

// Task 011: the auto-appear threshold for the Level-2 peek strip — a job
// with fewer than this many segments concurrently *rendering* isn't yet
// showing the parallelism the strip exists to surface. Owner-decided default
// (design-docs/plans/active/parallel-segment-rendering/tasks/011-monitor-peek-strip.md);
// not a settings-exposed threshold (out of scope per the task's "Out of scope").
const PEEK_STRIP_ACTIVE_THRESHOLD = 2;

const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'running', 'finalizing']);
// Best-effort default (task 008): the render fan-out's own default
// `max_concurrent_workers` (segment_synthesis.py) — no real per-job cap is
// plumbed to the frontend yet, so this is a judgment call flagged for
// review, not a fabricated number. Only feeds the monitor's caption text.
const SEGMENT_MONITOR_CAP = 1;

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

  // W-PAR task 008: the currently-active chapter render job (first match) —
  // real segment inventory hydration is scoped to one active job at a time;
  // the popover/peek-strip UI for choosing among several is a later task
  // (010/011), out of scope here.
  const activeJob = useMemo(() => (
    Object.values(jobs).find((j) => ACTIVE_STATUSES.has(j.status) && !!j.chapter_id) ?? null
  ), [jobs]);
  const { segments: inventorySegments } = useSegmentInventory(devMode ? activeJob : null);

  // Task 011 — Level-2 peek strip: auto-appears once ≥2 segments are
  // concurrently rendering for the active job; expands inline (no
  // navigation) to the full SegmentRenderMonitor field on click; dismissal
  // persists per job (localStorage, matching railState.ts's pattern) but a
  // failure always re-surfaces the strip, even across a prior dismiss.
  const jobId = activeJob?.id;
  const [peekDismissed, setPeekDismissedState] = useState(false);
  const [monitorExpanded, setMonitorExpanded] = useState(false);
  useEffect(() => {
    if (!jobId) return;
    setPeekDismissedState(isPeekStripDismissed(jobId));
    setMonitorExpanded(false);
  }, [jobId]);

  const renderingCount = useMemo(
    () => inventorySegments.filter((s) => s.phase === 'rendering').length,
    [inventorySegments],
  );
  const failedCount = useMemo(
    () => inventorySegments.filter((s) => s.phase === 'failed').length,
    [inventorySegments],
  );
  // Only worth surfacing the peek strip if there's actually a full field to
  // expand into (SegmentRenderMonitor itself renders nothing below this
  // segment count — see its own degrade-by-count rule).
  const monitorEligible = devMode && !!activeJob && inventorySegments.length >= FULL_STRIP_MIN;
  const peekEligible = monitorEligible && renderingCount >= PEEK_STRIP_ACTIVE_THRESHOLD;
  // A failure must never be hidden by an earlier dismiss.
  const showPeekStrip = peekEligible && !monitorExpanded && (!peekDismissed || failedCount > 0);
  const showFullMonitor = monitorEligible && (monitorExpanded || !peekEligible);

  const handlePeekExpand = useCallback(() => setMonitorExpanded(true), []);
  const handlePeekDismiss = useCallback(() => {
    setPeekDismissedState(true);
    if (jobId) setPeekStripDismissed(jobId, true);
  }, [jobId]);

  // Task 010 — segment-level retry. `POST /api/segments/generate` (already
  // used by ScriptView/BoothTool/ReviseTool for single-segment re-render) is
  // the only per-segment (re)generation entry point this repo has; there is
  // no server-side "retry" verb, so re-queuing generation for the same
  // segment id IS the retry. Errors are surfaced via console.error only,
  // matching this page's existing lack of a toast/snackbar mechanism —
  // onRefresh() re-pulls job state so the queue reflects the requeue.
  const handleSegmentRetry = useCallback((segmentId: string) => {
    api.generateSegments([segmentId])
      .then(() => onRefresh())
      .catch((e) => console.error('Segment retry failed', e));
  }, [onRefresh]);

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
            W-PAR task 008 (dev-gated): real segment inventory, hydrated from
            the active job's chapter script-view + active_segments_map (see
            useSegmentInventory). The dev-mode gate itself is intentionally
            kept for THIS task — removing it is a later step once this is
            verified live (design-docs/plans/active/parallel-segment-rendering).

            Task 011: progressive disclosure between the two —  the peek
            strip (Level 2) auto-appears once ≥2 segments are concurrently
            rendering, and expands inline to the full field (Level 3) on
            click; below that threshold (or once expanded) the full field
            renders directly, same as before.
          */}
          {showPeekStrip && (
            <div style={{ marginBottom: '1rem' }}>
              <SegmentPeekStrip
                segments={inventorySegments}
                activeCount={renderingCount}
                onExpand={handlePeekExpand}
                onDismiss={handlePeekDismiss}
              />
            </div>
          )}
          {showFullMonitor && (
            <div style={{ marginBottom: '1.5rem' }}>
              <SegmentRenderMonitor
                segments={inventorySegments}
                cap={SEGMENT_MONITOR_CAP}
                onRetry={handleSegmentRetry}
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
