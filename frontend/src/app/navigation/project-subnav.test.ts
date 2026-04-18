import { describe, it, expect } from 'vitest';
import { createProjectSubnav } from './project-subnav';

describe('project subnav builders', () => {
  it('creates stable subnav items for a project', () => {
    const items = createProjectSubnav('p123');
    expect(items).toHaveLength(5);
    expect(items.find(i => i.id === 'project-chapters')?.href).toBe('/project/p123?tab=chapters');
    expect(items.find(i => i.id === 'project-queue')?.href).toBe('/project/p123?tab=queue');
  });

  it('returns empty array if no projectId provided', () => {
    const items = createProjectSubnav(undefined);
    expect(items).toEqual([]);
  });
});
