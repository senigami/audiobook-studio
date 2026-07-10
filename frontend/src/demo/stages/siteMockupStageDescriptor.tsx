/**
 * siteMockupStageDescriptor — stage metadata for siteMockupStage, split out
 * of siteMockupStage.tsx so that file only exports components (react-refresh
 * only-export-components).
 */

import { SiteMockupElement } from './siteMockupStage';

export const siteMockupStage = {
  id: 'site-mockup',
  title: 'Site Mockup — North Star · v3.7 — modular split + Library/Manuscript/Publish/Studio',
  description:
    'Medium-fidelity full-site layout mockup v3.7 — modular split into siteMockup/ submodules. Features: Library grid/list view toggle + ⋯ ActionMenu + New Book modal + Delete confirm; Manuscript "+ New chapter" modal; Publish Assemble selection mode + progress strip + backup row; Studio chapter-nav cluster + Export ▾ + Commit changes + Resync Preview modal + analysis strip (auto-fix badges + expandable ACTION REQUIRED) + hover sentence controls + Stop all. All settings surfaces preserved.',
  element: <SiteMockupElement />,
};
