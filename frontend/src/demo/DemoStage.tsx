/**
 * DemoStage — harness that mounts real production components driven by a
 * scripted timeline, with playback controls.
 *
 * All styling uses semantic CSS tokens (var(--...)); no hardcoded colors.
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DemoTimeline } from './scenes/types';
import { useDemoTransport } from './useDemoTransport';

export interface DemoStageProps {
  timeline: DemoTimeline;
  title: string;
  caption?: string;
  autoPlay?: boolean;
  children: React.ReactNode;
}

const SPEEDS = [1, 2, 4] as const;

export const DemoStage: React.FC<DemoStageProps> = ({
  timeline,
  autoPlay = false,
  children,
}) => {
  const { state, controls } = useDemoTransport(timeline, { autoPlay });
  const { playing, rate, sceneIndex, scene, scenePositionMs } = state;

  const progressPct =
    scene && scene.durationMs > 0
      ? Math.min(100, (scenePositionMs / scene.durationMs) * 100)
      : 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--bg)',
        color: 'var(--text-primary)',
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--border)',
      }}
    >
      {/* Live component area */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 0 }}>
        {children}
      </div>

      {/* Control bar */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          background: 'var(--surface)',
          padding: '8px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Scene progress strip */}
        <div
          role="progressbar"
          aria-valuenow={Math.round(progressPct)}
          aria-valuemin={0}
          aria-valuemax={100}
          style={{
            height: 3,
            borderRadius: 2,
            background: 'var(--border)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${progressPct}%`,
              background: 'var(--accent)',
              transition: 'width 0.1s linear',
              borderRadius: 2,
            }}
          />
        </div>

        {/* Controls row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {/* Play / Pause */}
          <button
            type="button"
            aria-label={playing ? 'Pause' : 'Play'}
            onClick={playing ? controls.pause : controls.play}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              padding: '5px 14px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              minWidth: 60,
            }}
          >
            {playing ? 'Pause' : 'Play'}
          </button>

          {/* Restart */}
          <button
            type="button"
            aria-label="Restart"
            onClick={controls.restart}
            style={{
              background: 'none',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '5px 12px',
              fontSize: '0.85rem',
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            Restart
          </button>

          {/* Speed selector */}
          <div style={{ display: 'flex', gap: 4 }}>
            {SPEEDS.map(s => (
              <button
                key={s}
                type="button"
                aria-label={`${s}x speed`}
                aria-pressed={rate === s}
                onClick={() => controls.setRate(s)}
                style={{
                  background: rate === s ? 'var(--accent)' : 'none',
                  color: rate === s ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: '0.78rem',
                  fontWeight: rate === s ? 700 : 400,
                  cursor: 'pointer',
                }}
              >
                {s}×
              </button>
            ))}
          </div>

          {/* Scene chips */}
          <div style={{ display: 'flex', gap: 6, marginLeft: 8, flexWrap: 'wrap' }}>
            {timeline.scenes.map((sc, i) => (
              <button
                key={sc.id}
                type="button"
                aria-label={`Jump to scene: ${sc.title}`}
                aria-pressed={i === sceneIndex}
                onClick={() => controls.jumpToScene(i)}
                style={{
                  background: i === sceneIndex ? 'var(--accent)' : 'var(--surface-alt)',
                  color: i === sceneIndex ? '#fff' : 'var(--text-muted)',
                  border: '1px solid var(--border)',
                  borderRadius: 20,
                  padding: '3px 12px',
                  fontSize: '0.75rem',
                  fontWeight: i === sceneIndex ? 700 : 400,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {sc.title}
              </button>
            ))}
          </div>

          {/* Animated scene caption — right-aligned */}
          <div style={{ flex: 1, minWidth: 0, position: 'relative', height: '1.2em', overflow: 'hidden', marginLeft: 'auto' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={sceneIndex}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.2 }}
                style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: '100%',
                  textAlign: 'right',
                }}
              >
                {scene?.caption ?? ''}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
};
