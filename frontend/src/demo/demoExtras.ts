/**
 * The pieces only the internal five-stage showcase needs. The public demo build
 * aliases this module to demoExtras.tour.ts so none of it is bundled.
 */
import type React from 'react';
import { demoStages } from './demoStages';
import { demoTimeline } from './scenes';
import { StageIndex as FullStageIndex } from './StageIndex';
import { StyleguidePage as FullStyleguidePage } from './styleguide/StyleguidePage';

export { demoStages, demoTimeline };
export const StyleguidePage: React.ComponentType | null = FullStyleguidePage;
export const StageIndex: React.ComponentType | null = FullStageIndex;
