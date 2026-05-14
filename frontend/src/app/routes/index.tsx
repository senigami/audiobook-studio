// Studio 2.0 route index.
//
// This file will eventually own route-level composition for the new feature-
// first application shell. Phase 1 keeps this as a stub only.

import {
  CHAPTER_NAVIGATION_NODES,
  COMPANION_SURFACES,
  GLOBAL_NAVIGATION_NODES,
  PROJECT_NAVIGATION_NODES,
} from '@/app/navigation/model';
import { createStudioShell } from '@/app/layout/StudioShell';
import { createStudioProviders } from '@/app/providers';
import { createChapterEditorRoute } from '@/pages/ChapterEditor/ChapterEditorRoute';
import { createProjectLibraryRoute } from '@/pages/ProjectLibrary/ProjectLibraryRoute';
import { createProjectViewRoute } from '@/pages/ProjectDetail/ProjectViewRoute';
import { createQueueRoute } from '@/pages/Queue/QueueRoute';
import { createSettingsRoute } from '@/pages/Settings';
import { createVoiceModulesRoute } from '@/pages/VoiceModules/VoiceModulesRoute';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/main.tsx', 'frontend/src/App.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/app/providers/index.tsx',
  'frontend/src/app/layout/StudioShell.tsx',
  'frontend/src/app/navigation/model.ts',
  'frontend/src/features/project-library/routes/ProjectLibraryRoute.tsx',
  'frontend/src/features/project-view/routes/ProjectViewRoute.tsx',
  'frontend/src/features/chapter-editor/routes/ChapterEditorRoute.tsx',
  'frontend/src/features/queue/routes/QueueRoute.tsx',
  'frontend/src/features/settings/routes/SettingsRoute.tsx',
  'frontend/src/features/settings/voice-modules/routes/VoiceModulesRoute.tsx',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/components',
  'frontend/src/hooks',
];

export const createStudioRoutes = () => {
  // Intended future flow:
  // - compose providers and shell before route rendering begins
  // - create feature-first route boundaries
  // - compose them under the Studio 2.0 app shell
  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    GLOBAL_NAVIGATION_NODES,
    PROJECT_NAVIGATION_NODES,
    CHAPTER_NAVIGATION_NODES,
    COMPANION_SURFACES,
    createStudioProviders,
    createStudioShell,
    createProjectLibraryRoute,
    createProjectViewRoute,
    createChapterEditorRoute,
    createQueueRoute,
    createSettingsRoute,
    createVoiceModulesRoute,
  ]);
  return [];
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
