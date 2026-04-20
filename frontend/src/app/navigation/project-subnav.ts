export interface ProjectSubnavItem {
  id: string;
  label: string;
  href?: string;
}

export const createProjectSubnav = (projectId?: string): ProjectSubnavItem[] => {
  if (!projectId) return [];

  return [
    { id: 'project-chapters', label: 'Chapters', href: `/project/${projectId}` },
    { id: 'project-characters', label: 'Characters', href: `/project/${projectId}?tab=characters` },
  ];
};
