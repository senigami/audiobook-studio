import React from 'react';
import { Book } from 'lucide-react';
import type { Project } from '@/types';

interface LibraryContinueSectionProps {
    projects: Project[];
    onOpenProject: (projectId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
    drafting: 'Drafting',
    casting: 'Casting',
    rendered: 'Rendered',
};

/**
 * Library "Continue" section (task 006, north_star_screen_parity).
 *
 * Deliberately a SCOPED-DOWN version of the demo's card
 * (`frontend/src/demo/stages/siteMockup/panes/library.tsx:296-364`), per the
 * task's Step 1.3 allowance:
 *
 * - Selection: the ≤2 most-recently-updated projects whose derived `status`
 *   is `'casting'` (some chapters rendered, not all — i.e. genuinely
 *   "in progress" with a real fraction to show). `'drafting'` projects are
 *   excluded because chapter_count is 0 there (no fraction to display) and
 *   `'rendered'` projects are excluded because they're already done.
 * - Progress: a STATIC rendered-fraction percentage
 *   (chapters_rendered_count / chapter_count), both real fields returned by
 *   `app/db/projects.py::list_projects()` — not a live/animated bar.
 * - NO ETA. task 005 already established that "actively rendering right
 *   now" (Studio state) isn't derivable without a live-job subscription or
 *   N+1 scan, and the progress/ETA subsystem
 *   (`app/orchestration/progress/eta.py`, `service.py`) only ever computes
 *   ETA for a single currently-active job — never aggregated across a whole
 *   book, and never for a book with no active job right now. Showing a
 *   number here would be fabricated (see the project's standing
 *   progress-no-fabrication principle), so it's omitted entirely rather than
 *   approximated.
 * - `PredictiveProgressBar` was evaluated and is NOT a fit: it's built for a
 *   live, animated, job-scoped progress stream (predictive ticks, ETA basis,
 *   handoff state) and has no "static percentage, no active job" mode. This
 *   renders a plain, non-animated fraction bar instead.
 * - Empty case: renders `null` (no heading, no empty shell) when zero
 *   projects qualify, matching the demo's implicit behavior.
 */
export const LibraryContinueSection: React.FC<LibraryContinueSectionProps> = ({ projects, onOpenProject }) => {
    const candidates = projects
        .filter((project) => project.status === 'casting' && (project.chapter_count ?? 0) > 0)
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
        .slice(0, 2);

    if (candidates.length === 0) return null;

    return (
        <div className="library-continue-section">
            <div className="library-continue-section__heading">Continue</div>
            <div className="library-continue-section__cards">
                {candidates.map((project) => {
                    const chapterCount = project.chapter_count ?? 0;
                    const renderedCount = project.chapters_rendered_count ?? 0;
                    const pct = chapterCount > 0 ? Math.round((renderedCount / chapterCount) * 100) : 0;
                    const statusLabel = project.status ? STATUS_LABEL[project.status] : null;

                    return (
                        <button
                            key={project.id}
                            type="button"
                            className="library-continue-card"
                            onClick={() => onOpenProject(project.id)}
                        >
                            <div className="library-continue-card__cover">
                                {project.cover_image_path ? (
                                    <img src={project.cover_image_path} alt="" />
                                ) : (
                                    <Book size={22} opacity={0.4} />
                                )}
                            </div>
                            <div className="library-continue-card__body">
                                <h3 className="library-continue-card__title">{project.name}</h3>
                                {project.author && (
                                    <p className="library-continue-card__author">{project.author}</p>
                                )}
                                {project.series && (
                                    <p className="library-continue-card__series">
                                        {project.series}
                                        {project.series_position != null ? ` · #${project.series_position}` : ''}
                                    </p>
                                )}
                                <p className="library-continue-card__status-line">
                                    {statusLabel ? `${statusLabel} · ` : ''}
                                    {renderedCount} of {chapterCount} chapters rendered
                                </p>
                                <div className="library-continue-card__progress-track">
                                    <div
                                        className="library-continue-card__progress-fill"
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
