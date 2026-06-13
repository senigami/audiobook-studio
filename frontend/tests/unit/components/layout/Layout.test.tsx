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

  it('renders the correct branding text', () => {
    render(
      <MemoryRouter>
        <Layout {...defaultProps} />
      </MemoryRouter>,
    );

    const legacyHeader = document.querySelector('.header-container');
    expect(legacyHeader).toBeTruthy();
    expect(within(legacyHeader as HTMLElement).getByLabelText(/Audiobook Studio/i)).toBeTruthy();
    expect(document.querySelector('.top-bar__brand-btn')).toBeTruthy();
  });

  it('keeps the legacy header navigation available while the new shell mounts beside it', () => {
    render(
      <MemoryRouter>
        <Layout {...defaultProps} />
      </MemoryRouter>,
    );

    const legacyNav = document.querySelector('.header-nav');
    expect(legacyNav).toBeTruthy();

    expect(within(legacyNav as HTMLElement).getByRole('button', { name: /Library/i })).toBeTruthy();
    expect(within(legacyNav as HTMLElement).getByRole('button', { name: /Voices/i })).toBeTruthy();
    expect(within(legacyNav as HTMLElement).getByRole('button', { name: /Queue/i })).toBeTruthy();
    expect(within(legacyNav as HTMLElement).getByRole('button', { name: /Settings/i })).toBeTruthy();
  });

  it('renders the grouped rail and top bar inside the new shell grid', () => {
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

    const shellGrid = screen.getByTestId('layout-root').querySelector('.shell-grid');
    expect(shellGrid).toBeTruthy();

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
      <MemoryRouter>
        <Layout {...defaultProps} shellState={shellState} />
      </MemoryRouter>,
    );

    const legacyNav = document.querySelector('.header-nav');
    expect(legacyNav).toBeTruthy();
    expect(within(legacyNav as HTMLElement).getByRole('button', { name: /Library/i })).toHaveAttribute('aria-current', 'page');
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
      <MemoryRouter>
        <Layout {...defaultProps} shellState={shellState} />
      </MemoryRouter>,
    );

    const legacyNav = document.querySelector('.header-nav');
    expect(legacyNav).toBeTruthy();
    expect(within(legacyNav as HTMLElement).getByRole('button', { name: /Settings/i })).toHaveAttribute('aria-current', 'page');
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
