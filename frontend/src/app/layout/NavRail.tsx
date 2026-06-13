import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildNavGroups, getActiveNavId } from '@/app/layout/navData';
import { LAYERS } from '@/app/layout/layering';
import { RailBookBlock } from '@/app/layout/RailBookBlock';
import { setRailCollapsed, useRailCollapsed } from '@/utils/railState';
import { useDevMode } from '@/utils/devMode';
import { useThemeToggle } from '@/utils/theme';

interface NavRailProps {
  queueCount?: number;
}

export function NavRail({ queueCount }: NavRailProps) {
  const collapsed = useRailCollapsed();
  const devMode = useDevMode();
  const location = useLocation();
  const navigate = useNavigate();
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const { ThemeIcon, themeLabel, themeAriaLabel, handleThemeToggle } = useThemeToggle();

  const groups = useMemo(() => buildNavGroups(devMode), [devMode]);
  const activeNavId = getActiveNavId(location.pathname);
  const showOverlay = collapsed && hoverExpanded;

  const renderRailContent = (variant: 'expanded' | 'collapsed') => {
    const showLabels = variant === 'expanded';
    const compact = variant === 'collapsed';
    const ChevronIcon = compact ? ChevronRight : ChevronLeft;
    const chevronLabel = compact ? 'Expand rail' : 'Collapse rail';

    return (
      <>
        <div className="nav-rail__content-body">
          <RailBookBlock compact={compact} />

          {groups.map((group) => (
            <section key={group.group} className="nav-rail__group">
              {showLabels ? <div className="nav-rail__group-label">{group.group}</div> : null}

              <div className="nav-rail__group-items">
                {group.items.map((item) => {
                  const isActive = activeNavId === item.id;
                  const isBadgeItem = item.badge === 'queue' && typeof queueCount === 'number' && queueCount > 0;

                  return (
                    <button
                      key={item.id}
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
      onMouseEnter={() => {
        if (collapsed) {
          setHoverExpanded(true);
        }
      }}
      onMouseLeave={() => {
        setHoverExpanded(false);
      }}
    >
      <div className="nav-rail__panel" aria-hidden={showOverlay ? true : undefined}>
        {renderRailContent(collapsed ? 'collapsed' : 'expanded')}
      </div>

      {showOverlay ? (
        <div className="nav-rail__overlay" style={{ zIndex: LAYERS.RAIL_OVERLAY }}>
          <div className="nav-rail__panel nav-rail__panel--overlay">{renderRailContent('expanded')}</div>
        </div>
      ) : null}
    </nav>
  );
}
