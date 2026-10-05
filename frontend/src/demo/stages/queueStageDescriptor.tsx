/**
 * queueStageDescriptor — stage metadata for queueStage, split out of
 * queueStage.tsx so that file only exports components (react-refresh
 * only-export-components).
 */

import { QueueStageElement } from './queueStage';

export const queueStage = {
  id: 'queue',
  title: 'Global Queue',
  description:
    'Real GlobalQueue component driven by the demo bus — watch Processing Now / Up Next / History react to scripted timeline frames.',
  element: <QueueStageElement />,
};
