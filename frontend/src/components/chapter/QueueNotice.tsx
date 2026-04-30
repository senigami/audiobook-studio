import React from 'react';

interface QueueNoticeProps {
  message: string;
}

export const QueueNotice: React.FC<QueueNoticeProps> = ({ message }) => {
  return (
    <div style={{
      position: 'fixed',
      right: '1.5rem',
      bottom: '1.5rem',
      zIndex: 1500,
      background: 'var(--surface)',
      color: 'var(--text-primary)',
      border: '1px solid var(--accent)',
      boxShadow: 'var(--shadow-lg)',
      borderRadius: '14px',
      padding: '0.85rem 1rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.65rem',
      maxWidth: '360px'
    }}>
      <div style={{
        width: '32px',
        height: '32px',
        borderRadius: '50%',
        background: 'var(--accent-tint)',
        color: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 800,
        flexShrink: 0
      }}>
        ✓
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
        <span style={{ fontWeight: 700 }}>Queued</span>
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{message}</span>
      </div>
    </div>
  );
};
