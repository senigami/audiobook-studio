export interface ProjectSubnavItem {
  id: string;
  label: string;
  href?: string;
}

export const createProjectSubnav = (projectId?: string): ProjectSubnavItem[] => {
  if (!projectId) return [];

  return [
    { id: 'project-overview', label: 'Overview', href: `/project/${projectId}` },
    { id: 'project-chapters', label: 'Chapters', href: `/project/${projectId}?tab=chapters` },
    { id: 'project-characters', label: 'Characters', href: `/project/${projectId}?tab=characters` },
    { id: 'project-queue', label: 'Queue', href: `/project/${projectId}?tab=queue` },
    { id: 'project-export', label: 'Export', href: `/project/${projectId}?tab=export` },
    { id: 'project-settings', label: 'Settings', href: `/project/${projectId}?tab=settings` },
  ];
};
