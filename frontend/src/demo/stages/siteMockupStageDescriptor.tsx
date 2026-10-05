/**
 * siteMockupStageDescriptor — stage metadata for siteMockupStage, split out
 * of siteMockupStage.tsx so that file only exports components (react-refresh
 * only-export-components).
 */

import { SiteMockupElement } from './siteMockupStage';

export const siteMockupStage = {
  id: 'site-mockup',
  title: 'Full app tour — Library, Book, Voices, Studio, and more',
  description:
    'A guided walkthrough of the Audiobook Studio interface: the project Library, the Book pipeline (Contents, Cast, Lexicon, Publish, Backups), the chapter workspace, Voices and Voice Lab, Activity, Engines, Integrations, and Settings — reconciled to match the shipping app, with aspirational North Star surfaces marked "Concept".',
  element: <SiteMockupElement />,
};
