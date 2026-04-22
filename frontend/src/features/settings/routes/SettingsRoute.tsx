import React, { useMemo, useState, useEffect } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { BadgeInfo, ChevronDown, CircleHelp, Cloud, KeyRound, PlugZap, RefreshCw, Server, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Music, Cpu, Globe, Layers, TriangleAlert } from 'lucide-react';
import type { Settings as AppSettings, TtsEngine } from '../../../types';
import { api } from '../../../api';

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
              onRefresh={onRefresh}
              onShowNotification={onShowNotification}
            />
          )}
          {activeTab.id === 'engines' && <EnginesPanel onShowNotification={onShowNotification} />}
          {activeTab.id === 'api' && <ApiSettingsPanel />}
          {activeTab.id === 'about' && <AboutSettingsPanel />}
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

const normalizeSettingsPath = (pathname: string) => {
  if (!pathname) {
    return '/settings';
  }
  const normalized = pathname.replace(/\/+$/, '');
  return normalized || '/';
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

  const updateStringSetting = async (key: 'default_engine', value: string) => {
    setSavingKey(key);
    try {
      const formData = new URLSearchParams();
      formData.append(key, value);
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
        icon={PlugZap}
        title="Default Engine"
        description="Choose the primary synthesis engine for new segments."
        action={
          <select
            value={settings?.default_engine || 'xtts'}
            onChange={(e) => updateStringSetting('default_engine', e.target.value)}
            disabled={savingKey === 'default_engine'}
            style={{
              padding: '0.45rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              fontSize: '0.85rem',
              fontWeight: 800,
              minWidth: '120px',
            }}
          >
            <option value="xtts">XTTS (Local)</option>
            <option value="voxtral">Voxtral (Cloud)</option>
          </select>
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

const EnginesPanel: React.FC<{
  onShowNotification?: (message: string) => void;
}> = ({ onShowNotification }) => {
  const [engines, setEngines] = useState<TtsEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadEngines = async () => {
    try {
      setLoading(true);
      const data = await api.fetchEngines();
      if (Array.isArray(data)) {
        setEngines(data);
        setError(null);
      } else {
        setEngines([]);
        setError('Unexpected engine payload received from the server.');
      }
    } catch (err) {
      setError('Failed to load engines. Ensure the TTS Server is running if enabled.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEngines();
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshPlugins();
      await loadEngines();
      onShowNotification?.('Plugins refreshed successfully.');
    } catch (err) {
      console.error('Refresh failed', err);
      onShowNotification?.('Plugin refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  if (loading && engines.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p>Discovering engines...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      {error && (
        <div style={{ padding: '1rem', borderRadius: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#b91c1c', fontSize: '0.85rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          {error}
        </div>
      )}
      {engines.map((engine) => (
        <EngineCard
          key={engine.engine_id}
          engine={engine}
          onUpdate={loadEngines}
          onShowNotification={onShowNotification}
        />
      ))}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
        <button
          type="button"
          className="btn-glass"
          onClick={() => onShowNotification?.('Plugin installation is coming in a later slice.')}
          style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800 }}
        >
          Install Plugin
        </button>
        <button
          type="button"
          className="btn-glass"
          disabled={refreshing}
          onClick={handleRefresh}
          style={{ padding: '0.65rem 0.9rem', borderRadius: '10px', border: '1px solid var(--border)', fontWeight: 800 }}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Plugins'}
        </button>
      </div>
    </div>
  );
};

const EngineCard: React.FC<{
  engine: TtsEngine;
  onUpdate: () => void;
  onShowNotification?: (message: string) => void;
}> = ({ engine, onUpdate, onShowNotification }) => {
  const [saving, setSaving] = useState(false);
  const engineUi = getEngineUi(engine.settings_schema);
  const tone = engine.status === 'ready'
    ? 'blue'
    : engine.status === 'needs_setup'
      ? 'yellow'
      : engine.status === 'invalid_config'
        ? 'red'
        : 'gray';
  const statusLabel = getEngineStatusLabel(engine.status);
  const verificationLabel = engine.verified ? 'VERIFIED' : (engine.status === 'not_loaded' ? 'NOT LOADED' : 'UNVERIFIED');

  const handleSaveSettings = async (settings: Record<string, any>) => {
    setSaving(true);
    try {
      await api.updateEngineSettings(engine.engine_id, settings);
      await onUpdate();
      onShowNotification?.(`${engine.display_name} settings saved.`);
    } catch (err) {
      console.error('Failed to save settings', err);
      onShowNotification?.('Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

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
          <ChevronDown size={17} color="var(--text-muted)" className="details-chevron" />
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>{engine.display_name}</h3>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 600 }}>
              {engine.engine_id} {engine.version ? `• v${engine.version}` : ''}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          {engine.cloud && <Cloud size={15} color="#92400e" />}
          <span
            style={{
              borderRadius: '999px',
              padding: '0.28rem 0.6rem',
              fontSize: '0.7rem',
              fontWeight: 900,
              letterSpacing: '0.02em',
              ...getBadgeStyles(tone),
            }}
          >
            {statusLabel}
          </span>
          {engine.status !== 'not_loaded' && (
            <span
              style={{
                borderRadius: '999px',
                padding: '0.28rem 0.6rem',
                fontSize: '0.7rem',
                fontWeight: 900,
                letterSpacing: '0.02em',
                ...getBadgeStyles(engine.verified ? 'blue' : 'gray'),
              }}
            >
              {verificationLabel}
            </span>
          )}
        </div>
      </summary>
      <div style={{ padding: '0 1rem 1.25rem 2.95rem', color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.55 }}>
        <p style={{ margin: '0 0 1.25rem 0', fontSize: '0.85rem' }}>
          {engine.author ? `Engine by ${engine.author}. ` : ''}
          {engine.homepage && (
            <a href={engine.homepage} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              View Documentation
            </a>
          )}
        </p>

        {engine.cloud && (
          <div
            style={{
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.6rem',
              padding: '0.85rem',
              borderRadius: '12px',
              border: '1px solid rgba(217, 119, 6, 0.25)',
              background: 'rgba(245, 158, 11, 0.08)',
              color: '#92400e',
              fontSize: '0.82rem',
            }}
          >
            <Cloud size={16} style={{ marginTop: '0.1rem', flexShrink: 0 }} />
            <span>Privacy: cloud engines may send text and optional reference audio to external servers.</span>
          </div>
        )}

        {engineUi && (
          <EngineMetadataPanel engine={engine} ui={engineUi} />
        )}

        <div style={{ background: 'white', padding: '1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>
          <JsonSchemaForm
            schema={engine.settings_schema}
            values={engine.current_settings || {}}
            onSave={handleSaveSettings}
            busy={saving}
            engineVerified={engine.verified}
          />
        </div>
      </div>
    </details>
  );
};

const JsonSchemaForm: React.FC<{
  schema: any;
  values: Record<string, any>;
  onSave: (values: Record<string, any>) => void;
  busy: boolean;
  engineVerified: boolean;
}> = ({ schema, values, onSave, busy, engineVerified }) => {
  const [localValues, setLocalValues] = useState<Record<string, any>>(values);

  useEffect(() => {
    setLocalValues(values);
  }, [values]);

  if (!schema || !schema.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div style={{ fontStyle: 'italic', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
        No configurable settings for this engine.
      </div>
    );
  }

  const handleChange = (key: string, value: any) => {
    setLocalValues((prev: Record<string, any>) => ({ ...prev, [key]: value }));
  };

  const hasChanges = JSON.stringify(localValues) !== JSON.stringify(values);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.25rem' }}>
        {Object.entries(schema.properties).map(([key, prop]: [string, any]) => {
          const propUi = prop?.['x-ui'] || {};
          const isLocked = !!propUi.requires_verification && !engineVerified;
          return (
          <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <label style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                {prop.title || key}
              </label>
              {(prop.type === 'number' || prop.type === 'integer') && (
                <span style={{ fontSize: '0.75rem', fontWeight: 900, color: 'var(--accent)' }}>
                  {localValues[key] ?? prop.default}
                </span>
              )}
            </div>
            {prop.type === 'boolean' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <ToggleButton
                  enabled={!!(localValues[key] ?? prop.default)}
                  busy={false}
                  disabled={isLocked}
                  onClick={() => handleChange(key, !(localValues[key] ?? prop.default))}
                />
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {isLocked ? (propUi.locked_message || 'Verification required before this setting can be enabled.') : ((localValues[key] ?? prop.default) ? 'Enabled' : 'Disabled')}
                </span>
              </div>
            ) : prop.type === 'number' || prop.type === 'integer' ? (
              <input
                type="range"
                min={prop.minimum ?? 0}
                max={prop.maximum ?? 100}
                step={prop.type === 'integer' ? 1 : 0.01}
                value={localValues[key] ?? prop.default ?? 0}
                disabled={isLocked}
                onChange={(e) =>
                  handleChange(key, prop.type === 'integer' ? parseInt(e.target.value) : parseFloat(e.target.value))
                }
                style={{ width: '100%', height: '6px', accentColor: 'var(--accent)', cursor: 'pointer' }}
              />
            ) : (
              <input
                type="text"
                value={localValues[key] ?? prop.default ?? ''}
                disabled={isLocked}
                onChange={(e) => handleChange(key, e.target.value)}
                style={{
                  padding: '0.65rem',
                  borderRadius: '10px',
                  border: '1px solid var(--border)',
                  background: 'var(--background)',
                  fontSize: '0.85rem',
                  width: '100%',
                }}
              />
            )}
            {prop.description && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                {prop.description}
              </p>
            )}
            {isLocked && (
              <p style={{ margin: 0, fontSize: '0.78rem', color: '#b45309', lineHeight: 1.4, fontWeight: 700 }}>
                {propUi.locked_message || 'Verification required before enabling this setting.'}
              </p>
            )}
          </div>
          );
        })}
      </div>
      {hasChanges && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginTop: '0.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => onSave(localValues)}
            style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 900 }}
          >
            {busy ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      )}
    </div>
  );
};

const getEngineUi = (schema: any) => {
  const ui = schema?.['x-ui'];
  return ui && typeof ui === 'object' ? ui : null;
};

const EngineMetadataPanel: React.FC<{
  engine: TtsEngine;
  ui: any;
}> = ({ engine, ui }) => {
  const panelTitle = ui?.panel_title || `${engine.display_name} Settings`;
  const summary = ui?.summary || engine.homepage || '';
  const privacyNotice = ui?.privacy_notice;
  const privacyTone = ui?.privacy_tone === 'warning' ? 'warning' : 'info';

  return (
    <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '14px', border: '1px solid rgba(43, 110, 255, 0.18)', background: 'rgba(239, 246, 255, 0.65)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
          <div style={{ width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', color: 'var(--accent)', background: 'rgba(43, 110, 255, 0.12)' }}>
            <KeyRound size={16} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 900, color: 'var(--text-primary)' }}>{panelTitle}</h4>
            {summary && (
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.84rem', lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                {summary}
              </p>
            )}
          </div>
        </div>
        {!engine.verified && (
          <span style={{ borderRadius: '999px', padding: '0.3rem 0.7rem', fontSize: '0.68rem', fontWeight: 900, letterSpacing: '0.02em', ...getBadgeStyles('yellow') }}>
            Verification required
          </span>
        )}
      </div>

      {ui?.help_url && (
        <a
          href={ui.help_url}
          target="_blank"
          rel="noreferrer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 800, fontSize: '0.83rem', marginBottom: '0.9rem' }}
        >
          <CircleHelp size={14} />
          {ui.help_label || 'Open instructions'}
        </a>
      )}

      {privacyNotice && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            border: privacyTone === 'warning' ? '1px solid rgba(217, 119, 6, 0.25)' : '1px solid rgba(43, 110, 255, 0.18)',
            background: privacyTone === 'warning' ? 'rgba(245, 158, 11, 0.08)' : 'rgba(239, 246, 255, 0.7)',
            color: privacyTone === 'warning' ? '#92400e' : 'var(--text-secondary)',
            fontSize: '0.78rem',
            lineHeight: 1.5,
            marginBottom: '0.9rem',
          }}
        >
          {privacyTone === 'warning' ? <TriangleAlert size={14} style={{ marginTop: '2px', flexShrink: 0 }} /> : <Cloud size={14} style={{ marginTop: '2px', flexShrink: 0 }} />}
          <span>{privacyNotice}</span>
        </div>
      )}
    </div>
  );
};

