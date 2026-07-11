/**
 * TEMPORARY dev fixture for the SegmentRenderMonitor foundation slice
 * (W-PAR Phase 2, design-docs/plans/TASKS.md).
 *
 * There is no real per-segment character-count hydration path into the
 * Activity page yet — that's a separate, out-of-scope backend/hydration
 * change. This fixture exists only so the dev-gated integration in
 * ActivityPage.tsx is visually verifiable. Delete this file (and the
 * ActivityPage wiring that imports it) once real segment data is threaded
 * through from `job.active_segments_map` (see useStudioChapter.ts for the
 * equivalent chapter-editor consumption pattern).
 */
import type { SegmentRenderMonitorSegment } from '@/components/progress/SegmentRenderMonitor/SegmentRenderMonitor';

const segments: SegmentRenderMonitorSegment[] = [
  { id: 'seg-1', charCount: 320, phase: 'done', progress: 1, engineId: 'xtts' },
  { id: 'seg-2', charCount: 280, phase: 'done', progress: 1, engineId: 'xtts' },
  { id: 'seg-3', charCount: 410, phase: 'done', progress: 1, engineId: 'xtts' },
  { id: 'seg-4', charCount: 190, phase: 'done', progress: 1, engineId: 'voxtral' },
  { id: 'seg-5', charCount: 340, phase: 'done', progress: 1, engineId: 'voxtral' },
  { id: 'seg-6', charCount: 250, phase: 'done', progress: 1, engineId: 'xtts' },
  { id: 'seg-7', charCount: 300, phase: 'done', progress: 1, engineId: 'xtts' },
  { id: 'seg-8', charCount: 275, phase: 'done', progress: 1, engineId: 'voxtral' },
  { id: 'seg-9', charCount: 60, phase: 'rendering', progress: 0.7, engineId: 'xtts' },
  { id: 'seg-10', charCount: 355, phase: 'rendering', progress: 0.35, engineId: 'voxtral' },
  { id: 'seg-11', charCount: 420, phase: 'rendering', progress: 0.15, engineId: 'xtts' },
  { id: 'seg-12', charCount: 45, phase: 'failed', progress: 0.5, engineId: 'xtts' },
  { id: 'seg-13', charCount: 380, phase: 'preparing', progress: 0, engineId: 'voxtral' },
  { id: 'seg-14', charCount: 210, phase: 'preparing', progress: 0 },
];

export const DEV_FIXTURE_RENDER_MONITOR_JOB = {
  segments,
  cap: 3,
};
