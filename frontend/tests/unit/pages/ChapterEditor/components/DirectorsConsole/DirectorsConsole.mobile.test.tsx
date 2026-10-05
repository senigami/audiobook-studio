import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DirectorsConsole } from '@/pages/ChapterEditor/components/DirectorsConsole';

// Mirrors the mocking approach in DirectorsConsole.test.tsx: this suite is
// only about the mobile-eligible tool filter (INV-MAP-4), not the real
// tool bodies' internals (Cast/Booth are real ports needing Router/
// BookDataProvider context this suite doesn't set up).
vi.mock('@/pages/ChapterEditor/components/DirectorsConsole/CastTool', () => ({
  CastTool: {
    id: 'cast',
    label: 'Cast',
    icon: (props: any) => <svg data-testid="cast-icon-mock" {...props} />,
    component: () => <div data-testid="cast-tool-mock">Cast tool body</div>,
    shortcut: 'V',
    demoPlaceholder: false,
  },
}));

vi.mock('@/pages/ChapterEditor/components/DirectorsConsole/BoothTool', () => ({
  BoothTool: {
    id: 'booth',
    label: 'Booth',
    icon: (props: any) => <svg data-testid="booth-icon-mock" {...props} />,
    component: () => <div data-testid="booth-tool-mock">Booth tool body</div>,
    demoPlaceholder: false,
  },
}));

// Controls the mocked media query result per-test.
const matchMedia = vi.fn();
vi.mock('@/hooks/useMediaQuery', () => ({
  useMediaQuery: (query: string) => matchMedia(query),
}));

describe('DirectorsConsole — mobile tool filtering (INV-MAP-4)', () => {
  beforeEach(() => {
    matchMedia.mockReset();
  });

  it('renders only Booth (the sole registered mobile-eligible tool) at mobile width, with Cast/Revise/Write absent from the DOM', () => {
    matchMedia.mockReturnValue(true);
    render(<DirectorsConsole />);

    expect(screen.getByRole('tab', { name: 'Booth' })).toBeInTheDocument();

    ['Cast', 'Revise', 'Write', 'Casting Call', 'Script Supervisor', 'Plugin'].forEach((label) => {
      expect(screen.queryByRole('tab', { name: label })).not.toBeInTheDocument();
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    });
  });

  it('renders the full desktop rail unchanged at desktop width', () => {
    matchMedia.mockReturnValue(false);
    render(<DirectorsConsole />);

    ['Cast', 'Booth', 'Revise', 'Casting Call', 'Script Supervisor', 'Plugin'].forEach((label) => {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    });
  });

  it('uses the mobile tablist container (not the desktop rail) at mobile width', () => {
    matchMedia.mockReturnValue(true);
    render(<DirectorsConsole />);

    expect(screen.getByRole('tablist', { name: 'Chapter editor modes' })).toBeInTheDocument();
    expect(screen.queryByRole('tablist', { name: "Director's Console tools" })).not.toBeInTheDocument();
  });

  it('auto-redirects to Booth when the active mode is desktop-only and the viewport is mobile', async () => {
    matchMedia.mockReturnValue(true);
    render(<DirectorsConsole />);

    // Default active tool is Cast (desktop-only), but the redirect effect
    // should move activeToolId to Booth immediately since Cast isn't
    // reachable from the mobile switcher.
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('[data-testid="booth-tool-mock"]')).toBeInTheDocument();
    expect(panel.querySelector('[data-testid="cast-tool-mock"]')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Booth' })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps Booth active across a resize from desktop to mobile without losing state', async () => {
    matchMedia.mockReturnValue(false);
    const { rerender } = render(<DirectorsConsole />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Booth' }));
    expect(screen.getByRole('tab', { name: 'Booth' })).toHaveAttribute('aria-selected', 'true');

    matchMedia.mockReturnValue(true);
    rerender(<DirectorsConsole />);

    expect(screen.getByRole('tab', { name: 'Booth' })).toHaveAttribute('aria-selected', 'true');
    const panel = screen.getByRole('tabpanel');
    expect(panel.querySelector('[data-testid="booth-tool-mock"]')).toBeInTheDocument();
  });
});
