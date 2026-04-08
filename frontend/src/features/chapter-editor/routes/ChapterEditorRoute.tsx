// Chapter editor route boundary for Studio 2.0.
//
// The editor will become a block-aware production surface, but legacy
// components still own runtime behavior during Phase 1.

import { createEditorSessionStore } from '../../../store/editor-session';
import { createLiveJobsStore } from '../../../store/live-jobs';

export const createChapterEditorRoute = () => {
  // Intended future flow:
  // - hydrate canonical chapter data through feature-level API hooks
  // - layer live job state from the live-jobs store
  // - coordinate local draft state through the editor-session store
  _ = [createEditorSessionStore, createLiveJobsStore];
  return null;
};

const _ = (_value: unknown) => _value;