const ApiSettingsPanel: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <SettingCard
        icon={Server}
        title="Studio API"
        description="Use these endpoints to connect external tools to Studio or inspect runtime state."
        action={<span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)' }}>Read only</span>}
      />
      <div style={{ display: 'grid', gap: '0.9rem' }}>
        <div style={{ padding: '1rem', borderRadius: '14px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>Integration Endpoints</h3>
          <ul style={{ margin: 0, paddingLeft: '1.15rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            <li><code>/api/home</code> returns Studio version, engine health, and system diagnostics.</li>
            <li><code>/api/engines</code> lists plugin engines, statuses, and settings schemas.</li>
            <li><code>/api/settings</code> updates global Studio settings such as safe mode and export defaults.</li>
            <li><code>/api/engines/&lt;id&gt;/settings</code> persists per-engine plugin configuration.</li>
          </ul>
        </div>
        <div style={{ padding: '1rem', borderRadius: '14px', border: '1px dashed var(--border)', background: 'var(--background)', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            External apps can use these routes to read Studio health, inspect available engines, or configure the backend without going through the chapter editor.
          </p>
        </div>
        <SettingCard
          icon={Server}
          title="Local API Discovery"
          description="Network discovery remains managed by the host process."
          action={<span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)' }}>Managed outside UI</span>}
        />
      </div>
    </div>
  );
};

const AboutSettingsPanel: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [engines, setEngines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const [home, engs] = await Promise.all([api.fetchHome(), api.fetchEngines()]);
        setData(home);
        setEngines(engs);
      } catch (err) {
        console.error('Failed to load about data', err);
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p>Gathering system info...</p>
      </div>
    );
  }

  const ttsServerStatus = engines.length > 0 ? 'Online' : 'Offline / Not Connected';
  const ttsServerTone = engines.length > 0 ? 'blue' : 'gray';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
        <StatusCard
          icon={BadgeInfo}
          label="Studio Version"
          value={data?.version || '1.8.4'}
          subvalue="Release Channel: Stable"
        />
        <StatusCard
          icon={Server}
          label="TTS Server"
          value={ttsServerStatus}
          subvalue={`${engines.length} engine(s) discovered`}
          tone={ttsServerTone}
        />
      </div>

      <div style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Runtime Diagnostics
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <DiagnosticRow
            icon={Cpu}
            label="Backend Mode"
            value={data?.system_info?.backend_mode || 'Direct-In-Process'}
          />
          <DiagnosticRow
            icon={Layers}
            label="Orchestrator"
            value={data?.system_info?.orchestrator || 'Legacy'}
          />
          <DiagnosticRow
            icon={Globe}
            label="Environment"
            value={typeof window !== 'undefined' ? 'Browser / Web Client' : 'Terminal'}
          />
        </div>
      </div>

      <div style={{ padding: '1rem', borderRadius: '14px', border: '1px dashed var(--border)', background: 'var(--background)', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>
          Audiobook Studio 2.0 is a modular synthesis and production platform. 
          The "About" tab provides real-time readouts of the underlying bridge and engine status.
          For deeper logs, refer to the <code>logs/</code> directory in your Studio root.
        </p>
      </div>
    </div>
  );
};

const StatusCard: React.FC<{ icon: React.ComponentType<{ size?: number }>; label: string; value: string; subvalue: string; tone?: 'blue' | 'gray' }> = ({ icon: Icon, label, value, subvalue, tone = 'blue' }) => {
  const styles = getBadgeStyles(tone);
  return (
    <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
        <Icon size={16} />
        <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>{label}</span>
      </div>
      <div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{subvalue}</div>
      </div>
      <div style={{ height: '4px', width: '100%', background: styles.background, borderRadius: '999px', marginTop: '0.25rem' }} />
    </div>
  );
};

const DiagnosticRow: React.FC<{ icon: React.ComponentType<{ size?: number }>; label: string; value: string }> = ({ icon: Icon, label, value }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ color: 'var(--accent)' }}><Icon size={18} /></div>
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
    </div>
    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', background: 'var(--background)', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
      {value}
    </span>
  </div>
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

const ToggleButton: React.FC<{ enabled: boolean; busy: boolean; disabled?: boolean; onClick: () => void }> = ({ enabled, busy, disabled, onClick }) => (
  <button
    type="button"
    disabled={busy || disabled}
    onClick={onClick}
    className={enabled ? 'btn-primary' : 'btn-glass'}
    style={{ padding: '0.5rem 0.85rem', borderRadius: '10px', minWidth: 70, fontWeight: 900, border: enabled ? 'none' : '1px solid var(--border)' }}
  >
    {busy ? '...' : enabled ? 'ON' : 'OFF'}
  </button>
);


const getBadgeStyles = (tone: 'blue' | 'yellow' | 'gray' | 'red'): React.CSSProperties => {
  if (tone === 'blue') {
    return { color: '#075985', background: 'rgba(14, 165, 233, 0.12)', border: '1px solid rgba(14, 165, 233, 0.22)' };
  }
  if (tone === 'yellow') {
    return { color: '#92400e', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.24)' };
  }
  if (tone === 'red') {
    return { color: '#991b1b', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.24)' };
  }
  return { color: 'var(--text-muted)', background: 'rgba(100, 116, 139, 0.12)', border: '1px solid rgba(100, 116, 139, 0.2)' };
};

const getEngineStatusLabel = (status: string): string => {
  switch (status) {
    case 'ready':
      return 'READY';
    case 'needs_setup':
      return 'NEEDS SETUP';
    case 'unverified':
      return 'UNVERIFIED';
    case 'invalid_config':
      return 'INVALID CONFIG';
    case 'not_loaded':
      return 'NOT LOADED';
    default:
      return status.replace(/_/g, ' ').toUpperCase();
  }
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
