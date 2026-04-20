import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Chapter } from '../../types';

interface ProjectBreadcrumbsProps {
  projectId: string;
  projectTitle: string;
  chapterTitle?: string;
  selectedChapterId?: string;
  chapters?: Chapter[];
  onProjectClick?: () => void;
  onNavigateChapter?: (chapterId: string) => void;
}

const crumbLinkStyle: React.CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: '0.85rem',
  fontWeight: 600,
  textDecoration: 'none',
  transition: 'color 0.2s',
  display: 'flex',
  alignItems: 'center',
};

export const ProjectBreadcrumbs: React.FC<ProjectBreadcrumbsProps> = ({
  projectId,
  projectTitle,
  chapterTitle,
  selectedChapterId,
  chapters = [],
  onProjectClick,
  onNavigateChapter,
}) => {
  const showChapterPicker = !!chapterTitle && chapters.length > 0 && !!onNavigateChapter;

  return (
    <nav
      aria-label="Breadcrumb"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '0.5rem',
        padding: '0.75rem 2.5rem',
        background: 'rgba(255, 255, 255, 0.5)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--border)',
        margin: '0 -2.5rem 1rem -2.5rem', // Bleed out to match Layout padding
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      <Link to="/" style={crumbLinkStyle} className="hover-text-primary">
        Library
      </Link>
      
      <ChevronRight size={14} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
      
      {onProjectClick ? (
        <button
          type="button"
          onClick={onProjectClick}
          style={{
            ...crumbLinkStyle,
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
          }}
          className="hover-text-primary"
        >
          {projectTitle}
        </button>
      ) : (
        <Link to={`/project/${projectId}`} style={crumbLinkStyle} className="hover-text-primary">
          {projectTitle}
        </Link>
      )}
      
      {chapterTitle && (
        <>
          <ChevronRight size={14} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
          {showChapterPicker ? (
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
              <select
                aria-label="Chapter Picker"
                value={selectedChapterId || ''}
                onChange={(event) => {
                  onNavigateChapter?.(event.target.value);
                }}
                style={{
                  appearance: 'none',
                  background: 'transparent',
                  border: '1px solid transparent',
                  padding: '2px 1.5rem 2px 0.5rem',
                  margin: '-2px 0',
                  borderRadius: '6px',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  minWidth: '12rem',
                  maxWidth: 'min(42vw, 20rem)',
                  cursor: 'pointer',
                  outline: 'none',
                  backgroundImage:
                    'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
                  backgroundRepeat: 'no-repeat',
                  backgroundPosition: 'right center',
                  transition: 'all 0.2s',
                }}
                className="hover-bg-subtle"
              >
                {chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <span style={{ color: 'var(--text-primary)', fontWeight: 800, fontSize: '0.85rem' }}>
              {chapterTitle}
            </span>
          )}
        </>
      )}
    </nav>
  );
};
