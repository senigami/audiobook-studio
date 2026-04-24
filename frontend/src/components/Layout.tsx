import React, { useState } from 'react';
import { Mic, Settings as SettingsIcon, Zap, Library } from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { useLocation, useNavigate } from 'react-router-dom';
import type { StudioShellState } from '../app/navigation/model';
import { LAYERS } from '../app/layout/layering';

interface LayoutProps {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
  queueCount?: number;
  shellState?: Pick<StudioShellState, 'navigation' | 'hydration'>;
}

export const Layout: React.FC<LayoutProps> = ({ children, headerRight, queueCount, shellState }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [hoveredTab, setHoveredTab] = useState<string | null>(null);

  const getActiveTab = () => {
    if (shellState) {
      if (shellState.navigation.routeKind === 'queue') return 'queue';
      if (shellState.navigation.routeKind === 'voices') return 'voices';
      if (shellState.navigation.routeKind === 'settings') return 'settings';
      if (shellState.navigation.routeKind === 'library') return 'library';
      if (
        shellState.navigation.routeKind === 'project-overview' ||
        shellState.navigation.routeKind === 'project-chapters' ||
        shellState.navigation.routeKind === 'project-queue' ||
        shellState.navigation.routeKind === 'project-export' ||
        shellState.navigation.routeKind === 'project-settings' ||
        shellState.navigation.routeKind === 'chapter-editor'
      ) {
        return 'library';
      }
    }

    const path = location.pathname;
    if (path === '/' || path.startsWith('/project/')) return 'library';
    if (path.startsWith('/queue')) return 'queue';
    if (path.startsWith('/voices')) return 'voices';
    if (path.startsWith('/settings')) return 'settings';
    return 'library';
  };

  const activeTab = getActiveTab();

  const navItems = [
    { id: 'library', label: 'Library', icon: Library, path: '/' },
    { id: 'queue', label: 'Queue', icon: Zap, path: '/queue' },
    { id: 'voices', label: 'Voices', icon: Mic, path: '/voices' },
    { id: 'settings', label: 'Settings', icon: SettingsIcon, path: '/settings' },
  ];

  return (
    <div
      data-testid="layout-root"
      data-shell-hydration={shellState?.hydration.status || 'unknown'}
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100vw', backgroundColor: 'var(--bg)' }}
    >
      <header className="header-container" style={{
        height: 'var(--header-height, 72px)',
        width: '100%',
        position: 'fixed',
        top: 0,
        left: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 2rem',
        zIndex: LAYERS.HEADER,
        backgroundColor: 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2.5rem' }}>
          {/* Logo Section */}
          <div
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            onClick={() => navigate('/')}
          >
            <BrandLogo scale={0.8} showIcon={true} />
          </div>

          {/* Navigation Section */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(item.path)}
                onMouseEnter={() => setHoveredTab(item.id)}
                onMouseLeave={() => setHoveredTab(null)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className="btn-ghost"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-button)',
                  background: activeTab === item.id 
                    ? 'var(--accent)' 
                    : (hoveredTab === item.id ? 'var(--accent-glow)' : 'transparent'),
                  color: activeTab === item.id 
                    ? 'white' 
                    : (hoveredTab === item.id ? 'var(--text-primary)' : 'var(--text-secondary)'),
                  position: 'relative',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  border: 'none',
                  boxShadow: activeTab === item.id ? 'var(--shadow-sm)' : 'none',
                  fontWeight: 700
                }}
              >
                <item.icon size={16} strokeWidth={activeTab === item.id ? 2.5 : 2} />
                <span className="nav-label" style={{ fontSize: '0.9rem' }}>{item.label}</span>
                {item.id === 'queue' && queueCount !== undefined && queueCount > 0 && (
                   <div style={{ 
                       background: activeTab === item.id ? 'white' : 'var(--accent)', 
                       color: activeTab === item.id ? 'var(--accent)' : 'white', 
                       borderRadius: '6px', 
                       padding: '1px 6px', 
                       fontSize: '0.7rem', 
                       fontWeight: 800, 
                       marginLeft: '4px' 
                   }}>{queueCount}</div>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Global Controls Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {headerRight}
        </div>
      </header>

      <main className="mobile-padding" style={{
        flex: 1,
        marginTop: 'var(--header-height, 72px)',
        width: '100%',
        minHeight: 'calc(100vh - 72px)',
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
  );
};
