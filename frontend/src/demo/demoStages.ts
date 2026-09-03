/**
 * demoStages — the ordered list of demo stage descriptors, split out of
 * DemoApp.tsx so that file only exports the DemoApp component
 * (react-refresh only-export-components).
 */

import { liveOutputStage } from './stages/liveOutputStage';
import { queueStage } from './stages/queueStageDescriptor';
import { progressStage } from './stages/progressStageDescriptor';
import { voiceLabStage } from './stages/voiceLabStageDescriptor';
import { siteMockupStage } from './stages/siteMockupStageDescriptor';

export const demoStages = [siteMockupStage, liveOutputStage, queueStage, progressStage, voiceLabStage];
