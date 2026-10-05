import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import type { StudioShellState } from '@/app/navigation/model';
import { BookIdentityLine } from '@/app/layout/BookIdentityLine';
import { MobileNavDrawer } from '@/app/layout/MobileNavDrawer';
import { NavRail } from '@/app/layout/NavRail';
import { TopBar } from '@/app/layout/TopBar';
import { PlayerBar } from '@/app/layout/PlayerBar';

interface AppShellProps {
  children: React.ReactNode;
  queueCount?: number;
  shellState?: Pick<StudioShellState, 'navigation' | 'hydration'>;
  onToggleQueue?: () => void;
  isQueueOpen?: boolean;
}

export const AppShell: React.FC<AppShellProps> = ({ children, queueCount, shellState, onToggleQueue, isQueueOpen }) => {
  const [navOpen, setNavOpen] = useState(false);

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

      {/* shell-grid + PlayerBar are both flex children of this column
          (flexDirection: column on the root above). PlayerBar is docked —
          a normal-flow sibling with its own natural height (flex-shrink: 0,
          see .player-bar) — not a fixed overlay, so it never covers content.
          shell-grid's `flex: 1 1 auto; min-height: 0` (core.css) lets it
          shrink to make room whenever PlayerBar grows (e.g. the tape
          opening), and the inner content column's own `overflow-y: auto`
          keeps scrolling working within whatever space remains. */}
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
              padding: '3rem 2.5rem',
            }}
          >
            <div style={{ maxWidth: '1600px', width: '100%', margin: '0 auto' }}>
              {children}
            </div>
          </main>
        </div>
      </div>

      <PlayerBar />

      <MobileNavDrawer open={navOpen} onClose={() => setNavOpen(false)} queueCount={queueCount} />
    </div>
  );
};

