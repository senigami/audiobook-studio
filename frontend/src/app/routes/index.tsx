// Studio 2.0 route index.
//
// This file will eventually own route-level composition for the new feature-
// first application shell. Phase 1 keeps this as a stub only.

import { createChapterEditorRoute } from '../../features/chapter-editor/routes/ChapterEditorRoute';
import { createQueueRoute } from '../../features/queue/routes/QueueRoute';

export const createStudioRoutes = () => {
  // Intended future flow:
  // - create feature-first route boundaries
  // - compose them under the Studio 2.0 app shell
  _ = [createChapterEditorRoute, createQueueRoute];
  return [];
};

const _ = (_value: unknown) => _value;
