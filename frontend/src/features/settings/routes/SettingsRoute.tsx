import React, { useMemo, useState } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import {
  Activity,
  BadgeInfo,
  ChevronDown,
  Cloud,
  PlugZap,
  RefreshCw,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Music,
} from 'lucide-react';
import type { Settings as AppSettings } from '../../../types';

type SettingsTabId = 'general' | 'engines' | 'api' | 'about';

interface SettingsRouteProps {
  settings: AppSettings | undefined;
  onRefresh: () => void;
  onShowNotification?: (message: string) => void;
}

interface SettingsTab {
  id: SettingsTabId;
  label: string;
  path: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}

const SETTINGS_TABS: SettingsTab[] = [
  {
    id: 'general',
    label: 'General',
    path: '/settings',
    description: 'Core synthesis defaults and maintenance actions.',
    icon: SlidersHorizontal,
  },
  {
    id: 'engines',
    label: 'TTS Engines',
    path: '/settings/engines',
    description: 'Plugin cards, verification state, and engine-specific settings.',
    icon: PlugZap,
  },
  {
    id: 'api',
    label: 'API',
    path: '/settings/api',
    description: 'Local API access, authentication, and queue priority.',
    icon: Server,
  },
  {
    id: 'about',
    label: 'About',
    path: '/settings/about',
    description: 'Studio version, runtime health, and system information.',
    icon: BadgeInfo,
  },
];

const VALID_SETTINGS_PATHS = new Set(SETTINGS_TABS.map((tab) => tab.path));

export const SettingsRoute: React.FC<SettingsRouteProps> = ({ settings, onRefresh, onShowNotification }) => {
  const { pathname } = useLocation();
  const activeTab = useMemo(() => getActiveSettingsTab(pathname), [pathname]);

  if (!VALID_SETTINGS_PATHS.has(pathname)) {
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
              onRefresh={onRefresh}
              onShowNotification={onShowNotification}
            />
          )}
          {activeTab.id === 'engines' && <EnginesFoundationPanel settings={settings} />}
          {activeTab.id === 'api' && <ApiFoundationPanel />}
          {activeTab.id === 'about' && <AboutFoundationPanel />}
        </div>
      </div>
    </section>
  );
};

export const createSettingsRoute = () => {
  consumeContractMarkers([SETTINGS_TABS]);
  return null;
};

const getActiveSettingsTab = (pathname: string): SettingsTab => {
  if (pathname === '/settings/engines') return SETTINGS_TABS[1];
  if (pathname === '/settings/api') return SETTINGS_TABS[2];
  if (pathname === '/settings/about') return SETTINGS_TABS[3];
  return SETTINGS_TABS[0];
};

const SettingsTabLink: React.FC<{ tab: SettingsTab; active: boolean }> = ({ tab, active }) => {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.path}
      end={tab.path === '/settings'}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.85rem',
        borderRadius: '12px',
        textDecoration: 'none',
        color: active ? 'white' : 'var(--text-secondary)',
        background: active ? 'var(--accent)' : 'transparent',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        fontWeight: 800,
      }}
    >
      <Icon size={17} strokeWidth={active ? 2.6 : 2} />
      <span>{tab.label}</span>
    </NavLink>
  );
};

const TabHeading: React.FC<{ tab: SettingsTab }> = ({ tab }) => {
  const Icon = tab.icon;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '1.25rem' }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '12px',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--accent)',
          background: 'var(--accent-glow)',
        }}
      >
        <Icon size={20} />
      </div>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{tab.label}</h2>
        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {tab.description}
        </p>
      </div>
    </div>
  );
};

const GeneralSettingsPanel: React.FC<SettingsRouteProps> = ({ settings, onRefresh, onShowNotification }) => {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const updateBooleanSetting = async (key: 'safe_mode' | 'make_mp3', currentValue: boolean) => {
    setSavingKey(key);
    try {
      const formData = new URLSearchParams();
      formData.append(key, (!currentValue).toString());
      await fetch('/settings', { method: 'POST', body: formData });
      onRefresh();
    } catch (error) {
      console.error('Failed to update setting', error);
      onShowNotification?.('Settings update failed. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  const queueBackfill = async () => {
    setSavingKey('backfill');
    try {
      await fetch('/queue/backfill_mp3', { method: 'POST' });
      onRefresh();
      onShowNotification?.('Generating missing MP3s. Check queue for progress.');
    } catch (error) {
      console.error('Failed to start MP3 backfill', error);
      onShowNotification?.('Could not queue MP3 backfill.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <SettingCard
        icon={ShieldCheck}
        title="Safe Mode"
        description="Auto-recover the synthesis engine after errors."
        action={
          <ToggleButton
            enabled={!!settings?.safe_mode}
            busy={savingKey === 'safe_mode'}
            onClick={() => updateBooleanSetting('safe_mode', !!settings?.safe_mode)}
          />
        }
      />
      <SettingCard
        icon={Music}
        title="Produce MP3"
        description="Generate MP3 files alongside WAV output for compatible exports."
        action={
          <ToggleButton
            enabled={!!settings?.make_mp3}
            busy={savingKey === 'make_mp3'}
            onClick={() => updateBooleanSetting('make_mp3', !!settings?.make_mp3)}
          />
        }
      />
      <SettingCard
        icon={RefreshCw}
        title="Backfill MP3s"
        description="Queue generation for existing WAV renders that are missing MP3 companions."
        action={
          <button
            type="button"
            className="btn-glass"
            disabled={savingKey === 'backfill' || !settings?.make_mp3}
            onClick={queueBackfill}
            style={{ padding: '0.55rem 0.85rem', borderRadius: '10px', fontWeight: 800, border: '1px solid var(--border)' }}
          >
            {savingKey === 'backfill' ? 'Queueing...' : 'Start'}
          </button>
        }
      />
    </div>
  );
};

const EnginesFoundationPanel: React.FC<{ settings: AppSettings | undefined }> = ({ settings }) => {
  const voxtralConfigured = !!settings?.mistral_api_key?.trim();
  const voxtralReady = voxtralConfigured && !!settings?.voxtral_enabled;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <EnginePreviewCard
        title="XTTS Local"
        subtitle="Local engine card foundation"
        badge="Ready"
        badgeTone="blue"
        description="Phase 7 will replace this foundation state with plugin-discovered engine metadata and schema-driven settings."
      />
      <EnginePreviewCard
        title="Voxtral Cloud Voices"
        subtitle="Cloud engine privacy boundary"
        badge={voxtralReady ? 'Ready' : voxtralConfigured ? 'Needs Setup' : 'Not Loaded'}
        badgeTone={voxtralReady ? 'blue' : voxtralConfigured ? 'yellow' : 'gray'}
        description="This card reserves the cloud disclosure and plugin action area before engine data is fully hydrated from the TTS Server."
        cloud
      />
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
        <button type="button" className="btn-glass" disabled style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800 }}>
          Install Plugin
        </button>
        <button type="button" className="btn-glass" disabled style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800 }}>
          Refresh Plugins
        </button>
      </div>
    </div>
  );
};

