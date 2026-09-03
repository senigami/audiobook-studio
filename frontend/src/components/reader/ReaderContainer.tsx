import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Maximize, Maximize2, Minimize2, X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useFullscreen } from '@/hooks/useFullscreen';
import { ReaderView, type ReaderViewProps } from '@/components/reader/ReaderView';

export type ReaderDisplayState = 'embedded' | 'expanded' | 'fullscreen';

export interface ReaderContainerProps extends ReaderViewProps {
  /**
   * Mount straight into the "expanded" (full-browser overlay) display state
   * instead of "embedded" — used by the standalone reader route (synced-reader
   * plan, Task 9 "entry points"), where a small 320px embedded card floating
   * alone on an otherwise-blank page reads oddly; the existing full-browser
   * overlay chrome (close/fullscreen controls) already IS the "full page"
   * presentation, so this reuses it rather than adding a fourth display state.
   * Defaults to `false` (existing "starts in embedded" behavior, unchanged).
   */
  startExpanded?: boolean;
}

const EMBEDDED_STYLE: CSSProperties = {
  position: 'relative',
  height: '320px',
  borderRadius: 'var(--radius-card)',
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const OVERLAY_STYLE: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2000,
  background: 'var(--surface)',
  display: 'flex',
  flexDirection: 'column',
};

const TOOLBAR_STYLE: CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '0.5rem',
  padding: '0.75rem 1rem',
};

const READER_BODY_STYLE: CSSProperties = { flex: 1, minHeight: 0 };

/**
 * `ReaderContainer` — display-state escalation (synced-reader plan,
 * `03-reader-frontend.md` "Display-state escalation"): embedded (compact
 * card) -> expanded (full-browser overlay) -> OS fullscreen. `ReaderView` is
 * rendered identically across all three; only the surrounding chrome/size
 * changes here.
 *
 * Fullscreen state is never tracked independently — it's derived from
 * `useFullscreen`'s own `fullscreenchange`-driven `isFullscreen`, so a
 * native Escape exit (browser-handled, no call through our handlers) still
 * lands on "expanded" rather than desyncing.
 */
export function ReaderContainer({ startExpanded = false, ...props }: ReaderContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [displayState, setDisplayState] = useState<ReaderDisplayState>(startExpanded ? 'expanded' : 'embedded');
  const fullscreen = useFullscreen(containerRef);

  const isOverlayOpen = displayState !== 'embedded';
  // Reuses the same focus-trap/restore pattern as ConfirmModal/PluginTrustModal:
  // captures document.activeElement (the expand button that was just clicked)
  // when isOpen flips true, focuses the first focusable element inside the
  // container, and restores the captured element's focus when isOpen flips
  // back to false.
  useFocusTrap(containerRef, isOverlayOpen);

  // Keep displayState in sync with the actual DOM fullscreen state via
  // useFullscreen's own fullscreenchange listener, rather than tracking OS
  // fullscreen independently in a way that could desync.
  useEffect(() => {
    if (fullscreen.isFullscreen) {
      setDisplayState('fullscreen');
    } else {
      setDisplayState(current => (current === 'fullscreen' ? 'expanded' : current));
    }
  }, [fullscreen.isFullscreen]);

  const handleExpand = () => setDisplayState('expanded');

  const handleEnterFullscreen = () => fullscreen.enter();

  const handleClose = () => {
    if (fullscreen.isFullscreen) {
      fullscreen.exit();
    }
    setDisplayState('embedded');
  };

  const handleOverlayKeyDown = (e: React.KeyboardEvent) => {
    // Escape closes back to embedded only from "expanded" (keyboard users who
    // never invoked real OS fullscreen). In "fullscreen", the browser's own
    // native Escape exits OS fullscreen and fullscreenchange handles the rest.
    if (e.key === 'Escape' && displayState === 'expanded') {
      handleClose();
    }
  };

  // The embedded card (and its expand button) stays mounted across every
  // display-state transition — it is NOT swapped out for the overlay via a
  // mutually-exclusive branch. Two reasons: (1) the overlay is itself
  // `position: fixed; inset: 0` above it, so nothing is visually different
  // to the user; (2) focus restoration on close needs to hand focus back to
  // the *same* trigger element instance, which only works if that element
  // was never unmounted while the overlay was open (a fresh remount would
  // be a different DOM node the stored ref could no longer focus). While the
  // overlay is open, `ReaderView` renders only inside the overlay — not
  // duplicated in the (now content-less, aria-hidden) embedded card — since
  // `groupProgress` updates continuously during playback and a hidden
  // duplicate would double that render cost for no visible benefit.
  return (
    <>
      <div
        className="reader-container reader-container--embedded"
        style={EMBEDDED_STYLE}
        aria-hidden={isOverlayOpen ? true : undefined}
      >
        <div style={TOOLBAR_STYLE}>
          <button
            type="button"
            onClick={handleExpand}
            aria-label="Expand reader"
            className="btn-ghost"
            tabIndex={isOverlayOpen ? -1 : undefined}
          >
            <Maximize2 size={16} aria-hidden="true" />
          </button>
        </div>
        <div style={READER_BODY_STYLE}>{!isOverlayOpen && <ReaderView {...props} />}</div>
      </div>

      {isOverlayOpen && (
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-label="Reader"
          tabIndex={-1}
          data-display-state={displayState}
          onKeyDown={handleOverlayKeyDown}
          style={OVERLAY_STYLE}
        >
          <div style={TOOLBAR_STYLE}>
            {fullscreen.isSupported && displayState === 'expanded' && (
              <button
                type="button"
                onClick={handleEnterFullscreen}
                aria-label="Enter fullscreen"
                className="btn-ghost"
              >
                <Maximize size={16} aria-hidden="true" />
              </button>
            )}
            <button type="button" onClick={handleClose} aria-label="Close reader" className="btn-ghost">
              {displayState === 'fullscreen' ? (
                <Minimize2 size={16} aria-hidden="true" />
              ) : (
                <X size={16} aria-hidden="true" />
              )}
            </button>
          </div>
          <div style={READER_BODY_STYLE}>
            <ReaderView {...props} />
          </div>
        </div>
      )}
    </>
  );
}
