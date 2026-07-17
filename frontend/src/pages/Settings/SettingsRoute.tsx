import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import type { Settings as AppSettings, SpeakerProfile, TtsEngine } from '@/types';
import {
  SETTINGS_TABS,
  SETTINGS_REDIRECTS,
  VALID_SETTINGS_PATHS,
  getActiveSettingsTab,
  normalizeSettingsPath
} from '@/pages/Settings/settingsRouteConfig';
import { SettingsTabLink, TabHeading } from '@/pages/Settings/components/SettingsComponents';
import { GeneralSettingsPanel } from '@/pages/Settings/components/GeneralSettingsPanel';
import { AboutSettingsPanel } from '@/pages/Settings/components/AboutSettingsPanel';
import { DeveloperSettingsPanel } from '@/pages/Settings/components/DeveloperSettingsPanel';
import { useDevMode } from '@/utils/devMode';

interface SettingsRouteProps {
  settings: AppSettings | undefined;
  speakerProfiles?: SpeakerProfile[];
  speakers?: import('@/types').Speaker[];
  engines?: TtsEngine[];
  startupReady?: boolean;
  onRefresh: () => void;
  onShowNotification?: (message: string) => void;
}

export const SettingsRoute: React.FC<SettingsRouteProps> = ({
  settings,
  speakerProfiles,
  speakers = [],
  engines = [],
  startupReady: _startupReady = true,
  onRefresh,
  onShowNotification
}) => {
  const { pathname } = useLocation();
  const devMode = useDevMode();
  const canonicalPathname = useMemo(() => normalizeSettingsPath(pathname), [pathname]);
  const activeTab = useMemo(() => getActiveSettingsTab(canonicalPathname), [canonicalPathname]);
  const visibleTabs = useMemo(
    () => SETTINGS_TABS.filter((tab) => !tab.devOnly || devMode),
    [devMode]
  );

  if (!VALID_SETTINGS_PATHS.has(canonicalPathname)) {
    return <Navigate to="/settings" replace />;
  }
  // Redirect old sub-paths that have been re-homed to standalone pages (R-G).
  const redirectTarget = SETTINGS_REDIRECTS[canonicalPathname];
  if (redirectTarget) {
    return <Navigate to={redirectTarget} replace />;
  }
  // Redirect away from /settings/developer if dev mode is off
  if (activeTab.id === 'developer' && !devMode) {
    return <Navigate to="/settings" replace />;
  }

  return (
    <section aria-labelledby="settings-title" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <header
        className="glass-panel"
        style={{
          padding: '1.4rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          background:
            'linear-gradient(135deg, var(--surface-glass-white), var(--surface-tinted-light)), radial-gradient(circle at top right, var(--accent-tint-bg), transparent 36%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '16px',
              display: 'grid',
              placeItems: 'center',
              color: 'var(--action-primary)',
              background: 'var(--accent-glow)',
              border: '1px solid var(--accent-focus-ring)',
            }}
          >
            <SettingsIcon size={24} />
          </div>
          <div>
            <p style={{ margin: '0 0 0.25rem 0', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Studio Controls
            </p>
            <h1 id="settings-title" style={{ margin: 0, fontSize: '2rem', color: 'var(--text-primary)' }}>
              Settings
            </h1>
          </div>
        </div>
      </header>

      <div
        className="settings-route-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)',
          gap: '1.25rem',
          alignItems: 'start',
        }}
      >
        <nav
          aria-label="Settings sections"
          className="glass-panel settings-route-nav"
          style={{
            padding: '0.75rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
            position: 'sticky',
            top: 'calc(var(--header-height, 56px) + 1.5rem)',
          }}
        >
          {visibleTabs.map((tab) => (
            <SettingsTabLink key={tab.id} tab={tab} active={tab.id === activeTab.id} />
          ))}
        </nav>

        <div className="glass-panel" style={{ padding: '1.5rem', minWidth: 0 }}>
          <TabHeading tab={activeTab} />
          {activeTab.id === 'general' && (
            <GeneralSettingsPanel
              settings={settings}
              speakerProfiles={speakerProfiles}
              speakers={speakers}
              engines={engines}
              onRefresh={onRefresh}
              onShowNotification={onShowNotification}
            />
          )}
          {activeTab.id === 'about' && <AboutSettingsPanel onRefresh={onRefresh} />}
          {activeTab.id === 'developer' && <DeveloperSettingsPanel />}
        </div>
      </div>
    </section>
  );
};

export const createSettingsRoute = () => {
  consumeContractMarkers([SETTINGS_TABS]);
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