const ApiFoundationPanel = () => (
  <FoundationCallout
    icon={Server}
    title="API controls are ready for backend wiring"
    body="The deep-linkable API surface is in place. A later slice can attach enablement, bind address, API key, and task-priority persistence without changing the route structure."
  />
);

const AboutFoundationPanel = () => (
  <FoundationCallout
    icon={Activity}
    title="About and health readouts have a home"
    body="This tab will host Studio version, TTS Server status, engine counts, and runtime details once the health payload is connected."
  />
);

const SettingCard: React.FC<{
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '1rem',
      padding: '1rem',
      borderRadius: '14px',
      border: '1px solid var(--border)',
      background: 'var(--surface-light)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
      <div style={{ color: 'var(--accent)', marginTop: '0.1rem' }}>
        <Icon size={20} />
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
    </div>
    {action}
  </div>
);

const ToggleButton: React.FC<{ enabled: boolean; busy: boolean; onClick: () => void }> = ({ enabled, busy, onClick }) => (
  <button
    type="button"
    disabled={busy}
    onClick={onClick}
    className={enabled ? 'btn-primary' : 'btn-glass'}
    style={{ padding: '0.5rem 0.85rem', borderRadius: '10px', minWidth: 70, fontWeight: 900, border: enabled ? 'none' : '1px solid var(--border)' }}
  >
    {busy ? '...' : enabled ? 'ON' : 'OFF'}
  </button>
);

const EnginePreviewCard: React.FC<{
  title: string;
  subtitle: string;
  badge: string;
  badgeTone: 'blue' | 'yellow' | 'gray';
  description: string;
  cloud?: boolean;
}> = ({ title, subtitle, badge, badgeTone, description, cloud }) => {
  const badgeStyles = getBadgeStyles(badgeTone);
  return (
    <details
      style={{
        border: '1px solid var(--border)',
        borderRadius: '16px',
        background: 'var(--surface-light)',
        overflow: 'hidden',
      }}
    >
      <summary
        style={{
          listStyle: 'none',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          gap: '1rem',
          alignItems: 'center',
          padding: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <ChevronDown size={17} color="var(--text-muted)" />
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>{subtitle}</p>
          </div>
        </div>
        <span
          style={{
            borderRadius: '999px',
            padding: '0.28rem 0.6rem',
            fontSize: '0.72rem',
            fontWeight: 900,
            ...badgeStyles,
          }}
        >
          {badge}
        </span>
      </summary>
      <div style={{ padding: '0 1rem 1rem 2.95rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
        <p style={{ margin: 0 }}>{description}</p>
        {cloud && (
          <div
            style={{
              marginTop: '0.85rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.75rem',
              borderRadius: '12px',
              border: '1px solid rgba(217, 119, 6, 0.25)',
              background: 'rgba(245, 158, 11, 0.08)',
              color: '#92400e',
            }}
          >
            <Cloud size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
            <span>
              Privacy: cloud engines may send text and optional reference audio to external servers.
            </span>
          </div>
        )}
      </div>
    </details>
  );
};

const FoundationCallout: React.FC<{
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  body: string;
}> = ({ icon: Icon, title, body }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.85rem',
      padding: '1rem',
      borderRadius: '14px',
      border: '1px dashed var(--border)',
      background: 'var(--surface-light)',
    }}
  >
    <div style={{ color: 'var(--accent)', marginTop: '0.1rem' }}>
      <Icon size={20} />
    </div>
    <div>
      <h3 style={{ margin: 0, fontSize: '1rem' }}>{title}</h3>
      <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.55 }}>{body}</p>
    </div>
  </div>
);

const getBadgeStyles = (tone: 'blue' | 'yellow' | 'gray'): React.CSSProperties => {
  if (tone === 'blue') {
    return { color: '#075985', background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.22)' };
  }
  if (tone === 'yellow') {
    return { color: '#92400e', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.24)' };
  }
  return { color: 'var(--text-muted)', background: 'rgba(100, 116, 139, 0.12)', border: '1px solid rgba(100, 116, 139, 0.2)' };
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
