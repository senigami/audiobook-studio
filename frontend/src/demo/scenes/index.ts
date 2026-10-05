export { renderArcScene, queueFillScene, historyScene } from './renderArcScene';
export { compileTimeline } from './types';
export type { DemoFrame, DemoScene, DemoTimeline } from './types';

import { compileTimeline } from './types';
import { queueFillScene, renderArcScene, historyScene } from './renderArcScene';

export const demoScenes = [queueFillScene, renderArcScene, historyScene];

export const demoTimeline = compileTimeline(demoScenes);
