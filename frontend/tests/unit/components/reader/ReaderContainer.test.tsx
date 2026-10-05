/**
 * ReaderContainer.test.tsx
 *
 * Tests for frontend/src/components/reader/ReaderContainer.tsx (synced-reader
 * plan, Task 8) — the embedded / expanded (full browser) / OS-fullscreen
 * display-state escalation. `ReaderView` is rendered for real (not mocked —
 * R2: this file is named for ReaderContainer, and ReaderView is its own
 * collaborator, not an external boundary); the external boundary mocked here
 * is the browser Fullscreen API (jsdom does not implement it — same boundary
 * useFullscreen.test.ts mocks).
 *
 * The Fullscreen API is feature-detected once the container element mounts
 * (see useFullscreen.ts), so tests that exercise the fullscreen control stub
 * `HTMLElement.prototype.requestFullscreen` BEFORE the dialog mounts (i.e.
 * before clicking "expand"), matching how real browsers expose the API on
 * every element rather than one added after the fact.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ReaderContainer } from '@/components/reader/ReaderContainer';
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

function segmentTextById(id: string): string {
  return id === 's0' ? 'Hello there.' : '';
}

function baseProps() {
  return {
    activeGroup: group(),
    prev: null,
    next: null,
    groupProgress: 0,
    isTrackingThisChapter: true,
    segmentTextById,
  };
}

function setFullscreenElement(el: Element | null) {
  Object.defineProperty(document, 'fullscreenElement', {
    value: el,
    configurable: true,
  });
}

function dispatchFullscreenChange() {
  document.dispatchEvent(new Event('fullscreenchange'));
}

/** Installs a Fullscreen API stub on every element, mirroring real browsers. */
function stubFullscreenApiSupported() {
  HTMLElement.prototype.requestFullscreen = vi.fn(function (this: HTMLElement) {
    setFullscreenElement(this);
    dispatchFullscreenChange();
    return Promise.resolve();
  });
  document.exitFullscreen = vi.fn().mockImplementation(() => {
    setFullscreenElement(null);
    dispatchFullscreenChange();
    return Promise.resolve();
  });
}

describe('ReaderContainer', () => {
  afterEach(() => {
    setFullscreenElement(null);
    // @ts-expect-error -- tearing down the per-test Fullscreen API stub
    delete HTMLElement.prototype.requestFullscreen;
    // @ts-expect-error -- tearing down the per-test Fullscreen API stub
    delete document.exitFullscreen;
    // NOTE: deliberately not vi.restoreAllMocks() here -- that would also
    // restore vitest.setup.ts's global window.matchMedia stub (a plain
    // vi.fn().mockImplementation(...), not a vi.spyOn) back to a no-op
    // returning undefined, breaking every subsequent test in this file that
    // renders ReaderView (which reads prefers-reduced-motion via matchMedia).
  });

  it('starts in the embedded state (no dialog present, expand control shown)', () => {
    render(<ReaderContainer {...baseProps()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText(/expand/i)).toBeTruthy();
  });

  it('clicking expand moves to the expanded state, exposes a dialog, and moves focus into it', () => {
    render(<ReaderContainer {...baseProps()} />);
    const expandBtn = screen.getByLabelText(/expand/i);
    (expandBtn as HTMLElement).focus();

    fireEvent.click(expandBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('data-display-state')).toBe('expanded');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('clicking fullscreen (mocked requestFullscreen) reaches the fullscreen state', () => {
    stubFullscreenApiSupported();
    render(<ReaderContainer {...baseProps()} />);
    fireEvent.click(screen.getByLabelText(/expand/i));

    const fullscreenBtn = screen.getByLabelText(/enter fullscreen/i);
    fireEvent.click(fullscreenBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog.requestFullscreen).toHaveBeenCalledTimes(1);
    expect(dialog.getAttribute('data-display-state')).toBe('fullscreen');
  });

  it('a native fullscreenchange clearing fullscreenElement returns to "expanded", not "embedded"', () => {
    stubFullscreenApiSupported();
    render(<ReaderContainer {...baseProps()} />);
    fireEvent.click(screen.getByLabelText(/expand/i));
    fireEvent.click(screen.getByLabelText(/enter fullscreen/i));
    expect(screen.getByRole('dialog').getAttribute('data-display-state')).toBe('fullscreen');

    // Simulate the browser's own native Escape exiting OS fullscreen: it
    // clears fullscreenElement and fires fullscreenchange without ever
    // calling through our own handlers.
    act(() => {
      setFullscreenElement(null);
      dispatchFullscreenChange();
    });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute('data-display-state')).toBe('expanded');
  });

  it('pressing Escape while expanded (not fullscreen) returns to embedded and restores focus to the trigger', () => {
    render(<ReaderContainer {...baseProps()} />);
    const expandBtn = screen.getByLabelText(/expand/i);
    (expandBtn as HTMLElement).focus();
    fireEvent.click(expandBtn);

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText(/expand/i));
  });

  it('hides the fullscreen control when the Fullscreen API is unsupported', async () => {
    // No stub installed: jsdom's HTMLElement has no requestFullscreen by default.
    render(<ReaderContainer {...baseProps()} />);
    fireEvent.click(screen.getByLabelText(/expand/i));

    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.queryByLabelText(/enter fullscreen/i)).toBeNull();
  });

  // ── startExpanded (synced-reader plan, Task 9 — standalone reader route) ───
  it('starts directly in the expanded (dialog) state when startExpanded is true', () => {
    render(<ReaderContainer {...baseProps()} startExpanded />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('data-display-state')).toBe('expanded');
  });

  it('startExpanded defaults to false (unchanged "starts embedded" behavior)', () => {
    render(<ReaderContainer {...baseProps()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
