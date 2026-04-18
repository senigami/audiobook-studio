export interface BreadcrumbItem {
  id: string;
  label: string;
  href?: string;
}

export interface BreadcrumbContext {
  projectId?: string;
  projectTitle?: string;
  chapterId?: string;
  chapterTitle?: string;
  isEditorSurface?: boolean;
}

export const createProjectBreadcrumbs = (context: BreadcrumbContext): BreadcrumbItem[] => {
  const items: BreadcrumbItem[] = [
    { id: 'library', label: 'Library', href: '/' }
  ];

  if (context.projectId) {
    items.push({ 
      id: 'project', 
      label: context.projectTitle || 'Project', 
      href: `/project/${context.projectId}` 
    });
  }

  return items;
};

export const createChapterBreadcrumbs = (context: BreadcrumbContext): BreadcrumbItem[] => {
  const items = createProjectBreadcrumbs(context);

  if (context.projectId && context.chapterId) {
    if (context.isEditorSurface) {
      items.push({
        id: 'chapters',
        label: 'Chapters',
        href: `/project/${context.projectId}?tab=chapters`
      });
      items.push({
        id: 'chapter',
        label: context.chapterTitle || 'Chapter Editor',
        href: undefined // Active surface
      });
    }
  }

  return items;
};
