// Project sub-navigation model for Studio 2.0.
//
// Project-local navigation should remain stable across project overview,
// chapters, queue, export, and settings surfaces.

export interface ProjectSubnavItem {
  id: string;
  label: string;
  href?: string;
}

export const createProjectSubnav = (): ProjectSubnavItem[] => {
  return [];
};
