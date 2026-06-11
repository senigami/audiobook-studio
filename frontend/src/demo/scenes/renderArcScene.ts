/**
 * renderArcScene — a realistic ~60 s chapter render dramatising the full
 * mixed-render pipeline across four render groups with different engines and
 * weights.
 *
 * Render group breakdown (weights sum to 1.0):
 *   g0 — XTTS, weight 0.35  (~20 s incl. model-load hold)
 *   g1 — Voxtral, weight 0.10  (~6 s fast)
 *   g2 — XTTS, weight 0.40  (~22 s)
 *   g3 — Voxtral, weight 0.15  (~8 s)
 *
 * Timeline (scene-relative ms):
 *   0       queued
 *   800     preparing
 *   2000    running — group 0 SEGMENT_PENDING + XTTS log lines
 *   5500    group 0 canonical START_SEGMENT
 *   5500–23000  group 0 progress frames (5 steps)
 *   23000   group 0 SEGMENT_SAVED + segmentsLifecycle
 *   23200   group 1 SEGMENT_PENDING (voxtral, fast)
 *   23700   group 1 canonical START_SEGMENT
 *   23700–29500 group 1 progress frames (4 steps)
 *   29500   group 1 SEGMENT_SAVED
 *   29700   group 2 SEGMENT_PENDING (XTTS again, longer)
 *   33200   group 2 canonical START_SEGMENT
 *   33200–52000 group 2 progress frames (5 steps)
 *   52000   group 2 SEGMENT_SAVED
 *   52200   group 3 SEGMENT_PENDING (voxtral)
 *   52700   group 3 canonical START_SEGMENT
 *   52700–57500 group 3 progress frames (4 steps)
 *   57500   group 3 SEGMENT_SAVED
 *   57800   finalizing
 *   59000   done
 */

import type { DemoScene, DemoFrame } from './types';
import {
  queueItemStatus,
  jobLifecycle,
  chapterProgress,
  segmentProgress,
  segmentsLifecycle,
  ttsLog,
} from './frameBuilders';

const JOB_ID = 'demo-job-render-arc';
const CHAPTER_ID = 'demo-chapter-lighthouse';
const PROJECT_ID = 'demo-project-1';
const CHAPTER_TITLE = 'Chapter 1 — The Lighthouse';

const SEGMENT_IDS = [
  'seg-g0-xtts',
  'seg-g1-voxtral',
  'seg-g2-xtts',
  'seg-g3-voxtral',
];

const ids = { jobId: JOB_ID, chapterId: CHAPTER_ID, projectId: PROJECT_ID };

// ---------------------------------------------------------------------------
// Helper: chapter progress frame
// ---------------------------------------------------------------------------
const cp = (
  atMs: number,
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done',
  progress: number,
  completedRenderGroups: number,
  etaSeconds: number | null,
  opts: { reasonCode?: string; message?: string; groupedProgress?: number } = {},
): DemoFrame => ({
  atMs,
  data: chapterProgress({
    ...ids,
    status,
    progress: Math.round(progress * 100) / 100,
    groupedProgress: opts.groupedProgress ?? null,
    etaSeconds,
    renderGroupCount: 4,
    completedRenderGroups,
    reasonCode: opts.reasonCode ?? null,
    message: opts.message ?? null,
  }),
});

// ---------------------------------------------------------------------------
// Helper: segment progress frame
// ---------------------------------------------------------------------------
const sp = (
  atMs: number,
  segIdx: number,
  reasonCode: string,
  activeProgress: number,
  etaSeconds: number | null,
  overallProgress: number,
): DemoFrame => ({
  atMs,
  data: segmentProgress({
    segmentId: SEGMENT_IDS[segIdx],
    ...ids,
    status: reasonCode === 'SEGMENT_SAVED' ? 'done' : reasonCode === 'SEGMENT_PENDING' ? 'preparing' : 'running',
    progress: reasonCode === 'SEGMENT_SAVED' ? 1 : overallProgress,
    segmentIndex: segIdx,
    segmentCount: 4,
    reasonCode,
    activeSegmentId: SEGMENT_IDS[segIdx],
    activeSegmentProgress: activeProgress,
    etaSeconds,
  }),
});

// ---------------------------------------------------------------------------
// Helper: queue status frame
// ---------------------------------------------------------------------------
const qs = (
  atMs: number,
  status: 'queued' | 'preparing' | 'running' | 'finalizing' | 'done',
  progress: number,
  etaSeconds: number | null,
  opts: { message?: string } = {},
): DemoFrame => ({
  atMs,
  data: queueItemStatus({
    ...ids,
    status,
    progress: Math.round(progress * 100) / 100,
    etaSeconds,
    customTitle: CHAPTER_TITLE,
    engine: 'mixed',
    message: opts.message ?? null,
  }),
});

