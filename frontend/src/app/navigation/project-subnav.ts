export interface ProjectSubnavItem {
  id: string;
  label: string;
  href?: string;
}

export const createProjectSubnav = (projectId?: string): ProjectSubnavItem[] => {
  if (!projectId) return [];

  return [
    { id: 'project-chapters', label: 'Chapters', href: `/project/${projectId}` },
    { id: 'project-assemblies', label: 'Assemblies', href: `/project/${projectId}?tab=assemblies` },
    { id: 'project-backups', label: 'Backups', href: `/project/${projectId}?tab=backups` },
    { id: 'project-characters', label: 'Characters', href: `/project/${projectId}?tab=characters` },
  ];
};
