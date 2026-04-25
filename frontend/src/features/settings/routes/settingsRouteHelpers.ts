import React from 'react';

export const getBadgeStyles = (tone: 'blue' | 'yellow' | 'gray' | 'red'): React.CSSProperties => {
  if (tone === 'blue') {
    return { color: '#075985', background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.22)' };
  }
  if (tone === 'yellow') {
    return { color: '#92400e', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.24)' };
  }
  if (tone === 'red') {
    return { color: '#991b1b', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.24)' };
  }
  return { color: 'var(--text-muted)', background: 'rgba(100, 116, 139, 0.12)', border: '1px solid rgba(100, 116, 139, 0.2)' };
};

export const getEngineStatusLabel = (status: string): string => {
  switch (status) {
    case 'ready':
      return 'READY';
    case 'needs_setup':
      return 'NEEDS SETUP';
    case 'unverified':
      return 'UNVERIFIED';
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
