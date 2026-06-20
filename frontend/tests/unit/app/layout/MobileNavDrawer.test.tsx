import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileNavDrawer } from '@/app/layout/MobileNavDrawer';
import { setDevModeEnabled } from '@/utils/devMode';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

describe('MobileNavDrawer', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders grouped nav data and the activity badge when open', () => {
    render(
      <MemoryRouter initialEntries={['/activity']}>
        <MobileNavDrawer open={true} onClose={vi.fn()} queueCount={4} />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('complementary', { name: 'Mobile navigation' });
    expect(within(nav).getByText('CREATE')).toBeTruthy();
    expect(within(nav).getByText('MONITOR')).toBeTruthy();
    expect(within(nav).getByText('PLATFORM')).toBeTruthy();
    expect(within(nav).getByText('MANAGE')).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Library' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Voices' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Activity' })).toHaveAttribute('aria-current', 'page');
    expect(within(within(nav).getByRole('button', { name: 'Activity' })).getByText('4')).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Engines' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Integrations' })).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('returns no markup when closed', () => {
    render(
      <MemoryRouter>
        <MobileNavDrawer open={false} onClose={vi.fn()} queueCount={4} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('complementary', { name: 'Mobile navigation' })).toBeNull();
    expect(document.querySelector('.mobile-nav-backdrop')).toBeNull();
  });

  it('navigates and closes when a nav item is clicked', () => {
    const onClose = vi.fn();

    render(
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <MobileNavDrawer open={true} onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voices' }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/voices');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes from the backdrop', () => {
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <MobileNavDrawer open={true} onClose={onClose} />
      </MemoryRouter>,
    );

    fireEvent.click(document.querySelector('.mobile-nav-backdrop')!);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gates the developer group with dev mode', () => {
    const { rerender } = render(
      <MemoryRouter>
        <MobileNavDrawer open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('DEVELOPER')).toBeNull();

    act(() => {
      setDevModeEnabled(true);
    });
    rerender(
      <MemoryRouter>
        <MobileNavDrawer open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText('DEVELOPER')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Progress test' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Event stream' })).toBeTruthy();
  });

  it('uses the shared theme toggle behavior', () => {
    document.documentElement.dataset.theme = 'light';

    render(
      <MemoryRouter>
        <MobileNavDrawer open={true} onClose={vi.fn()} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }));

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Switch to light mode' })).toBeTruthy();
  });
});