// ---------------------------------------------------------------------------
// Helper: tts log frame
// ---------------------------------------------------------------------------
const log = (atMs: number, line: string, pluginId?: string): DemoFrame => ({
  atMs,
  data: ttsLog({ ...ids, line, pluginId: pluginId ?? null }),
});

// ---------------------------------------------------------------------------
// Build frames
// ---------------------------------------------------------------------------

const frames: DemoFrame[] = [
  // 0ms — queued
  qs(0, 'queued', 0, 59),
  cp(0, 'queued', 0, 0, 59, { reasonCode: 'JOB_QUEUED' }),

  // 800ms — preparing
  qs(800, 'preparing', 0, 58, { message: 'Preparing synthesis resources...' }),
  cp(800, 'preparing', 0, 0, 58, { reasonCode: 'JOB_PREPARING', message: 'Preparing synthesis resources...' }),

  // 2000ms — running, group 0: XTTS SEGMENT_PENDING
  qs(2000, 'running', 0, 57),
  cp(2000, 'running', 0, 0, 57, { reasonCode: 'SEGMENT_PENDING' }),
  sp(2000, 0, 'SEGMENT_PENDING', 0, null, 0),
  log(2100, '[START_SEGMENT] seg-g0-xtts — group 0/4 (XTTS)', 'tts_xtts'),
  log(2200, 'Loading XTTS model weights...', 'tts_xtts'),
  log(3100, 'XTTS model ready.', 'tts_xtts'),

  // 5500ms — group 0 canonical START_SEGMENT
  sp(5500, 0, 'START_SEGMENT', 0, 18, 0),
  cp(5500, 'running', 0, 0, 55, { reasonCode: 'START_SEGMENT' }),
  log(5500, '[START_SEGMENT] confirmed, ETA ~18s', 'tts_xtts'),

  // group 0 progress steps (5 steps over ~17 s)
  sp(8500, 0, 'SEGMENT_PROGRESS', 0.18, 15, 0.06),
  cp(8500, 'running', 0.06, 0, 52, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.18 }),
  qs(8500, 'running', 0.06, 52),

  sp(11500, 0, 'SEGMENT_PROGRESS', 0.38, 11, 0.13),
  cp(11500, 'running', 0.13, 0, 48, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.38 }),
  qs(11500, 'running', 0.13, 48),

  sp(14500, 0, 'SEGMENT_PROGRESS', 0.58, 8, 0.20),
  cp(14500, 'running', 0.20, 0, 44, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.58 }),
  qs(14500, 'running', 0.20, 44),

  sp(17500, 0, 'SEGMENT_PROGRESS', 0.78, 5, 0.27),
  cp(17500, 'running', 0.27, 0, 40, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.78 }),
  qs(17500, 'running', 0.27, 40),

  sp(20500, 0, 'SEGMENT_PROGRESS', 0.93, 2, 0.33),
  cp(20500, 'running', 0.33, 0, 37, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.93 }),
  qs(20500, 'running', 0.33, 37),

  // 23000ms — group 0 SEGMENT_SAVED
  sp(23000, 0, 'SEGMENT_SAVED', 1, null, 0.35),
  { atMs: 23000, data: segmentsLifecycle(ids) },
  cp(23000, 'running', 0.35, 1, 36, { reasonCode: 'SEGMENT_SAVED' }),
  qs(23000, 'running', 0.35, 36),

  // 23200ms — group 1: Voxtral SEGMENT_PENDING (fast)
  sp(23200, 1, 'SEGMENT_PENDING', 0, null, 0.35),
  cp(23200, 'running', 0.35, 1, 35, { reasonCode: 'SEGMENT_PENDING' }),
  log(23200, '[START_SEGMENT] seg-g1-voxtral — group 1/4 (Voxtral)', 'tts_voxtral'),

  // 23700ms — group 1 canonical START_SEGMENT (voxtral is fast — no model-load hold)
  sp(23700, 1, 'START_SEGMENT', 0, 6, 0.35),
  cp(23700, 'running', 0.35, 1, 35, { reasonCode: 'START_SEGMENT' }),

  // group 1 progress (4 steps, ~5.5 s)
  sp(24900, 1, 'SEGMENT_PROGRESS', 0.25, 5, 0.37),
  cp(24900, 'running', 0.37, 1, 34, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.25 }),
  qs(24900, 'running', 0.37, 34),

  sp(26100, 1, 'SEGMENT_PROGRESS', 0.50, 3, 0.40),
  cp(26100, 'running', 0.40, 1, 33, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.50 }),
  qs(26100, 'running', 0.40, 33),

  sp(27500, 1, 'SEGMENT_PROGRESS', 0.75, 2, 0.43),
  cp(27500, 'running', 0.43, 1, 32, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.75 }),
  qs(27500, 'running', 0.43, 32),

  sp(28800, 1, 'SEGMENT_PROGRESS', 0.92, 1, 0.44),
  cp(28800, 'running', 0.44, 1, 31, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.92 }),
  qs(28800, 'running', 0.44, 31),

  // 29500ms — group 1 SEGMENT_SAVED
  sp(29500, 1, 'SEGMENT_SAVED', 1, null, 0.45),
  { atMs: 29500, data: segmentsLifecycle(ids) },
  cp(29500, 'running', 0.45, 2, 30, { reasonCode: 'SEGMENT_SAVED' }),
  qs(29500, 'running', 0.45, 30),

  // 29700ms — group 2: XTTS SEGMENT_PENDING (heaviest group)
  sp(29700, 2, 'SEGMENT_PENDING', 0, null, 0.45),
  cp(29700, 'running', 0.45, 2, 29, { reasonCode: 'SEGMENT_PENDING' }),
  log(29700, '[START_SEGMENT] seg-g2-xtts — group 2/4 (XTTS)', 'tts_xtts'),
  log(29800, 'Loading XTTS model weights...', 'tts_xtts'),
  log(31000, 'XTTS model ready.', 'tts_xtts'),

  // 33200ms — group 2 canonical START_SEGMENT
  sp(33200, 2, 'START_SEGMENT', 0, 20, 0.45),
  cp(33200, 'running', 0.45, 2, 27, { reasonCode: 'START_SEGMENT' }),
  log(33200, '[START_SEGMENT] confirmed, ETA ~20s', 'tts_xtts'),

  // group 2 progress (5 steps, ~18 s)
  sp(36700, 2, 'SEGMENT_PROGRESS', 0.18, 17, 0.51),
  cp(36700, 'running', 0.51, 2, 24, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.18 }),
  qs(36700, 'running', 0.51, 24),

  sp(39700, 2, 'SEGMENT_PROGRESS', 0.38, 13, 0.60),
  cp(39700, 'running', 0.60, 2, 21, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.38 }),
  qs(39700, 'running', 0.60, 21),

  sp(42700, 2, 'SEGMENT_PROGRESS', 0.58, 9, 0.68),
  cp(42700, 'running', 0.68, 2, 17, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.58 }),
  qs(42700, 'running', 0.68, 17),

  sp(46000, 2, 'SEGMENT_PROGRESS', 0.78, 6, 0.76),
  cp(46000, 'running', 0.76, 2, 13, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.78 }),
  qs(46000, 'running', 0.76, 13),

  sp(49500, 2, 'SEGMENT_PROGRESS', 0.93, 2, 0.83),
  cp(49500, 'running', 0.83, 2, 9, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.93 }),
  qs(49500, 'running', 0.83, 9),

  // 52000ms — group 2 SEGMENT_SAVED
  sp(52000, 2, 'SEGMENT_SAVED', 1, null, 0.85),
  { atMs: 52000, data: segmentsLifecycle(ids) },
  cp(52000, 'running', 0.85, 3, 8, { reasonCode: 'SEGMENT_SAVED' }),
  qs(52000, 'running', 0.85, 8),

  // 52200ms — group 3: Voxtral SEGMENT_PENDING
  sp(52200, 3, 'SEGMENT_PENDING', 0, null, 0.85),
  cp(52200, 'running', 0.85, 3, 7, { reasonCode: 'SEGMENT_PENDING' }),
  log(52200, '[START_SEGMENT] seg-g3-voxtral — group 3/4 (Voxtral)', 'tts_voxtral'),

  // 52700ms — group 3 canonical START_SEGMENT
  sp(52700, 3, 'START_SEGMENT', 0, 5, 0.85),
  cp(52700, 'running', 0.85, 3, 7, { reasonCode: 'START_SEGMENT' }),

  // group 3 progress (4 steps, ~4.5 s)
  sp(53500, 3, 'SEGMENT_PROGRESS', 0.22, 4, 0.88),
  cp(53500, 'running', 0.88, 3, 6, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.22 }),
  qs(53500, 'running', 0.88, 6),

  sp(54500, 3, 'SEGMENT_PROGRESS', 0.48, 3, 0.92),
  cp(54500, 'running', 0.92, 3, 5, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.48 }),
  qs(54500, 'running', 0.92, 5),

  sp(55700, 3, 'SEGMENT_PROGRESS', 0.72, 2, 0.96),
  cp(55700, 'running', 0.96, 3, 3, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.72 }),
  qs(55700, 'running', 0.96, 3),

  sp(57000, 3, 'SEGMENT_PROGRESS', 0.92, 1, 0.99),
  cp(57000, 'running', 0.99, 3, 1, { reasonCode: 'SEGMENT_PROGRESS', groupedProgress: 0.92 }),
  qs(57000, 'running', 0.99, 1),

  // 57500ms — group 3 SEGMENT_SAVED (all 4 groups done)
  sp(57500, 3, 'SEGMENT_SAVED', 1, null, 1),
  { atMs: 57500, data: segmentsLifecycle(ids) },
  cp(57500, 'running', 1, 4, 2, { reasonCode: 'SEGMENT_SAVED' }),
  qs(57500, 'running', 1, 2),

  // 57800ms — finalizing
  qs(57800, 'finalizing', 1, 1, { message: 'Stitching chapter audio...' }),
  cp(57800, 'finalizing', 1, 4, 1, { reasonCode: 'JOB_FINALIZING', message: 'Stitching chapter audio...' }),

  // 59000ms — done
  qs(59000, 'done', 1, null),
  cp(59000, 'done', 1, 4, null, { reasonCode: 'JOB_DONE' }),
  {
    atMs: 59000,
    data: jobLifecycle({
      ...ids,
      status: 'done',
      reasonCode: 'JOB_DONE',
      message: null,
    }),
  },
];

