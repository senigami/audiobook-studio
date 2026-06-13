import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import type { StudioShellState } from '@/app/navigation/model';
import { MobileNavDrawer } from '@/app/layout/MobileNavDrawer';
import { NavRail } from '@/app/layout/NavRail';
import { TopBar } from '@/app/layout/TopBar';

interface LayoutProps {
  children: React.ReactNode;
  queueCount?: number;
  shellState?: Pick<StudioShellState, 'navigation' | 'hydration'>;
  onToggleQueue?: () => void;
  isQueueOpen?: boolean;
}

export const Layout: React.FC<LayoutProps> = ({ children, queueCount, shellState, onToggleQueue, isQueueOpen }) => {
  const [navOpen, setNavOpen] = useState(false);

  return (
    <div
      data-testid="layout-root"
      data-shell-hydration={shellState?.hydration.status || 'unknown'}
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100vw', backgroundColor: 'var(--bg)' }}
    >
      <div className="shell-grid">
        <NavRail queueCount={queueCount} />

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TopBar
            mobileNavButton={
              <button
                type="button"
                className="burger"
                aria-label="Open navigation"
                aria-expanded={navOpen}
                onClick={() => setNavOpen((open) => !open)}
              >
                <Menu aria-hidden="true" size={20} />
              </button>
            }
            shellState={shellState}
            queueCount={queueCount}
            isQueueOpen={isQueueOpen}
            onToggleQueue={onToggleQueue}
          />

          <main className="mobile-padding" style={{
            flex: 1,
            width: '100%',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            padding: '3rem 2.5rem'
          }}>
            <div style={{ maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
              {children}
            </div>
          </main>
        </div>
      </div>

      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} queueCount={queueCount} />
    </div>
  );
};
