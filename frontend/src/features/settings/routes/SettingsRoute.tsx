import React, { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon } from 'lucide-react';
import type { Settings as AppSettings, SpeakerProfile, TtsEngine } from '../../../types';
import {
  SETTINGS_TABS,
  VALID_SETTINGS_PATHS,
  getActiveSettingsTab,
  normalizeSettingsPath
} from './settingsRouteConfig';
import { SettingsTabLink, TabHeading } from './SettingsComponents';
import { GeneralSettingsPanel } from './GeneralSettingsPanel';
import { EnginesPanel } from './EnginesPanel';
import { ApiSettingsPanel } from './ApiSettingsPanel';
import { AboutSettingsPanel } from './AboutSettingsPanel';

interface SettingsRouteProps {
  settings: AppSettings | undefined;
  speakerProfiles?: SpeakerProfile[];
  speakers?: import('../../../types').Speaker[];
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
  startupReady = true,
  onRefresh,
  onShowNotification
}) => {
  const { pathname } = useLocation();
  const canonicalPathname = useMemo(() => normalizeSettingsPath(pathname), [pathname]);
  const activeTab = useMemo(() => getActiveSettingsTab(canonicalPathname), [canonicalPathname]);

  if (!VALID_SETTINGS_PATHS.has(canonicalPathname)) {
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
            'linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,247,255,0.86)), radial-gradient(circle at top right, rgba(255,138,31,0.16), transparent 36%)',
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
              color: 'var(--accent)',
              background: 'var(--accent-glow)',
              border: '1px solid rgba(43, 110, 255, 0.12)',
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
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 700 }}>
          Changes auto-save
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
            top: 'calc(var(--header-height, 72px) + 1.5rem)',
          }}
        >
          {SETTINGS_TABS.map((tab) => (
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
          {activeTab.id === 'engines' && (
            <EnginesPanel
              onShowNotification={onShowNotification}
              onRefresh={onRefresh}
              startupReady={startupReady}
            />
          )}
          {activeTab.id === 'api' && <ApiSettingsPanel />}
          {activeTab.id === 'about' && <AboutSettingsPanel onRefresh={onRefresh} />}
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
