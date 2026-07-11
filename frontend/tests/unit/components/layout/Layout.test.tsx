import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Layout } from '@/components/layout/Layout';
import { createStudioShellState } from '@/app/layout/StudioShell';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

describe('Layout', () => {
  const defaultProps = {
    children: <div>Content</div>,
  };

  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders the top bar with an accessible home button', () => {
    render(
      <MemoryRouter>
        <Layout {...defaultProps} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /Audiobook Studio home/i })).toBeTruthy();
    expect(document.querySelector('.top-bar')).toBeTruthy();
  });

  it('renders the rail as the primary navigation surface', () => {
    render(
      <MemoryRouter>
        <Layout {...defaultProps} />
      </MemoryRouter>,
    );

    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(rail).getByRole('button', { name: 'Library' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Voices' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Activity' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Engines' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Integrations' })).toBeTruthy();
    expect(within(rail).getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('renders the top bar above the shell grid and keeps the rail/content beneath it', () => {
    const onToggleQueue = vi.fn();
    const shellState = createStudioShellState({
      pathname: '/project/p123',
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    render(
      <MemoryRouter>
        <Layout
          {...defaultProps}
          queueCount={5}
          shellState={shellState}
          onToggleQueue={onToggleQueue}
          isQueueOpen={true}
        />
      </MemoryRouter>,
    );

    const layoutRoot = screen.getByTestId('layout-root');
    const topBar = layoutRoot.querySelector('.top-bar');
    const shellGrid = layoutRoot.querySelector('.shell-grid');
    expect(topBar).toBeTruthy();
    expect(shellGrid).toBeTruthy();
    expect(topBar?.nextElementSibling).toBe(shellGrid);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByText('CREATE')).toBeTruthy();
    expect(screen.getByText('MONITOR')).toBeTruthy();
    expect(screen.getByText('PLATFORM')).toBeTruthy();
    expect(screen.getByText('MANAGE')).toBeTruthy();

    const topBarQueueButton = document.querySelector('.top-bar__queue-btn');
    expect(topBarQueueButton).toBeTruthy();
    expect(within(topBarQueueButton as HTMLElement).getByText('5')).toBeTruthy();

    fireEvent.click(topBarQueueButton as HTMLElement);
    expect(onToggleQueue).toHaveBeenCalledTimes(1);
  });

  it('uses shell state to keep project surfaces mapped to the visible library tab', () => {
    const shellState = createStudioShellState({
      pathname: '/project/p123',
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    render(
      <MemoryRouter initialEntries={['/project/p123']}>
        <Layout {...defaultProps} shellState={shellState} />
      </MemoryRouter>,
    );

    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(rail).getByRole('button', { name: 'Library' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'ready');
  });

  it('reports transient hydration status in the DOM', () => {
    const shellState = createStudioShellState({
      pathname: '/',
      loading: false,
      connected: true,
      isReconnecting: false,
      hydrationSource: 'refresh',
    });

    render(
      <MemoryRouter>
        <Layout {...defaultProps} shellState={shellState} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'refreshing');
  });

  it('reports reconnecting status in the DOM', () => {
    const shellState = createStudioShellState({
      pathname: '/',
      loading: false,
      connected: false,
      isReconnecting: true,
    });

    render(
      <MemoryRouter>
        <Layout {...defaultProps} shellState={shellState} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId('layout-root')).toHaveAttribute('data-shell-hydration', 'reconnecting');
  });

  it('burger button toggles nav open state', () => {
    render(
      <MemoryRouter>
        <Layout {...defaultProps} />
      </MemoryRouter>,
    );

    const burger = screen.getByRole('button', { name: /Open navigation/i });
    expect(burger.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(burger);
    expect(burger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('complementary', { name: 'Mobile navigation' })).toBeTruthy();

    fireEvent.click(burger);
    expect(burger.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('complementary', { name: 'Mobile navigation' })).toBeNull();
  });

  it('mobile nav backdrop click closes the drawer', () => {
    render(
      <MemoryRouter>
        <Layout {...defaultProps} />
      </MemoryRouter>,
    );

    const burger = screen.getByRole('button', { name: /Open navigation/i });
    fireEvent.click(burger);
    expect(burger.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('complementary', { name: 'Mobile navigation' })).toBeTruthy();

    const backdrop = document.querySelector('.mobile-nav-backdrop');
    expect(backdrop).toBeTruthy();

    fireEvent.click(backdrop!);
    expect(burger.getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('.mobile-nav-backdrop')).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Mobile navigation' })).toBeNull();
  });

  it('uses shell state to mark settings as the active global tab', () => {
    const shellState = createStudioShellState({
      pathname: '/settings/engines',
      loading: false,
      connected: true,
      isReconnecting: false,
    });

    render(
      <MemoryRouter initialEntries={['/settings/engines']}>
        <Layout {...defaultProps} shellState={shellState} />
      </MemoryRouter>,
    );

    const rail = screen.getByRole('navigation', { name: 'Primary' });
    expect(within(rail).getByRole('button', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('navigates home when the brand button is clicked', () => {
    render(
      <MemoryRouter initialEntries={['/voices']}>
        <LocationProbe />
        <Layout {...defaultProps} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Audiobook Studio home/i }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/');
  });
});
