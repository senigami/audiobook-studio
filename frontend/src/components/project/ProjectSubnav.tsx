import React from 'react';
import { Link } from 'react-router-dom';
import type { ProjectSubnavItem } from '../../app/navigation/project-subnav';

interface ProjectSubnavProps {
  items: ProjectSubnavItem[];
  activeId?: string;
}

export const ProjectSubnav: React.FC<ProjectSubnavProps> = ({ items, activeId }) => {
  if (items.length === 0) return null;

  return (
    <nav 
      style={{ 
        display: 'flex', 
        gap: '1rem', 
        padding: '0 0.75rem 0.25rem', 
        marginBottom: '0.75rem', 
        borderBottom: '1px solid var(--border)' 
      }}
    >
      {items.map((item) => {
        const isActive = activeId === item.id;
        
        return (
          <Link
            key={item.id}
            to={item.href || '#'}
            style={{ 
              background: 'none', 
              border: 'none', 
              padding: '4px 10px', 
              borderRadius: '8px 8px 0 0',
              fontSize: '0.9rem', 
              fontWeight: 700,
              color: isActive ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              textDecoration: 'none',
              transition: 'all 0.2s ease'
            }}
            className={isActive ? '' : 'hover-text-primary'}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
};
