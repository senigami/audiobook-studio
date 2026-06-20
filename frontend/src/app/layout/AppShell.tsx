import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import type { StudioShellState } from '@/app/navigation/model';
import { BookIdentityLine } from '@/app/layout/BookIdentityLine';
import { MobileNavDrawer } from '@/app/layout/MobileNavDrawer';
import { NavRail } from '@/app/layout/NavRail';
import { TopBar } from '@/app/layout/TopBar';
import { PlayerBar } from '@/app/layout/PlayerBar';
import { usePlayerBus } from '@/store/playerBus';

interface AppShellProps {
  children: React.ReactNode;
  queueCount?: number;
  shellState?: Pick<StudioShellState, 'navigation' | 'hydration'>;
  onToggleQueue?: () => void;
  isQueueOpen?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ children, queueCount, shellState, onToggleQueue, isQueueOpen }) => {
  const [navOpen, setNavOpen] = useState(false);
  const { audioUrl } = usePlayerBus();

  return (
    <div
      data-testid="layout-root"
      data-shell-hydration={shellState?.hydration.status || 'unknown'}
      style={{ display: 'flex', flexDirection: 'column', height: '100dvh', width: '100vw', overflow: 'hidden', backgroundColor: 'var(--bg)' }}
    >
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
        identitySlot={<BookIdentityLine />}
        queueCount={queueCount}
        isQueueOpen={isQueueOpen}
        onToggleQueue={onToggleQueue}
      />

      <div className="shell-grid">
        <NavRail queueCount={queueCount} />

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflowY: 'auto' }}>
          <main
            className="mobile-padding"
            style={{
              flex: 1,
              width: '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              padding: audioUrl ? '3rem 2.5rem calc(3rem + 56px) 2.5rem' : '3rem 2.5rem',
            }}
          >
            <div style={{ maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
              {children}
            </div>
          </main>
        </div>
      </div>

      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} queueCount={queueCount} />
      <PlayerBar />
    </div>
  );
};

