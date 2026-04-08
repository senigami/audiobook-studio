// Editor session store for Studio 2.0.
//
// This store will own local draft state, selection, and other transient editor
// session data without becoming a second database.

export interface EditorSessionStore {
  selectedBlockIds: string[];
  setSelectedBlockIds: (ids: string[]) => void;
  clear: () => void;
}

export const createEditorSessionStore = (): EditorSessionStore => ({
  selectedBlockIds: [],
  setSelectedBlockIds: (_ids) => {
    throw new Error('Studio 2.0 editor session store is not implemented yet.');
  },
  clear: () => {
    throw new Error('Studio 2.0 editor session store is not implemented yet.');
  },
});
