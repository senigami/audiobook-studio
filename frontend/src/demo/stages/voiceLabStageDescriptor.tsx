/**
 * voiceLabStageDescriptor — stage metadata for voiceLabStage, split out of
 * voiceLabStage.tsx so that file only exports the component (react-refresh
 * only-export-components).
 */

import { VoiceLabStageInner } from './voiceLabStage';

export const voiceLabStage = {
  id: 'voice-lab',
  title: 'Voice Lab',
  description:
    'Real NarratorCard components showing 4 demo voices — READY, BUILD TO TEST, and NO SAMPLES states with engine badges. Voice previews are silent placeholders.',
  element: <VoiceLabStageInner />,
};
