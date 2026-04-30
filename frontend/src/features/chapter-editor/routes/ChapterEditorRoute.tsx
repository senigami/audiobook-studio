// Chapter editor route boundary for Studio 2.0.
//
// The editor will become a block-aware production surface, but legacy
// components still own runtime behavior during Phase 1.

import { createHydrationCoordinator } from '../../../api/hydration';
import { createEditorSessionStore } from '../../../store/editor-session';
import { createLiveJobsStore } from '../../../store/live-jobs';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/hydration/index.ts',
  'frontend/src/store/editor-session.ts',
  'frontend/src/store/live-jobs.ts',
  'frontend/src/app/navigation/breadcrumbs.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/store/notifications.ts',
  'frontend/src/components/ChapterEditor.tsx',
];

export const createChapterEditorRoute = () => {
  // Intended future flow:
  // - hydrate canonical chapter data before local route rendering
  // - preserve breadcrumb context back to project overview
  // - layer live job state from the live-jobs store
  // - coordinate local draft state through the editor-session store
  // - support next/previous chapter movement without losing local session context
  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createHydrationCoordinator,
    createEditorSessionStore,
    createLiveJobsStore,
  ]);
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
