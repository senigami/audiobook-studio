/**
 * ReaderView.test.tsx
 *
 * Tests for frontend/src/components/reader/ReaderView.tsx (synced-reader
 * plan, Task 8) — the "player-piano" focal block. Covers the LOGIC branches
 * only (idle / unavailable / tracking-with-text / reduced-motion path), per
 * this task's brief ("test the logic, not pixel-perfect animation").
 *
 * Mocks: window.matchMedia (external OS API; jsdom does not implement it —
 * same boundary useMediaQuery.test.ts mocks). Does NOT mock ReaderView or
 * useMediaQuery themselves (R2).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReaderView } from '@/components/reader/ReaderView';
import type { ChapterTimingGroup } from '@/api/contracts/chapterTiming';

function group(overrides: Partial<ChapterTimingGroup> = {}): ChapterTimingGroup {
  return {
    group_id: 'g0',
    segment_ids: ['s0'],
    order: 0,
    start_ms: 0,
    end_ms: 1000,
    duration_ms: 1000,
    ...overrides,
  };
}

const SEGMENT_TEXT: Record<string, string> = {
  s0: 'The wind picked up.',
  s1: 'She turned to face it.',
  s2: 'Nothing moved.',
};

function segmentTextById(id: string): string {
  return SEGMENT_TEXT[id] ?? '';
}

function mockMatchMedia(matches: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

describe('ReaderView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the activeGroup\'s resolved text via segmentTextById when tracking + timing present', () => {
    mockMatchMedia(false);
    render(
      <ReaderView
        activeGroup={group({ group_id: 'g0', segment_ids: ['s0'] })}
        prev={null}
        next={group({ group_id: 'g1', segment_ids: ['s1'], order: 1, start_ms: 1000, end_ms: 2000 })}
        groupProgress={0.25}
        isTrackingThisChapter
        segmentTextById={segmentTextById}
      />,
    );

    const active = screen.getByTestId('reader-active-block');
    expect(active.textContent).toContain('The wind picked up.');
    // Neighbour is rendered faint/partial for continuity, not omitted.
    expect(screen.getByText('She turned to face it.')).toBeTruthy();
  });

  it('joins multiple segment_ids into the displayed text for a multi-segment group', () => {
    mockMatchMedia(false);
    render(
      <ReaderView
        activeGroup={group({ group_id: 'g0', segment_ids: ['s0', 's1'] })}
        prev={null}
        next={null}
        groupProgress={0}
        isTrackingThisChapter
        segmentTextById={segmentTextById}
      />,
    );
    const active = screen.getByTestId('reader-active-block');
    expect(active.textContent).toContain('The wind picked up.');
    expect(active.textContent).toContain('She turned to face it.');
  });

  it('shows an idle (not an error) state when isTrackingThisChapter is false', () => {
    mockMatchMedia(false);
    render(
      <ReaderView
        activeGroup={null}
        prev={null}
        next={null}
        groupProgress={0}
        isTrackingThisChapter={false}
        segmentTextById={segmentTextById}
      />,
    );
    expect(screen.getByTestId('reader-idle')).toBeTruthy();
    expect(screen.queryByTestId('reader-unavailable')).toBeNull();
    expect(screen.queryByTestId('reader-active-block')).toBeNull();
  });

  it('shows the "sync unavailable" message when tracking but activeGroup is null (no sidecar)', () => {
    mockMatchMedia(false);
    render(
      <ReaderView
        activeGroup={null}
        prev={null}
        next={null}
        groupProgress={0}
        isTrackingThisChapter
        segmentTextById={segmentTextById}
      />,
    );
    const unavailable = screen.getByTestId('reader-unavailable');
    expect(unavailable.textContent?.toLowerCase()).toContain('sync unavailable');
    expect(unavailable.textContent?.toLowerCase()).toContain('re-render');
    expect(screen.queryByTestId('reader-idle')).toBeNull();
  });

  it('renders via the simple-swap (non-animated) path when prefers-reduced-motion matches', () => {
    mockMatchMedia(true);
    render(
      <ReaderView
        activeGroup={group()}
        prev={null}
        next={null}
        groupProgress={0.6}
        isTrackingThisChapter
        segmentTextById={segmentTextById}
      />,
    );
    const active = screen.getByTestId('reader-active-block');
    expect(active.getAttribute('data-animated')).toBe('false');
  });

  it('renders via the animated (Framer Motion) path when prefers-reduced-motion does not match', () => {
    mockMatchMedia(false);
    render(
      <ReaderView
        activeGroup={group()}
        prev={null}
        next={null}
        groupProgress={0.6}
        isTrackingThisChapter
        segmentTextById={segmentTextById}
      />,
    );
    const active = screen.getByTestId('reader-active-block');
    expect(active.getAttribute('data-animated')).toBe('true');
  });

  // ── Bidirectional seek (03-reader-frontend.md — reader-block-click fallback) ──
  it('calls onActiveBlockClick when the active block is clicked', () => {
    mockMatchMedia(false);
    const onActiveBlockClick = vi.fn();
    render(
      <ReaderView
        activeGroup={group()}
        prev={null}
        next={null}
        groupProgress={0}
        isTrackingThisChapter
        segmentTextById={segmentTextById}
        onActiveBlockClick={onActiveBlockClick}
      />,
    );
    screen.getByTestId('reader-active-block').click();
    expect(onActiveBlockClick).toHaveBeenCalledTimes(1);
  });

  it('does not error and has no click handler wired when onActiveBlockClick is omitted', () => {
    mockMatchMedia(false);
    render(
      <ReaderView
        activeGroup={group()}
        prev={null}
        next={null}
        groupProgress={0}
        isTrackingThisChapter
        segmentTextById={segmentTextById}
      />,
    );
    expect(() => screen.getByTestId('reader-active-block').click()).not.toThrow();
  });
});
