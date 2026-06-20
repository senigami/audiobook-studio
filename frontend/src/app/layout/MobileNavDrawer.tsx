import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildNavGroups, getActiveNavId } from '@/app/layout/navData';
import { useDevMode } from '@/utils/devMode';
import { useThemeToggle } from '@/utils/theme';

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  queueCount?: number;
}

export function MobileNavDrawer({ open, onClose, queueCount }: MobileNavDrawerProps) {
  const devMode = useDevMode();
  const groups = useMemo(() => buildNavGroups(devMode), [devMode]);
  const location = useLocation();
  const navigate = useNavigate();
  const activeNavId = getActiveNavId(location.pathname);
  const { ThemeIcon, themeLabel, themeAriaLabel, handleThemeToggle } = useThemeToggle();

  if (!open) {
    return null;
  }

  const handleItemClick = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <>
      <div className="mobile-nav-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="mobile-nav-drawer" aria-label="Mobile navigation">
        <div className="mobile-nav-drawer__content">
          {groups.map((group) => (
            <section key={group.group} className="mobile-nav-drawer__group">
              <div className="mobile-nav-drawer__group-label">{group.group}</div>
              <div className="mobile-nav-drawer__group-items">
                {group.items.map((item) => {
                  const isActive = activeNavId === item.id;
                  const isBadgeItem = item.badge === 'queue' && typeof queueCount === 'number' && queueCount > 0;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={
                        isActive
                          ? 'mobile-nav-drawer__item mobile-nav-drawer__item--active'
                          : 'mobile-nav-drawer__item'
                      }
                      aria-current={isActive ? 'page' : undefined}
                      aria-label={item.label}
                      onClick={() => handleItemClick(item.path)}
                    >
                      <item.icon aria-hidden="true" size={18} strokeWidth={isActive ? 2.4 : 2} />
                      <span className="mobile-nav-drawer__label">{item.label}</span>
                      {isBadgeItem ? <span className="mobile-nav-drawer__badge">{queueCount}</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="mobile-nav-drawer__bottom">
          <button
            type="button"
            className="mobile-nav-drawer__theme"
            onClick={handleThemeToggle}
            aria-label={themeAriaLabel}
          >
            <ThemeIcon aria-hidden="true" size={18} />
            <span>{themeLabel}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
