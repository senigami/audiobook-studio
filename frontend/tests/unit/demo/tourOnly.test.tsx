import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tourRedirectTarget, TOUR_STAGE_ID } from '@/demo/tourRoutes';
import { demoStages as tourStages, demoTimeline as tourTimeline, StyleguidePage as tourStyleguide, StageIndex as tourIndex } from '@/demo/demoExtras.tour';
import { DemoApp } from '@/demo/DemoApp';

describe('tourRedirectTarget', () => {
  it('leaves the tour stage alone, with or without a query', () => {
    expect(tourRedirectTarget('#/stage/site-mockup')).toBeNull();
    expect(tourRedirectTarget('#/stage/site-mockup?embed=1')).toBeNull();
  });
  it('sends everything else to the tour and keeps the query', () => {
    expect(tourRedirectTarget('#/')).toBe('#/stage/site-mockup');
    expect(tourRedirectTarget('#/styleguide')).toBe('#/stage/site-mockup');
    expect(tourRedirectTarget('#/stage/queue')).toBe('#/stage/site-mockup');
    expect(tourRedirectTarget('#/stage/queue?embed=1')).toBe('#/stage/site-mockup?embed=1');
    expect(tourRedirectTarget('#/i')).toBe('#/stage/site-mockup');
  });
  it('names the tour stage', () => {
    expect(TOUR_STAGE_ID).toBe('site-mockup');
  });
});

describe('demoExtras.tour', () => {
  it('exposes only the app tour, no timeline and no styleguide', () => {
    expect(tourStages.map(s => s.id)).toEqual(['site-mockup']);
    expect(tourTimeline.scenes).toEqual([]);
    expect(tourStyleguide).toBeNull();
    expect(tourIndex).toBeNull();
  });
});

describe('DemoApp in tour-only mode', () => {
  const originalMatchMedia = window.matchMedia;
  beforeEach(() => {
    vi.stubEnv('VITE_DEMO_TOUR_ONLY', 'true');
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false, media: query, onchange: null,
      addListener: vi.fn(), removeListener: vi.fn(),
      addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
    }));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    window.location.hash = '#/';
    window.matchMedia = originalMatchMedia;
  });

  it.each(['#/', '#/styleguide', '#/stage/queue', '#/i'])('redirects %s to the tour', async (start) => {
    window.location.hash = start;
    render(<DemoApp />);
    await waitFor(() => expect(window.location.hash).toBe('#/stage/site-mockup'));
    expect(await screen.findByRole('button', { name: 'Enter Library' })).toBeInTheDocument();
    expect(screen.queryByText('Choose a demo stage')).not.toBeInTheDocument();
  });

  it('keeps ?embed=1 on the tour', async () => {
    window.location.hash = '#/stage/queue?embed=1';
    render(<DemoApp />);
    await waitFor(() => expect(window.location.hash).toBe('#/stage/site-mockup?embed=1'));
    expect(screen.queryByText('← stages')).not.toBeInTheDocument();
  });

  it('shows no stages link on the tour strip', async () => {
    window.location.hash = '#/stage/site-mockup';
    render(<DemoApp />);
    await screen.findByRole('button', { name: 'Enter Library' });
    expect(screen.queryByText('← stages')).not.toBeInTheDocument();
  });
});
