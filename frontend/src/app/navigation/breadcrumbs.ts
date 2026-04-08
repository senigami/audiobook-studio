// Breadcrumb model for Studio 2.0.
//
// Breadcrumbs should preserve project and chapter location context so the user
// always has a clear return path during focused work.

export interface BreadcrumbItem {
  id: string;
  label: string;
  href?: string;
}

export const createProjectBreadcrumbs = (): BreadcrumbItem[] => {
  return [];
};

export const createChapterBreadcrumbs = (): BreadcrumbItem[] => {
  return [];
};
