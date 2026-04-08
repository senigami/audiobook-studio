// Studio 2.0 route index.
//
// This file will eventually own route-level composition for the new feature-
// first application shell. Phase 1 keeps this as a stub only.

import { createStudioShell } from '../layout/StudioShell';
import { createStudioProviders } from '../providers';
import { createChapterEditorRoute } from '../../features/chapter-editor/routes/ChapterEditorRoute';
import { createProjectLibraryRoute } from '../../features/project-library/routes/ProjectLibraryRoute';
import { createProjectViewRoute } from '../../features/project-view/routes/ProjectViewRoute';
import { createQueueRoute } from '../../features/queue/routes/QueueRoute';
import { createVoiceModulesRoute } from '../../features/settings/voice-modules/routes/VoiceModulesRoute';

export const createStudioRoutes = () => {
  // Intended future flow:
  // - compose providers and shell before route rendering begins
  // - create feature-first route boundaries
  // - compose them under the Studio 2.0 app shell
  _ = [
    createStudioProviders,
    createStudioShell,
    createProjectLibraryRoute,
    createProjectViewRoute,
    createChapterEditorRoute,
    createQueueRoute,
    createVoiceModulesRoute,
  ];
  return [];
};

const _ = (_value: unknown) => _value;
