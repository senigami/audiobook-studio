import React from 'react';
import type { ProjectStatus } from '@/types';

interface ProjectStatusPillProps {
  status: ProjectStatus;
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  drafting: 'Drafting',
  casting: 'Casting',
  rendered: 'Rendered',
};

/**
 * Per-project workflow status pill (task 005, north_star_screen_parity).
 *
 * Deliberately a *partial* 3-state set — "Drafting" / "Casting" / "Rendered"
 * — derived server-side from chapter-lifecycle aggregates
 * (app/db/projects.py::list_projects). "Studio" (actively rendering) and
 * "Published" (assembled into an audiobook) are out of scope for this pass;
 * see design-docs/plans/active/north_star_screen_parity/tasks/
 * 005-library-project-status.md for why.
 *
 * Reuses the rounded-pill visual language already established by
 * ChapterTable's `.chapter-table__pill--*` lifecycle pill rather than
 * inventing a new status UI component.
 */
export const ProjectStatusPill: React.FC<ProjectStatusPillProps> = ({ status }) => {
  return (
    <span className={`project-status-pill project-status-pill--${status}`}>
      {STATUS_LABEL[status]}
    </span>
  );
};
