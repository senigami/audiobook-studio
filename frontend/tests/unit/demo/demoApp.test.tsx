/**
 * demoApp.test.tsx — tests for DemoStage, DemoApp, and liveOutputStage wiring.
 *
 * useDemoTransport is mocked (vi.mock) — tests control the stub directly.
 * The liveOutputStage test uses the REAL transport mock + real LiveOutputTable.
 */

import React from 'react';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
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
const { DemoApp, demoStages } = await import('@/demo/DemoApp');

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

  it('renders the stage title', () => {
    render(
      <DemoStage timeline={makeTimeline()} title="My Stage">
        <div>content</div>
      </DemoStage>,
    );
    expect(screen.getByText('My Stage')).toBeInTheDocument();
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
  beforeEach(() => {
    window.location.hash = '#/';
  });

  afterEach(() => {
    window.location.hash = '#/';
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

  it('stage hash with embedded query string still routes and hides the header', async () => {
    // The showcase iframe uses src="demo/#/stage/<id>?embed=1" — the query
    // lives inside the hash, so routing must strip it and embed must be detected.
    window.location.hash = `#/stage/${demoStages[0].id}?embed=1`;
    render(<DemoApp />);

    await waitFor(() => {
      expect(screen.getByText(demoStages[0].title)).toBeInTheDocument();
    });
    expect(screen.queryByText(/stage not found/i)).not.toBeInTheDocument();
    // embed=1 → header (with the "demo mode" badge) is hidden
    expect(screen.queryByText(/demo mode/i)).not.toBeInTheDocument();
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

  it('toggle button flips data-theme on documentElement', async () => {
    render(<DemoApp />);

    // Initial theme applied on mount
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('data-theme');
    });

    const initial = document.documentElement.getAttribute('data-theme');
    const toggleBtn = screen.getByRole('button', { name: /theme/i });
    fireEvent.click(toggleBtn);

    const flipped = document.documentElement.getAttribute('data-theme');
    expect(flipped).not.toBe(initial);
  });

  it('persists theme to localStorage under the shared studio-theme key', async () => {
    render(<DemoApp />);
    const toggleBtn = await screen.findByRole('button', { name: /theme/i });
    fireEvent.click(toggleBtn);

    const stored = localStorage.getItem('studio-theme');
    expect(['light', 'dark']).toContain(stored);
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
