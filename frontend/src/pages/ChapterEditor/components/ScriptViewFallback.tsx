import React from 'react';

interface ScriptViewFallbackProps {
  loading: boolean;
  textContent: string;
}

export const ScriptViewFallback: React.FC<ScriptViewFallbackProps> = ({ loading, textContent }) => {
  return (
    <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--surface-light)', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
        {loading
          ? 'Loading script view. The chapter text is shown below so you can keep reading while the richer script layout arrives.'
          : 'Script view is unavailable right now, so the chapter text is shown below instead.'}
      </div>
      <pre style={{
        margin: 0,
        padding: '1.25rem',
        borderRadius: '12px',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        color: 'var(--text-primary)',
        fontSize: '1rem',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        overflow: 'auto',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}>
        {textContent || 'No chapter text available.'}
      </pre>
    </div>
  );
};
