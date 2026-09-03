// Editor session store for Studio 2.0.
//
// This store will own local draft state, selection, and other transient editor
// session data without becoming a second database.

const INTENDED_UPSTREAM_CALLERS = [
  'frontend/src/features/chapter-editor/routes/ChapterEditorRoute.tsx',
];
const INTENDED_DOWNSTREAM_DEPENDENCIES: string[] = [];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/api/queries',
  'frontend/src/store/live-jobs.ts',
];

export interface EditorSessionStore {
  selectedBlockIds: string[];
  setSelectedBlockIds: (ids: string[]) => void;
  clear: () => void;
}

export const createEditorSessionStore = (): EditorSessionStore => ({
  selectedBlockIds: [],
  setSelectedBlockIds: (_ids) => {
    consumeContractMarkers([
      INTENDED_UPSTREAM_CALLERS,
      INTENDED_DOWNSTREAM_DEPENDENCIES,
      FORBIDDEN_DIRECT_IMPORTS,
    ]);
    throw new Error('Studio 2.0 editor session store is not implemented yet.');
  },
  clear: () => {
    throw new Error('Studio 2.0 editor session store is not implemented yet.');
  },
});

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
