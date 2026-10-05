/**
 * progressStageDescriptor — stage metadata for progressStage, split out of
 * progressStage.tsx so that file only exports the component (react-refresh
 * only-export-components).
 */

import { ProgressStageInner } from './progressStage';

export const progressStage = {
  id: 'progress',
  title: 'Chapter Progress',
  description:
    'Real PredictiveProgressBar driven by chapters.progress bus frames from the demo timeline. Shows interpolated fill, ETA confidence, and status transitions.',
  element: <ProgressStageInner />,
};
