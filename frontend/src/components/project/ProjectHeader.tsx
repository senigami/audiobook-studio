import React from 'react';
import { Clock, CheckCircle, Edit3, Image as ImageIcon } from 'lucide-react';
import type { Project } from '../../types';

interface ProjectHeaderProps {
  project: Project;
  totalRuntime: number;
  totalPredicted: number;
  onBack?: () => void;
  onEditMetadata: () => void;
  onShowCover: () => void;
  formatLength: (seconds: number) => string;
  compact?: boolean;
}

export const ProjectHeader: React.FC<ProjectHeaderProps> = ({
  project,
  totalRuntime,
  totalPredicted,
  onEditMetadata,
  onShowCover,
  formatLength,
  compact = false
}) => {
  return (
    <header style={{ 
        padding: compact ? '0rem 0' : '1rem 0',
        display: 'flex', 
        gap: compact ? '1rem' : '2rem',
        alignItems: 'center',
        flexShrink: 0
    }}>
      {!compact && (
        <div 
            onClick={() => project.cover_image_path ? onShowCover() : null}
            style={{
                height: '200px',
                width: '150px',
                flexShrink: 0,
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                cursor: project.cover_image_path ? 'zoom-in' : 'default',
                transition: 'transform 0.2s',
                background: 'var(--surface-light)',
                border: '1px solid var(--border)'
            }}
            onMouseOver={(e) => { if (project.cover_image_path) e.currentTarget.style.transform = 'scale(1.02)' }}
            onMouseOut={(e) => { if (project.cover_image_path) e.currentTarget.style.transform = 'scale(1)' }}
        >
            {project.cover_image_path ? (
                <img 
                    src={project.cover_image_path} 
                    alt="Cover" 
                    style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
                />
            ) : (
                <ImageIcon size={48} style={{ opacity: 0.2 }} />
            )}
        </div>
      )}

      {/* Project Metadata */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {compact ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                color: 'var(--accent)', 
                background: 'var(--accent-glow)', 
                padding: '2px 8px', 
                borderRadius: '4px',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Project
              </span>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{project.name}</h2>
              {project.series && (
                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>• {project.series}</span>
              )}
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
                  <div style={{ background: 'var(--surface-light)', padding: '0.25rem 0.75rem', borderRadius: '999px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'inline-block' }}>
                      {project.series || 'Standalone'}
                  </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                  <h2 style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1.1 }}>{project.name}</h2>
                  <button 
                    onClick={onEditMetadata} 
                    className="btn-ghost" 
                    style={{ padding: '0.5rem', color: 'var(--text-secondary)' }}
                    title="Edit Project Metadata"
                  >
                      <Edit3 size={18} />
                  </button>
              </div>
              {project.author && <p style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>by {project.author}</p>}
              
              <div style={{ display: 'flex', gap: '2rem', marginTop: '1rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={16} /> 
                      <span>Runtime: <strong style={{ color: 'var(--text-primary)' }}>{formatLength(totalRuntime)}</strong> {totalRuntime < totalPredicted && `(Predicted: ${formatLength(totalPredicted)})`}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={16} />
                      <span>Created: <strong style={{ color: 'var(--text-primary)' }}>{new Date(project.created_at * 1000).toLocaleDateString()}</strong></span>
                  </div>
              </div>
            </>
          )}
      </div>
    </header>
  );
};
