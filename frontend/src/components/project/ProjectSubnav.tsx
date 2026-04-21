import React from 'react';
import { NavLink } from 'react-router-dom';
import { LAYERS } from '../../app/layout/layering';

interface ProjectSubnavProps {
  items: { id: string; label: string; href?: string }[];
  activeId?: string;
}

export const ProjectSubnav: React.FC<ProjectSubnavProps> = ({ items, activeId }) => {
  if (items.length === 0) return null;

  return (
    <nav 
      aria-label="Project Sub-navigation" 
      style={{ 
        display: 'flex', 
        gap: '0.75rem', 
        padding: '0 0.5rem',
        borderBottom: '1px solid var(--border)',
        marginBottom: '1rem'
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        
        return (
          <NavLink
            key={item.id}
            to={item.href || '#'}
            className={isActive ? 'btn-primary' : 'btn-ghost'}
            style={{ 
              fontWeight: 700, 
              fontSize: '0.9rem',
              padding: '0.5rem 1rem',
              borderRadius: '8px 8px 0 0',
              textDecoration: 'none',
              marginBottom: '-1px',
              border: isActive ? '1px solid var(--border)' : '1px solid transparent',
              borderBottom: isActive ? '1px solid var(--surface)' : '1px solid transparent',
              zIndex: isActive ? LAYERS.TAB_ACTIVE : LAYERS.TAB_INACTIVE
            }}
          >
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
};
