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

  it('shows the section breadcrumb with no identity slot outside a book', () => {
    const shellState = createStudioShellState({
      pathname: '/voices',
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    render(
      <MemoryRouter initialEntries={['/voices']}>
        <TopBar shellState={shellState} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Voices')).toBeTruthy();
    // The identity slot only exists inside a book, woven into the breadcrumb path.
    expect(screen.queryByTestId('topbar-identity-slot')).toBeNull();
  });

  it('threads the identity slot and stage into the breadcrumb inside a book', () => {
    render(
      <MemoryRouter initialEntries={['/book/abc/studio']}>
        <TopBar identitySlot={<span data-testid="id-content">Book identity</span>} />
      </MemoryRouter>,
    );

    // Continuous path: Library › [identity] › Studio
    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByRole('button', { name: 'Library' })).toBeTruthy();
    const identitySlot = screen.getByTestId('topbar-identity-slot');
    expect(within(identitySlot).getByTestId('id-content')).toBeTruthy();
    // Stage segment (scope to the breadcrumb — "Studio" also appears in the brand wordmark).
    expect(within(breadcrumb).getByText('Studio')).toBeTruthy();
  });

  it.each([
    ['/activity', 'Activity'],
    ['/engines', 'Engines'],
    ['/integrations', 'Integrations'],
    ['/settings', 'Settings'],
  ])('shows the correct breadcrumb label for %s', (pathname, expectedLabel) => {
    const shellState = createStudioShellState({
      pathname,
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    render(
      <MemoryRouter initialEntries={[pathname]}>
        <TopBar shellState={shellState} />
      </MemoryRouter>,
    );

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(breadcrumb).getByText(expectedLabel)).toBeTruthy();
    expect(within(breadcrumb).queryByText('Library')).toBeNull();
  });

  it('does not render a trailing caret with nothing after it on a single-level breadcrumb', () => {
    const shellState = createStudioShellState({
      pathname: '/voices',
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    render(
      <MemoryRouter initialEntries={['/voices']}>
        <TopBar shellState={shellState} />
      </MemoryRouter>,
    );

    const breadcrumb = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(breadcrumb.querySelector('.top-bar__breadcrumb-caret')).toBeNull();
  });

  it('navigates home when the brand button is clicked', async () => {
    render(
      <MemoryRouter initialEntries={['/voices']}>
        <LocationProbe />
        <TopBar />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Audiobook Studio home' }));

    expect(await screen.findByTestId('pathname')).toHaveTextContent('/');
  });
});
