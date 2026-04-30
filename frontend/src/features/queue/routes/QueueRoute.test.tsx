import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { QueueRoute } from './QueueRoute';

describe('QueueRoute', () => {
  const defaultProps = {
    loading: false,
    connected: true,
    isReconnecting: false
  };

  it('provides derived shell state to its children', async () => {
    let capturedState: any = null;

    render(
      <MemoryRouter initialEntries={['/queue']}>
        <Routes>
          <Route path="/queue" element={
            <QueueRoute {...defaultProps}>
              {({ shellState }) => {
                capturedState = shellState;
                return <div>ChildContent</div>;
              }}
            </QueueRoute>
          } />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('ChildContent')).toBeInTheDocument();
    expect(capturedState.navigation.activeGlobalId).toBe('queue');
    expect(capturedState.hydration.status).toBe('ready');
  });

  it('reflects reconnecting state in shell hydration', () => {
    render(
      <MemoryRouter initialEntries={['/queue']}>
        <QueueRoute 
          {...defaultProps}
          connected={false}
          isReconnecting={true}
        >
          {(props) => <div data-testid="hydration-status">{props.shellState.hydration.status}</div>}
        </QueueRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('hydration-status')).toHaveTextContent('reconnecting');
  });

  it('reflects recovering state after reconnection', () => {
    render(
      <MemoryRouter initialEntries={['/queue']}>
        <QueueRoute 
          {...defaultProps}
          connected={true}
          isReconnecting={false}
          refreshingSource="reconnect"
        >
          {(props) => <div data-testid="hydration-status">{props.shellState.hydration.status}</div>}
        </QueueRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('hydration-status')).toHaveTextContent('recovering');
  });

  it('reflects refreshing state during manual refresh', () => {
    render(
      <MemoryRouter initialEntries={['/queue']}>
        <QueueRoute 
          {...defaultProps}
          refreshingSource="refresh"
        >
          {(props) => <div data-testid="hydration-status">{props.shellState.hydration.status}</div>}
        </QueueRoute>
      </MemoryRouter>
    );

    expect(screen.getByTestId('hydration-status')).toHaveTextContent('refreshing');
  });
});
