import React from 'react';
import type { ComponentType } from 'react';

interface ToolStubProps {
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  label: string;
}

/**
 * Shared body for tool stubs that have no real functionality yet.
 * Renders the tool's icon + label + a "coming soon" message.
 */
export const ToolStub: React.FC<ToolStubProps> = ({ icon: Icon, label }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      padding: '3rem 1.5rem',
      color: 'var(--text-secondary)',
      textAlign: 'center'
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        borderRadius: '50%',
        background: 'var(--accent-tint)',
        color: 'var(--action-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        <Icon size={22} aria-hidden="true" />
      </div>
      <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{label}</div>
      <div style={{ fontSize: '0.85rem' }}>Coming soon</div>
    </div>
  );
};
