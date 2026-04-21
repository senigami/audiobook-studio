import { describe, it, expect } from 'vitest';
import { createProjectSubnav } from './project-subnav';

describe('project subnav builders', () => {
  it('creates stable subnav items for a project', () => {
    const items = createProjectSubnav('p123');
    expect(items).toHaveLength(2);
    expect(items.find(i => i.id === 'project-chapters')?.href).toBe('/project/p123');
    expect(items.find(i => i.id === 'project-characters')?.href).toBe('/project/p123?tab=characters');
  });

  it('returns empty array if no projectId provided', () => {
    const items = createProjectSubnav(undefined);
    expect(items).toEqual([]);
  });
});
