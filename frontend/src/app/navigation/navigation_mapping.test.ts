import { describe, it, expect } from 'vitest';
import { deriveNavigationState } from '../layout/StudioShell';

describe('navigation mapping', () => {
  it('identifies the library (home) route', () => {
    const state = deriveNavigationState('/');
    expect(state.routeKind).toBe('library');
    expect(state.activeGlobalId).toBe('library');
  });

  it('identifies the global queue route', () => {
    const state = deriveNavigationState('/queue');
    expect(state.routeKind).toBe('queue');
    expect(state.activeGlobalId).toBe('queue');
  });

  it('identifies the voices route', () => {
    const state = deriveNavigationState('/voices');
    expect(state.routeKind).toBe('voices');
    expect(state.activeGlobalId).toBe('voices');
  });

  it('identifies project-specific routes', () => {
    const state = deriveNavigationState('/project/p123');
    expect(state.routeKind).toBe('project-chapters');
    expect(state.activeGlobalId).toBe('project');
    expect(state.activeProjectId).toBe('p123');
  });

  it('identifies chapter-specific routes', () => {
    const state = deriveNavigationState('/chapter/c456');
    expect(state.routeKind).toBe('chapter-editor');
    expect(state.activeGlobalId).toBe('project');
    expect(state.activeChapterId).toBe('c456');
  });

  it('falls back to unknown for unmapped paths', () => {
    const state = deriveNavigationState('/some/weird/path');
    expect(state.routeKind).toBe('unknown');
  });
});
