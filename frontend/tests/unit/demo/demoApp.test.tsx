/**
 * demoApp.test.tsx — tests for DemoStage, DemoApp, and liveOutputStage wiring.
 *
 * useDemoTransport is mocked (vi.mock) — tests control the stub directly.
 * The liveOutputStage test uses the REAL transport mock + real LiveOutputTable.
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { publishStudioSocketMessage } from '@/store/studioSocketBus';
import { resetStudioSocketBusForTests } from '@/store/studioSocketBus';
import { resetLiveEventAuditForTests } from '@/store/liveEventAuditStore';
import type { DemoTimeline } from '@/demo/scenes/types';

// ---------------------------------------------------------------------------
// Mock useDemoTransport
// ---------------------------------------------------------------------------

const mockControls = {
  play: vi.fn(),
  pause: vi.fn(),
  restart: vi.fn(),
  setRate: vi.fn(),
  jumpToScene: vi.fn(),
  setLooping: vi.fn(),
};

let mockState = {
  playing: false,
  rate: 1,
  sceneIndex: 0,
  scene: {
    id: 'scene-a',
    title: 'Scene A',
    caption: 'First scene caption',
    durationMs: 3000,
    frames: [],
  },
  scenePositionMs: 0,
  looping: false,
};

vi.mock('@/demo/useDemoTransport', () => ({
  useDemoTransport: () => ({ state: mockState, controls: mockControls }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeTimeline = (): DemoTimeline => ({
  scenes: [
    {
      id: 'scene-a',
      title: 'Scene A',
      caption: 'First scene caption',
      durationMs: 3000,
      frames: [],
    },
    {
      id: 'scene-b',
      title: 'Scene B',
      caption: 'Second scene caption',
      durationMs: 2000,
      frames: [],
    },
  ],
  totalMs: 5000,
});

// ---------------------------------------------------------------------------
// Imports (after mock registration)
// ---------------------------------------------------------------------------

// Dynamic imports so they pick up the vi.mock above
const { DemoStage } = await import('@/demo/DemoStage');
const { DemoApp } = await import('@/demo/DemoApp');
const { demoStages } = await import('@/demo/demoStages');

// ---------------------------------------------------------------------------
// Test 1 — DemoStage: renders title, caption, chips; chip click; play/pause
// ---------------------------------------------------------------------------

describe('DemoStage', () => {
  beforeEach(() => {
    mockControls.play.mockClear();
    mockControls.pause.mockClear();
    mockControls.jumpToScene.mockClear();
    mockControls.setRate.mockClear();
    mockState = {
      playing: false,
      rate: 1,
      sceneIndex: 0,
      scene: {
        id: 'scene-a',
        title: 'Scene A',
        caption: 'First scene caption',
        durationMs: 3000,
        frames: [],
      },
      scenePositionMs: 500,
      looping: false,
    };
  });

  it('renders the provided stage content', () => {
    // The stage title is owned by the DemoApp stage strip (see routing tests), not by
    // DemoStage itself — DemoStage wraps and presents the stage content + scene chrome.
    render(
      <DemoStage timeline={makeTimeline()} title="My Stage">
        <div>content</div>
      </DemoStage>,
    );
    expect(screen.getByText('content')).toBeInTheDocument();
  });

  it('renders the current scene caption', () => {
    render(
      <DemoStage timeline={makeTimeline()} title="My Stage">
        <div>content</div>
      </DemoStage>,
    );
    expect(screen.getByText('First scene caption')).toBeInTheDocument();
  });

  it('renders one chip per scene', () => {
    render(
      <DemoStage timeline={makeTimeline()} title="My Stage">
        <div>content</div>
      </DemoStage>,
    );
    expect(screen.getByRole('button', { name: /Jump to scene: Scene A/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Jump to scene: Scene B/i })).toBeInTheDocument();
  });

  it('clicking a chip calls jumpToScene with its index', () => {
    render(
      <DemoStage timeline={makeTimeline()} title="My Stage">
        <div>content</div>
      </DemoStage>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Jump to scene: Scene B/i }));
    expect(mockControls.jumpToScene).toHaveBeenCalledWith(1);
  });

  it('Play button calls controls.play', () => {
    render(
      <DemoStage timeline={makeTimeline()} title="My Stage">
        <div>content</div>
      </DemoStage>,
    );
    fireEvent.click(screen.getByRole('button', { name: /play/i }));
    expect(mockControls.play).toHaveBeenCalled();
  });

  it('Pause button calls controls.pause when playing', () => {
    mockState = { ...mockState, playing: true };
    render(
      <DemoStage timeline={makeTimeline()} title="My Stage">
        <div>content</div>
      </DemoStage>,
    );
    fireEvent.click(screen.getByRole('button', { name: /pause/i }));
    expect(mockControls.pause).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Test 2 — DemoApp: index shows stage cards; hash routing to stage
// ---------------------------------------------------------------------------

describe('DemoApp routing', () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.location.hash = '#/';
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    window.location.hash = '#/';
    window.matchMedia = originalMatchMedia;
  });

  it('default hash renders index with one card per stage', () => {
    render(<DemoApp />);
    for (const stage of demoStages) {
      expect(screen.getByText(stage.title)).toBeInTheDocument();
    }
  });

  it('setting hash to a valid stage id renders that stage', async () => {
    render(<DemoApp />);

    act(() => {
      window.location.hash = `#/stage/${demoStages[0].id}`;
      window.dispatchEvent(new Event('hashchange'));
    });

    await waitFor(() => {
      // The DemoStage title bar should show the stage title
      expect(screen.getByText(demoStages[0].title)).toBeInTheDocument();
    });
  });

  it('stage hash with embedded query string routes (strips the query) and hides the chrome', async () => {
    // The showcase iframe uses src="demo/#/stage/<id>?embed=1" — the query
    // lives inside the hash, so routing must strip it and embed must be detected.
    window.location.hash = `#/stage/${demoStages[0].id}?embed=1`;
    render(<DemoApp />);

    await waitFor(() => {
      // Routing resolved the stage (NOT the not-found path) despite the ?embed=1 in the hash.
      expect(screen.queryByText(/stage not found/i)).not.toBeInTheDocument();
    });
    // embed=1 hides ALL chrome — neither the index header badge ("live demo") nor the
    // stage strip ("← stages") render.
    expect(screen.queryByText('live demo')).not.toBeInTheDocument();
    expect(screen.queryByText('← stages')).not.toBeInTheDocument();
  });

  it('unknown stage hash shows not-found message', async () => {
    render(<DemoApp />);

    act(() => {
      window.location.hash = '#/stage/does-not-exist';
      window.dispatchEvent(new Event('hashchange'));
    });

    await waitFor(() => {
      expect(screen.getByText(/stage not found/i)).toBeInTheDocument();
    });
  });

  it('site mockup voices show generated portraits and the no-image fallback', async () => {
    window.location.hash = '#/stage/site-mockup';
    const { container } = render(<DemoApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Enter Library' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voices' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'My Voices' })).toBeInTheDocument();
    });

    expect(container.querySelectorAll('.ns-voice-card')).toHaveLength(6);
    const portraitImages = Array.from(container.querySelectorAll<HTMLImageElement>('.ns-voice-portrait img'));
    expect(portraitImages).toHaveLength(6);
    expect(
      portraitImages.some((image) =>
        image.getAttribute('src')?.includes('/demo-voice-raster/warm-narrator.png'),
      ),
    ).toBe(true);
    expect(
      portraitImages.some((image) =>
        image.getAttribute('src')?.includes('/demo-voice-silhouettes/light-fairy.svg'),
      ),
    ).toBe(true);
    expect(
      portraitImages.some((image) =>
        image.getAttribute('src')?.includes('/demo-voice-silhouettes/senior.svg'),
      ),
    ).toBe(true);
    expect(
      portraitImages.some((image) =>
        image.getAttribute('src')?.includes('/demo-voice-silhouettes/female-narrator.svg'),
      ),
    ).toBe(true);
    expect(
      screen.getByLabelText('Studio Voice generic adult female warm narrator portrait'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Aria generic adult female clear narrator portrait'),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Adult').length).toBeGreaterThanOrEqual(5);

    const studioCard = screen.getByText('Studio Voice').closest('.ns-voice-card');
    expect(studioCard).not.toBeNull();
    fireEvent.click(within(studioCard as HTMLElement).getByLabelText('Voice options'));
    fireEvent.click(within(studioCard as HTMLElement).getByRole('button', { name: 'Edit metadata' }));

    const metadataDialog = await screen.findByRole('dialog', { name: 'Edit Voice Metadata' });
    expect(
      within(metadataDialog).getByLabelText('Studio Voice generic adult female warm narrator portrait'),
    ).toBeInTheDocument();
    fireEvent.click(within(metadataDialog).getByLabelText('Close edit metadata dialog'));

    fireEvent.click(screen.getByRole('button', { name: /Discover/ }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Discover Voices' })).toBeInTheDocument();
    });

    const discoverPortraitImages = Array.from(container.querySelectorAll<HTMLImageElement>('.ns-voice-portrait img'));
    // "Warden Baritone" (Gruff tone, Senior age) resolves via getVoicePortraitSrc's
    // age-before-tone precedence to the senior silhouette, not a gruff-specific asset.
    expect(
      discoverPortraitImages.some((image) =>
        image.getAttribute('src')?.includes('/demo-voice-silhouettes/senior.svg'),
      ),
    ).toBe(true);
    const wardenCard = screen.getByText('Warden Baritone').closest('.ns-card');
    expect(wardenCard).not.toBeNull();
    expect(wardenCard?.querySelector('.ns-voice-portrait')).not.toBeNull();
  });

  it('site mockup voice profile editor generates the reusable image prompt', async () => {
    window.location.hash = '#/stage/site-mockup';
    render(<DemoApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Enter Library' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voices' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit profiles' }));

    expect(screen.getAllByLabelText('Studio Voice generic adult female warm narrator portrait').length).toBeGreaterThanOrEqual(3);

    fireEvent.click(await screen.findByRole('button', { name: 'Generate prompt' }));

    const prompt = await screen.findByLabelText<HTMLTextAreaElement>('Generated voice profile image prompt');
    expect(prompt.value).toContain('1024x1024 image');
    expect(prompt.value).toContain('one perfectly solid flat background color');
    expect(prompt.value).toContain('Hugging Face voice profile');
    expect(prompt.value).toContain('warm adult female narrator voice named Studio Voice');
  });

  it('site mockup voice profile editor supports expanded taxonomy and voice variations', async () => {
    window.location.hash = '#/stage/site-mockup';
    render(<DemoApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Enter Library' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Voices' }));

    expect(await screen.findByText('6 variations')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Edit profiles' }));

    const primaryRole = await screen.findByRole('combobox', { name: 'Primary role' });
    expect(primaryRole).toHaveValue('Dark Fiction Narrator');

    const age = screen.getByRole('combobox', { name: 'Age' });
    expect(within(age).getByRole('option', { name: 'Unknown' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Add language' }), {
      target: { value: 'Mandarin Chinese' },
    });
    expect(screen.getByRole('button', { name: 'Remove language Mandarin Chinese' })).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox', { name: 'Add dialect or vocal origin' }), {
      target: { value: 'Fantasy courtly' },
    });
    expect(screen.getByRole('button', { name: 'Remove dialect or vocal origin Fantasy courtly' })).toBeInTheDocument();

    expect(screen.getByRole('heading', { name: 'Voice variations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Dark Fiction.*default variation/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Sad/i }));
    expect(screen.getByRole('button', { name: 'Remove emotion Sad' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Variation intensity' })).toHaveValue('Moderate');
  });

  it('site mockup indents contextual book rail tabs instead of centering them', async () => {
    window.location.hash = '#/stage/site-mockup';
    render(<DemoApp />);

    fireEvent.click(await screen.findByRole('button', { name: 'Enter Library' }));
    fireEvent.click((await screen.findAllByText('The Whispering Vale'))[0]);

    const contentsRailTab = screen.getAllByRole('button', { name: 'Contents' })
      .find(button => button.classList.contains('ns-book-rail-stage'));

    expect(contentsRailTab).toBeDefined();
    expect(contentsRailTab).toHaveStyle({
      justifyContent: 'flex-start',
      textAlign: 'left',
    });
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Theme toggle
// ---------------------------------------------------------------------------

describe('DemoApp theme toggle', () => {
  beforeEach(() => {
    window.location.hash = '#/';
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('studio-theme');
  });

  // The demo has no in-app theme toggle anymore (removed in #125) — it follows the
  // shared studio theme preference, applying + persisting it on mount.
  it('applies a theme to documentElement on mount', async () => {
    render(<DemoApp />);

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme');
    });
    expect(['light', 'dark']).toContain(document.documentElement.getAttribute('data-theme'));
  });

  it('persists the theme to localStorage under the shared studio-theme key on mount', async () => {
    render(<DemoApp />);

    await waitFor(() => {
      expect(['light', 'dark']).toContain(localStorage.getItem('studio-theme'));
    });
  });
});

// ---------------------------------------------------------------------------
// Test 4 — demo-blocked-action toast
// ---------------------------------------------------------------------------

describe('DemoApp toast', () => {
  beforeEach(() => {
    window.location.hash = '#/';
  });

  it('dispatching demo-blocked-action shows toast text', async () => {
    render(<DemoApp />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent('demo-blocked-action', {
          detail: { message: 'This is a demo — actions are disabled.' },
        }),
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('This is a demo — actions are disabled.'),
      ).toBeInTheDocument();
    });
  });

  it('shows default toast text when no detail message', async () => {
    render(<DemoApp />);

    act(() => {
      window.dispatchEvent(new CustomEvent('demo-blocked-action'));
    });

    await waitFor(() => {
      expect(
        screen.getByText(/This is a demo — actions are disabled\./i),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Test 5 — liveOutputStage: real LiveOutputTable wired to the bus
// ---------------------------------------------------------------------------

describe('liveOutputStage bus wiring', () => {
  beforeEach(() => {
    act(() => {
      resetStudioSocketBusForTests();
      resetLiveEventAuditForTests();
    });
    window.location.hash = '#/';
  });

  it('renders LiveOutputTable rows when segment frames are published', async () => {
    // Navigate to live-output stage
    render(<DemoApp />);

    act(() => {
      window.location.hash = '#/stage/live-output';
      window.dispatchEvent(new Event('hashchange'));
    });

    // Wait for the All filter button (LiveOutputTable toolbar) to appear
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /all/i })).toBeInTheDocument();
    });

    // Publish two segment frames via the bus
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { jobId: 'job-demo-1', segmentId: 'seg-1' },
        payload: { status: 'running', progress: 0.25, segmentIndex: 0, segmentCount: 4 },
      });
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { jobId: 'job-demo-1', segmentId: 'seg-2' },
        payload: { status: 'running', progress: 0.5, segmentIndex: 1, segmentCount: 4 },
      });
    });

    // Both rows should appear (topic column)
    await waitFor(() => {
      const topicCells = screen.getAllByText('segments.progress');
      expect(topicCells.length).toBeGreaterThanOrEqual(2);
    });

    // Group column should show 1/4 for first frame
    await waitFor(() => {
      expect(screen.getByText('1/4')).toBeInTheDocument();
    });
  });
});
