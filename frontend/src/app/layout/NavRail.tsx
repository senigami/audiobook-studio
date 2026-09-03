import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildNavGroups, getActiveNavId } from '@/app/layout/navData';
import { LAYERS } from '@/app/layout/layering';
import { RailBookBlock } from '@/app/layout/RailBookBlock';
import {
  MAX_RAIL_WIDTH,
  MIN_RAIL_WIDTH,
  setRailCollapsed,
  setRailWidth,
  useRailCollapsed,
  useRailWidth,
} from '@/utils/railState';
import { useDevMode } from '@/utils/devMode';
import { useThemeToggle } from '@/utils/theme';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';

interface NavRailProps {
  queueCount?: number;
}

// A quick mouse pass-through over the 64px collapsed rail shouldn't flash the
// overlay open and shut — only a deliberate hover (dwell) should trigger it,
// and a brief moment of leaving shouldn't instantly snap it closed either.
const HOVER_EXPAND_DELAY_MS = 220;
const HOVER_COLLAPSE_DELAY_MS = 200;

export function NavRail({ queueCount }: NavRailProps) {
  const collapsed = useRailCollapsed();
  const railWidth = useRailWidth();
  const devMode = useDevMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimeout = useCallback(() => {
    if (hoverTimeoutRef.current !== null) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => clearHoverTimeout, [clearHoverTimeout]);
  const [isResizing, setIsResizing] = useState(false);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const bodyStylesRef = useRef<{ userSelect: string; cursor: string } | null>(null);
  const { ThemeIcon, themeLabel, themeAriaLabel, handleThemeToggle } = useThemeToggle();

  const groups = useMemo(() => buildNavGroups(devMode), [devMode]);
  const activeNavId = getActiveNavId(location.pathname);
  const showOverlay = collapsed && hoverExpanded;

  const finishResize = useCallback(() => {
    dragStateRef.current = null;
    setIsResizing(false);

    const previousStyles = bodyStylesRef.current;
    if (previousStyles) {
      document.body.style.userSelect = previousStyles.userSelect;
      document.body.style.cursor = previousStyles.cursor;
      bodyStylesRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isResizing) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      event.preventDefault();
      setRailWidth(dragState.startWidth + (event.clientX - dragState.startX));
    };

    const handlePointerEnd = () => {
      finishResize();
    };

    bodyStylesRef.current = {
      userSelect: document.body.style.userSelect,
      cursor: document.body.style.cursor,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      finishResize();
    };
  }, [finishResize, isResizing]);

  const handleResizePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (collapsed) {
      return;
    }

    event.preventDefault();
    dragStateRef.current = {
      startX: event.clientX,
      startWidth: railWidth,
    };
    setIsResizing(true);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (collapsed) {
      return;
    }

    const step = event.shiftKey ? 32 : 16;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setRailWidth(railWidth - step);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setRailWidth(railWidth + step);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setRailWidth(MIN_RAIL_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      setRailWidth(MAX_RAIL_WIDTH);
    }
  };

  const renderRailContent = (variant: 'expanded' | 'collapsed') => {
    const showLabels = variant === 'expanded';
    const compact = variant === 'collapsed';
    const ChevronIcon = compact ? ChevronRight : ChevronLeft;
    const chevronLabel = compact ? 'Expand rail' : 'Collapse rail';

    return (
      <>
        <div className="nav-rail__content-body">
          {groups.map((group) => (
            <section key={group.group} className="nav-rail__group">
              {showLabels ? <div className="nav-rail__group-label">{group.group}</div> : null}

              <div className="nav-rail__group-items">
                {group.items.map((item) => {
                  const isActive = activeNavId === item.id;
                  const isBadgeItem = item.badge === 'queue' && typeof queueCount === 'number' && queueCount > 0;

                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        className={isActive ? 'nav-rail__item nav-rail__item--active' : 'nav-rail__item'}
                        aria-current={isActive ? 'page' : undefined}
                        aria-label={item.label}
                        title={compact ? item.label : undefined}
                        onClick={() => navigate(item.path)}
                      >
                        <item.icon aria-hidden="true" size={18} strokeWidth={isActive ? 2.4 : 2} />

                        {showLabels ? <span className="nav-rail__label">{item.label}</span> : null}

                        {isBadgeItem ? (
                          <span
                            className={compact ? 'nav-rail__badge nav-rail__badge--collapsed' : 'nav-rail__badge'}
                          >
                            {queueCount}
                          </span>
                        ) : null}
                      </button>

                      {item.id === 'library' ? <RailBookBlock compact={compact} /> : null}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="nav-rail__bottom">
          {compact ? (
            <>
              <button
                type="button"
                className="nav-rail__bottom-button nav-rail__bottom-button--icon"
                onClick={handleThemeToggle}
                aria-label={themeAriaLabel}
                title={themeAriaLabel}
              >
                <ThemeIcon aria-hidden="true" size={18} />
              </button>

              <button
                type="button"
                className="nav-rail__bottom-button nav-rail__bottom-button--icon"
                onClick={() => setRailCollapsed(!collapsed)}
                aria-label={chevronLabel}
                title={chevronLabel}
              >
                <ChevronIcon aria-hidden="true" size={18} />
              </button>
            </>
          ) : (
            <div className="nav-rail__bottom-row">
              <button
                type="button"
                className="nav-rail__bottom-button nav-rail__bottom-button--theme"
                onClick={handleThemeToggle}
              >
                <ThemeIcon aria-hidden="true" size={18} />
                <span className="nav-rail__bottom-label">{themeLabel}</span>
              </button>

              <button
                type="button"
                className="nav-rail__bottom-button nav-rail__bottom-button--chevron"
                onClick={() => setRailCollapsed(!collapsed)}
                aria-label={chevronLabel}
                title={chevronLabel}
              >
                <ChevronIcon aria-hidden="true" size={18} />
              </button>
            </div>
          )}
        </div>
      </>
    );
  };

  return (
    <nav
      className={collapsed ? 'nav-rail nav-rail--collapsed' : 'nav-rail'}
      aria-label="Primary"
      style={{ '--nav-rail-expanded-width': `${railWidth}px` } as CSSProperties}
      onMouseEnter={() => {
        if (!collapsed) {
          return;
        }
        clearHoverTimeout();
        hoverTimeoutRef.current = setTimeout(() => {
          setHoverExpanded(true);
        }, HOVER_EXPAND_DELAY_MS);
      }}
      onMouseLeave={() => {
        clearHoverTimeout();
        hoverTimeoutRef.current = setTimeout(() => {
          setHoverExpanded(false);
        }, HOVER_COLLAPSE_DELAY_MS);
      }}
    >
      <div className="nav-rail__panel" aria-hidden={showOverlay ? true : undefined}>
        {renderRailContent(collapsed ? 'collapsed' : 'expanded')}
      </div>

      {!collapsed ? (
        <div
          className={isResizing ? 'nav-rail__resize-handle nav-rail__resize-handle--active' : 'nav-rail__resize-handle'}
          role="separator"
          aria-label="Resize sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_RAIL_WIDTH}
          aria-valuemax={MAX_RAIL_WIDTH}
          aria-valuenow={Math.round(railWidth)}
          tabIndex={0}
          onPointerDown={handleResizePointerDown}
          onKeyDown={handleResizeKeyDown}
        />
      ) : null}

      {showOverlay ? (
        <div className="nav-rail__overlay" style={{ zIndex: LAYERS.RAIL_OVERLAY }}>
          <div className="nav-rail__panel nav-rail__panel--overlay">{renderRailContent('expanded')}</div>
        </div>
      ) : null}
    </nav>
  );
}
