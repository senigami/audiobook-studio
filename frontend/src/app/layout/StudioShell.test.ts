import { describe, it, expect } from 'vitest';
import { createStudioShellState, deriveHydrationStatus } from './StudioShell';

describe('StudioShell state', () => {
  const baseInputs = {
    pathname: '/',
    loading: false,
    connected: true,
    isReconnecting: false
  };

  it('composes a complete shell state snapshot', () => {
    const state = createStudioShellState({
      ...baseInputs,
      pathname: '/project/p123',
      projectTitle: 'My Project'
    });

    expect(state.navigation.activeGlobalId).toBe('project');
    expect(state.navigation.activeProjectId).toBe('p123');
    expect(state.hydration.status).toBe('ready');
    expect(state.breadcrumbs).toHaveLength(2);
    expect(state.projectSubnav).toHaveLength(2);
  });

  describe('hydration status derivation', () => {
    it('shows bootstrap during initial loading', () => {
      const status = deriveHydrationStatus({ loading: true, connected: false, isReconnecting: false });
      expect(status).toBe('bootstrap');
    });

    it('shows bootstrap when source is explicitly bootstrap', () => {
      const status = deriveHydrationStatus({ loading: false, connected: true, isReconnecting: false, source: 'bootstrap' });
      expect(status).toBe('bootstrap');
    });

    it('shows reconnecting when socket is down but attempting', () => {
      const status = deriveHydrationStatus({ loading: false, connected: false, isReconnecting: true });
      expect(status).toBe('reconnecting');
    });

    it('shows ready when connected and not loading', () => {
      const status = deriveHydrationStatus({ loading: false, connected: true, isReconnecting: false });
      expect(status).toBe('ready');
    });

    it('shows recovering for reconnect source', () => {
      const status = deriveHydrationStatus({ loading: false, connected: true, isReconnecting: false, source: 'reconnect' });
      expect(status).toBe('recovering');
    });
  });
});
