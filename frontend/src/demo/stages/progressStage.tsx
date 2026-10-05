/**
 * progressStage — mounts the real PredictiveProgressBar, driven by
 * chapters.progress / segments.progress bus frames from the demo timeline.
 *
 * A thin adapter subscribes to the studio socket bus and forwards the latest
 * chapter-level progress frame into the bar's props — nothing is mocked, the
 * real animation engine runs.
 */

import React, { useEffect, useState } from 'react';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { subscribeStudioSocketMessages } from '@/store/studioSocketBus';

interface ProgressState {
  progress: number;
  status: string;
  etaSeconds?: number;
  startedAt?: number;
  updatedAt?: number;
}

const DEFAULT_STATE: ProgressState = {
  progress: 0,
  status: 'queued',
};

export const ProgressStageInner: React.FC = () => {
  const [ps, setPs] = useState<ProgressState>(DEFAULT_STATE);

  useEffect(() => {
    return subscribeStudioSocketMessages((data) => {
      const topic = data?.topic;
      if (topic !== 'chapters.progress' && topic !== 'chapters.lifecycle') return;
      const p = data?.payload;
      if (!p) return;
      setPs(prev => ({
        progress: typeof p.progress === 'number' ? p.progress : prev.progress,
        status: p.status ?? prev.status,
        etaSeconds: p.etaSeconds ?? p.eta_seconds,
        startedAt: p.startedAt ?? p.started_at,
        updatedAt: p.updatedAt ?? p.updated_at ?? Date.now() / 1000,
      }));
    });
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2rem',
        background: 'var(--surface)',
        borderRadius: 12,
        border: '1px solid var(--border)',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>
        Chapter 1 — The Lighthouse
      </div>
      <PredictiveProgressBar
        progress={ps.progress}
        status={ps.status}
        etaSeconds={ps.etaSeconds}
        startedAt={ps.startedAt}
        updatedAt={ps.updatedAt}
        showEta
        showPercent
        showLabel
        persistenceKey="demo-chapter-progress"
        allowBackwardProgress={false}
      />
      <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
        Status: <strong>{ps.status}</strong>
        {typeof ps.progress === 'number' && (
          <> · {Math.round(ps.progress * 100)}%</>
        )}
        {ps.etaSeconds != null && <> · ETA {ps.etaSeconds}s</>}
      </div>
    </div>
  );
};
