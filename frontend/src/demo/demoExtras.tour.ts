/** Tour-only stand-in for demoExtras.ts: the app tour, no scenes, no styleguide. */
import type React from 'react';
import type { demoStages as FullStages } from './demoExtras';
import type { DemoTimeline } from './scenes/types';
import { siteMockupStage } from './stages/siteMockupStageDescriptor';

export const demoStages: typeof FullStages = [siteMockupStage];
export const demoTimeline: DemoTimeline = { scenes: [], totalMs: 0 };
export const StyleguidePage: React.ComponentType | null = null;
