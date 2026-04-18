import { describe, it, expect } from 'vitest';
import { createProjectBreadcrumbs, createChapterBreadcrumbs } from './breadcrumbs';

describe('breadcrumb builders', () => {
  const context = {
    projectId: 'p123',
    projectTitle: 'My Project',
    chapterId: 'c456',
    chapterTitle: 'Chapter One',
    isEditorSurface: true
  };

  it('creates project breadcrumbs', () => {
    const crumbs = createProjectBreadcrumbs(context);
    expect(crumbs).toHaveLength(2);
    expect(crumbs[0].id).toBe('library');
    expect(crumbs[1].id).toBe('project');
    expect(crumbs[1].label).toBe('My Project');
    expect(crumbs[1].href).toBe('/project/p123');
  });

  it('creates chapter (editor) breadcrumbs with secondary project context', () => {
    const crumbs = createChapterBreadcrumbs(context);
    expect(crumbs).toHaveLength(4);
    expect(crumbs[2].id).toBe('chapters');
    expect(crumbs[2].href).toContain('tab=chapters');
    expect(crumbs[3].id).toBe('chapter');
    expect(crumbs[3].label).toBe('Chapter One');
    expect(crumbs[3].href).toBeUndefined(); // Active
  });

  it('handles missing titles gracefully', () => {
    const crumbs = createProjectBreadcrumbs({ projectId: 'p123' });
    expect(crumbs[1].label).toBe('Project');
  });
});
