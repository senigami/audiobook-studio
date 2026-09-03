import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NavRail } from '@/app/layout/NavRail';
import { STORAGE_KEY as RAIL_STORAGE_KEY } from '@/utils/railState';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="pathname">{location.pathname}</div>;
}

describe('NavRail', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders all group labels and items', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavRail />
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeTruthy();
    expect(screen.getByText('CREATE')).toBeTruthy();
    expect(screen.getByText('MONITOR')).toBeTruthy();
    expect(screen.getByText('PLATFORM')).toBeTruthy();
    expect(screen.getByText('MANAGE')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Library' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Voices' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Activity' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Engines' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Integrations' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeTruthy();
  });

  it('adds the Developer group when dev mode is enabled', () => {
    localStorage.setItem('studio-dev-mode', 'true');

    render(
      <MemoryRouter initialEntries={['/']}>
        <NavRail />
      </MemoryRouter>,
    );

    expect(screen.getByText('DEVELOPER')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Progress test' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Event stream' })).toBeTruthy();
  });

  it('navigates to Voices when clicked', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <LocationProbe />
        <NavRail />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voices' }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/voices');
  });

  it('collapses through the chevron and persists the collapse flag', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavRail />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Collapse rail' }));

    expect(localStorage.getItem(RAIL_STORAGE_KEY)).toBe('true');
    expect(screen.getByRole('navigation', { name: 'Primary' })).toHaveClass('nav-rail--collapsed');
    expect(screen.getByRole('button', { name: 'Expand rail' })).toBeTruthy();
  });

  it('resizes the rail from the drag handle and persists the width', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <NavRail />
      </MemoryRouter>,
    );

    const nav = screen.getByRole('navigation', { name: 'Primary' });
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' });

    fireEvent.pointerDown(handle, { clientX: 190 });
    fireEvent.pointerMove(window, { clientX: 250 });
    fireEvent.pointerUp(window);

    expect(localStorage.getItem('studio-rail-width')).toBe('250');
    expect(nav.getAttribute('style')).toContain('--nav-rail-expanded-width: 250px');
  });

  it('shows and hides the Activity queue badge based on queueCount', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <NavRail queueCount={3} />
      </MemoryRouter>,
    );

    const activityButton = screen.getByRole('button', { name: 'Activity' });
    expect(within(activityButton).getByText('3')).toBeTruthy();

    rerender(
      <MemoryRouter initialEntries={['/']}>
        <NavRail queueCount={0} />
      </MemoryRouter>,
    );

    const activityButtonWithoutBadge = screen.getByRole('button', { name: 'Activity' });
    expect(within(activityButtonWithoutBadge).queryByText('0')).toBeNull();
    expect(activityButtonWithoutBadge.querySelector('.nav-rail__badge')).toBeNull();
  });

  it('flips the document theme in both directions', () => {
    document.documentElement.dataset.theme = 'light';

    render(
      <MemoryRouter initialEntries={['/']}>
        <NavRail />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Light mode' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Light mode' }));
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toBeTruthy();
  });

  it('renders the hover overlay after a dwell delay, without changing the persisted collapse flag', () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, 'true');

      render(
        <MemoryRouter initialEntries={['/']}>
          <NavRail />
        </MemoryRouter>,
      );

      const nav = screen.getByRole('navigation', { name: 'Primary' });
      expect(document.querySelector('.nav-rail__overlay')).toBeNull();

      fireEvent.mouseEnter(nav);

      // A quick pass-through shouldn't trigger it — nothing mounts immediately.
      expect(document.querySelector('.nav-rail__overlay')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(220);
      });

      expect(document.querySelector('.nav-rail__overlay')).toBeTruthy();
      expect(localStorage.getItem(RAIL_STORAGE_KEY)).toBe('true');
      expect(screen.getByText('CREATE')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not expand on a quick mouse pass-through (enter then leave before the dwell delay)', () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, 'true');

      render(
        <MemoryRouter initialEntries={['/']}>
          <NavRail />
        </MemoryRouter>,
      );

      const nav = screen.getByRole('navigation', { name: 'Primary' });

      fireEvent.mouseEnter(nav);
      act(() => {
        vi.advanceTimersByTime(100);
      });
      fireEvent.mouseLeave(nav);
      act(() => {
        vi.advanceTimersByTime(500);
      });

      expect(document.querySelector('.nav-rail__overlay')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the overlay open briefly after the pointer leaves (exit delay)', () => {
    vi.useFakeTimers();
    try {
      localStorage.setItem(RAIL_STORAGE_KEY, 'true');

      render(
        <MemoryRouter initialEntries={['/']}>
          <NavRail />
        </MemoryRouter>,
      );

      const nav = screen.getByRole('navigation', { name: 'Primary' });

      fireEvent.mouseEnter(nav);
      act(() => {
        vi.advanceTimersByTime(220);
      });
      expect(document.querySelector('.nav-rail__overlay')).toBeTruthy();

      fireEvent.mouseLeave(nav);
      // Still present immediately after leaving — exit is debounced, not instant.
      expect(document.querySelector('.nav-rail__overlay')).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(document.querySelector('.nav-rail__overlay')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