export const renderArcScene: DemoScene = {
  id: 'render-arc',
  title: 'Chapter render',
  caption: 'Watch a mixed XTTS + Voxtral chapter render in real time',
  durationMs: 60000,
  frames,
};

// ---------------------------------------------------------------------------
// queueFillScene — three jobs appearing in the Up Next queue over ~6 s
// ---------------------------------------------------------------------------

const Q_JOBS = [
  { jobId: 'demo-q-1', chapterId: 'demo-ch-q1', title: 'Chapter 2 — The Storm', engine: 'xtts' },
  { jobId: 'demo-q-2', chapterId: 'demo-ch-q2', title: 'Chapter 3 — First Light', engine: 'voxtral' },
  { jobId: 'demo-q-3', chapterId: 'demo-ch-q3', title: 'Chapter 4 — The Return', engine: 'mixed' },
];

const queueFillFrames: DemoFrame[] = Q_JOBS.flatMap((j, i) => [
  {
    atMs: i * 2000,
    data: queueItemStatus({
      jobId: j.jobId,
      projectId: PROJECT_ID,
      chapterId: j.chapterId,
      status: 'queued',
      progress: 0,
      etaSeconds: 60 + i * 15,
      customTitle: j.title,
      engine: j.engine,
    }),
  },
  {
    atMs: i * 2000,
    data: chapterProgress({
      jobId: j.jobId,
      chapterId: j.chapterId,
      projectId: PROJECT_ID,
      status: 'queued',
      progress: 0,
      etaSeconds: 60 + i * 15,
      renderGroupCount: null,
      completedRenderGroups: 0,
      reasonCode: 'JOB_QUEUED',
    }),
  },
]);

