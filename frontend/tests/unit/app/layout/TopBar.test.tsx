import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from '@/app/layout/TopBar';
import { createStudioShellState } from '@/app/layout/StudioShell';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

describe('TopBar', () => {
  it('renders the default breadcrumb text from shell state', () => {
    const shellState = createStudioShellState({
      pathname: '/voices',
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    render(
      <MemoryRouter>
        <TopBar shellState={shellState} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Voices')).toBeTruthy();
  });

  it('fires the queue toggle and shows the queue badge', () => {
    const onToggleQueue = vi.fn();

    render(
      <MemoryRouter>
        <TopBar queueCount={2} isQueueOpen={true} onToggleQueue={onToggleQueue} />
      </MemoryRouter>,
    );

    const queueButton = screen.getByRole('button', { name: /Queue/i });
    fireEvent.click(queueButton);

    expect(onToggleQueue).toHaveBeenCalledTimes(1);
    // TopBar uses aria-expanded (toggle drawer), not aria-pressed
    expect(queueButton).toHaveAttribute('aria-expanded', 'true');
    expect(within(queueButton).getByText('2')).toBeTruthy();
  });

  it('renders the connection dot for ready and reconnecting states', () => {
    const readyState = createStudioShellState({
      pathname: '/',
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    const { rerender } = render(
      <MemoryRouter>
        <TopBar shellState={readyState} />
      </MemoryRouter>,
    );

    const readyDot = screen.getByRole('status', { name: 'Connection ready' });
    expect(readyDot).toHaveAttribute('data-state', 'success');
    expect(readyDot).toHaveAttribute('title', 'Connection ready');

    const reconnectingState = createStudioShellState({
      pathname: '/',
      loading: false,
      connected: false,
      isReconnecting: true,
    });

    rerender(
      <MemoryRouter>
        <TopBar shellState={reconnectingState} />
      </MemoryRouter>,
    );

    const reconnectingDot = screen.getByRole('status', { name: 'Connection reconnecting' });
    expect(reconnectingDot).toHaveAttribute('data-state', 'warning');
    expect(reconnectingDot).toHaveAttribute('title', 'Connection reconnecting');
  });

  it('keeps the identity slot mounted but empty', () => {
    render(
      <MemoryRouter>
        <TopBar />
      </MemoryRouter>,
    );

    const identitySlot = screen.getByTestId('topbar-identity-slot');
    expect(identitySlot).toBeTruthy();
    expect(identitySlot).toBeEmptyDOMElement();
  });

  it('navigates home when the brand button is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/voices']}>
        <LocationProbe />
        <TopBar />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Audiobook Studio home' }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/');
  });
});
