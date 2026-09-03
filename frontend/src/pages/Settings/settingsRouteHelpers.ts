import React from 'react';

export const getBadgeStyles = (tone: 'blue' | 'yellow' | 'gray' | 'red'): React.CSSProperties => {
  if (tone === 'blue') {
    return { color: 'var(--cloud-color)', background: 'var(--cloud-tint-bg)', border: '1px solid var(--accent-tint-border)' };
  }
  if (tone === 'yellow') {
    return { color: 'var(--warning-text)', background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)' };
  }
  if (tone === 'red') {
    return { color: 'var(--error-text)', background: 'var(--error-tint-bg)', border: '1px solid var(--error-tint-border)' };
  }
  return { color: 'var(--text-muted)', background: 'var(--progress-badge-default)', border: '1px solid var(--progress-badge-border)' };
};

export const getEngineStatusLabel = (status: string): string => {
  switch (status) {
    case 'ready':
      return 'READY';
    case 'needs_setup':
      return 'NOT READY';
    case 'unverified':
      return 'NOT READY';
    case 'invalid_config':
      return 'INVALID CONFIG';
    case 'not_loaded':
      return 'NOT LOADED';
    default:
      return status.replace(/_/g, ' ').toUpperCase();
  }
};

export const getEngineUi = (schema: any) => {
  const ui = schema?.['x-ui'];
  return ui && typeof ui === 'object' ? ui : null;
};

export const apiExampleStyle: React.CSSProperties = {
  margin: '0.9rem 0 0 0',
  padding: '0.9rem 1rem',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
};