export const queueFillScene: DemoScene = {
  id: 'queue-fill',
  title: 'Queue fill',
  caption: 'Jobs queued up and waiting',
  durationMs: 7000,
  frames: queueFillFrames,
};

// ---------------------------------------------------------------------------
// historyScene — two jobs completing quickly (simulate history flush)
// ---------------------------------------------------------------------------

const H_JOBS = [
  { jobId: 'demo-h-1', chapterId: 'demo-ch-h1', title: 'Chapter 5 — Epilogue', engine: 'xtts' },
  { jobId: 'demo-h-2', chapterId: 'demo-ch-h2', title: 'Chapter 6 — Afterword', engine: 'voxtral' },
];

const historyFrames: DemoFrame[] = H_JOBS.flatMap((j, i) => [
  {
    atMs: i * 3000,
    data: queueItemStatus({
      jobId: j.jobId,
      projectId: PROJECT_ID,
      chapterId: j.chapterId,
      status: 'done',
      progress: 1,
      etaSeconds: null,
      customTitle: j.title,
      engine: j.engine,
    }),
  },
  {
    atMs: i * 3000,
    data: jobLifecycle({
      jobId: j.jobId,
      projectId: PROJECT_ID,
      chapterId: j.chapterId,
      status: 'done',
      reasonCode: 'JOB_DONE',
    }),
  },
]);

export const historyScene: DemoScene = {
  id: 'history',
  title: 'History',
  caption: 'Completed jobs in the render history',
  durationMs: 8000,
  frames: historyFrames,
};
