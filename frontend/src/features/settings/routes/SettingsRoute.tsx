import React, { useMemo, useState, useEffect } from 'react';
import { NavLink, Navigate, useLocation } from 'react-router-dom';
import { BadgeInfo, ChevronDown, CircleHelp, Cloud, KeyRound, PlugZap, RefreshCw, Server, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal, Music, Cpu, Globe, Layers, TriangleAlert, Play, Trash2, Download, FileText, Volume2, ShieldAlert, BookOpen } from 'lucide-react';
import type { Settings as AppSettings, TtsEngine, SpeakerProfile, RenderStats, RuntimeService } from '../../../types';
import { api } from '../../../api';
import { ConfirmModal } from '../../../components/ConfirmModal';
import { isVoiceProfileSelectable } from '../../../utils/voiceProfiles';

type SettingsTabId = 'general' | 'engines' | 'api' | 'about';

interface SettingsRouteProps {
  settings: AppSettings | undefined;
  speakerProfiles?: SpeakerProfile[];
  engines?: TtsEngine[];
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

export const SettingsRoute: React.FC<SettingsRouteProps> = ({ settings, speakerProfiles, engines = [], onRefresh, onShowNotification }) => {
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
              engines={engines}
              onRefresh={onRefresh}
              onShowNotification={onShowNotification}
            />
          )}
          {activeTab.id === 'engines' && <EnginesPanel onShowNotification={onShowNotification} onRefresh={onRefresh} />}
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

const GeneralSettingsPanel: React.FC<SettingsRouteProps> = ({ settings, speakerProfiles, engines = [], onRefresh, onShowNotification }) => {
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const updateBooleanSetting = async (key: 'safe_mode', currentValue: boolean) => {
    setSavingKey(key);
    try {
      const formData = new URLSearchParams();
      formData.append(key, (!currentValue).toString());
      await fetch('/api/settings', { method: 'POST', body: formData });
      onRefresh();
    } catch (error) {
      console.error('Failed to update setting', error);
      onShowNotification?.('Settings update failed. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  const updateStringSetting = async (key: 'default_engine' | 'default_speaker_profile', value: string) => {
    setSavingKey(key);
    try {
      if (key === 'default_speaker_profile') {
        const formData = new URLSearchParams();
        formData.append('name', value);
        await fetch('/api/settings/default-speaker', { method: 'POST', body: formData });
      } else {
        const formData = new URLSearchParams();
        formData.append(key, value);
        await fetch('/api/settings', { method: 'POST', body: formData });
      }
      onRefresh();
    } catch (error) {
      console.error('Failed to update setting', error);
      onShowNotification?.('Settings update failed. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <section>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem' }}>
          Core Synthesis Defaults
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <SettingCard
            icon={ShieldCheck}
            title="Stability Mode"
            description="Enable advanced text cleaning to improve engine stability and avoid speech artifacts."
            action={
              <ToggleButton
                enabled={!!settings?.safe_mode}
                busy={savingKey === 'safe_mode'}
                onClick={() => updateBooleanSetting('safe_mode', !!settings?.safe_mode)}
              />
            }
          />
          <SettingCard
            icon={PlugZap}
            title="Default Engine"
            description="Primary synthesis engine for new projects and segments."
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
                  minWidth: '140px',
                }}
              >
                <option value="xtts">XTTS (Local)</option>
                <option value="voxtral">Voxtral (Cloud)</option>
              </select>
            }
          />
          <SettingCard
            icon={Music}
            title="Default Voice"
            description="Global fallback voice profile when no character is assigned."
            action={
              <select
                value={settings?.default_speaker_profile || ''}
                onChange={(e) => updateStringSetting('default_speaker_profile', e.target.value)}
                disabled={savingKey === 'default_speaker_profile'}
                style={{
                  padding: '0.45rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  minWidth: '140px',
                }}
              >
                <option value="">(None)</option>
                {speakerProfiles?.filter(profile => isVoiceProfileSelectable(profile, engines)).map(p => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            }
          />
        </div>
      </section>

    </div>
  );
};

const EnginesPanel: React.FC<{
  onShowNotification?: (message: string) => void;
  onRefresh?: () => void | Promise<void>;
}> = ({ onShowNotification, onRefresh }) => {
  const [engines, setEngines] = useState<TtsEngine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [installModal, setInstallModal] = useState<{ open: boolean; message: string }>({ open: false, message: '' });

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

  const refreshAppState = async () => {
    await Promise.all([
      loadEngines(),
      Promise.resolve(onRefresh?.()),
    ]);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshPlugins();
      await refreshAppState();
      onShowNotification?.('Plugins refreshed successfully.');
    } catch (err) {
      console.error('Refresh failed', err);
      onShowNotification?.('Plugin refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const handleInstallPlugin = async () => {
    try {
      const res = await api.installPlugin();
      setInstallModal({ open: true, message: res.message || 'Place your plugin folder in the "plugins/" directory and click Refresh.' });
    } catch (err) {
      onShowNotification?.('Failed to retrieve installation instructions.');
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
          onUpdate={refreshAppState}
          onShowNotification={onShowNotification}
        />
      ))}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', paddingTop: '0.25rem' }}>
        <button
          type="button"
          className="btn-glass"
          onClick={handleInstallPlugin}
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

      <ConfirmModal
        isOpen={installModal.open}
        title="Install TTS Plugin"
        message={installModal.message}
        onConfirm={() => setInstallModal({ open: false, message: '' })}
        onCancel={() => setInstallModal({ open: false, message: '' })}
        confirmText="Understood"
        isAlert={true}
        isDestructive={false}
      />
    </div>
  );
};

const EngineCard: React.FC<{
  engine: TtsEngine;
  onUpdate: () => void;
  onShowNotification?: (message: string) => void;
}> = ({ engine, onUpdate, onShowNotification }) => {
  const [saving, setSaving] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
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
  const canEnable = engine.can_enable ?? (engine.status === 'ready' || engine.enabled);
  const enablementMessage = engine.enablement_message || (!engine.enabled && !canEnable ? 'Resolve engine setup before enabling this plugin.' : '');

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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ marginRight: '0.5rem' }}>
            <ToggleButton
              enabled={engine.enabled}
              busy={saving}
              disabled={saving || (!engine.enabled && !canEnable)}
              title={engine.enabled ? 'Disable plugin' : enablementMessage || (engine.verified ? 'Enable plugin' : 'Verify this engine before enabling it.')}
              onClick={async (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                if (!engine.enabled && !canEnable) return;
                setSaving(true);
                try {
                  await api.updateEngineSettings(engine.engine_id, { enabled: !engine.enabled });
                  await onUpdate();
                  onShowNotification?.(`${engine.display_name} ${!engine.enabled ? 'enabled' : 'disabled'}.`);
                } catch (err) {
                  onShowNotification?.(`Failed to ${!engine.enabled ? 'enable' : 'disable'} ${engine.display_name}.`);
                } finally {
                  setSaving(false);
                }
              }}
            />
          </div>
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

        {(engineUi || engine.settings_schema?.description) && (
          <EngineMetadataPanel engine={engine} schema={engine.settings_schema} />
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

        <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-glass"
            title="Run a test synthesis to verify engine output"
            onClick={() => onShowNotification?.(`Test synthesis for ${engine.display_name} is available in the Voices tab. Global verification tests from this card are coming soon.`)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}
          >
            <Play size={14} /> Test
          </button>
          
          <button
            type="button"
            className="btn-glass"
            title="Force a re-verification of the engine"
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              try {
                const res = await api.verifyEngine(engine.engine_id);
                if (res.ok) {
                  onShowNotification?.(`${engine.display_name} verified successfully.`);
                  await onUpdate();
                } else {
                  onShowNotification?.(`Verification failed: ${res.error || res.message || 'Unknown error'}`);
                }
              } catch (err) {
                onShowNotification?.(`Verification failed for ${engine.display_name}.`);
              } finally {
                setSaving(false);
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}
          >
            <ShieldCheck size={14} /> Verify
          </button>

          <button
            type="button"
            className="btn-glass"
            title="View recent logs for this engine"
            onClick={async () => {
              try {
                const res = await api.fetchEngineLogs(engine.engine_id);
                onShowNotification?.(res.logs || 'No logs available.');
              } catch (err) {
                onShowNotification?.('Failed to fetch logs.');
              }
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800 }}
          >
            <FileText size={14} /> Logs
          </button>

          {engine.status === 'needs_setup' && (
            <button
              type="button"
              className="btn-glass"
              title="Install missing dependencies"
              onClick={async () => {
                try {
                  const res = await api.installEngineDependencies(engine.engine_id);
                  onShowNotification?.(res.message || 'Dependency installation triggered.');
                } catch (err) {
                  onShowNotification?.('Failed to trigger installation.');
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, color: '#92400e', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.2)' }}
            >
              <Download size={14} /> Install Deps
            </button>
          )}

          {!engine.verified && engine.status !== 'ready' && (
            <button
              type="button"
              className="btn-glass"
              title="Remove this plugin"
              onClick={() => setRemoveConfirmOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.8rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 800, color: '#b91c1c' }}
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
        </div>
        <ConfirmModal
          isOpen={removeConfirmOpen}
          onCancel={() => setRemoveConfirmOpen(false)}
          onConfirm={async () => {
            setRemoveConfirmOpen(false);
            try {
              const res = await api.removeEnginePlugin(engine.engine_id);
              if (res.ok) {
                onShowNotification?.('Plugin removed successfully.');
                await onUpdate();
              } else {
                onShowNotification?.(res.message || 'Removal failed.');
              }
            } catch (err) {
              onShowNotification?.('Failed to remove plugin.');
            }
          }}
          title="Remove Plugin"
          message={`Are you sure you want to remove the ${engine.display_name} plugin? This will delete its folder.`}
          confirmText="Remove Plugin"
          isDestructive={true}
        />
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
        {Object.entries(schema.properties)
          .filter(([key]) => key !== 'enabled')
          .map(([key, prop]: [string, any]) => {
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
  schema: any;
}> = ({ engine, schema }) => {
  const ui = getEngineUi(schema);
  const panelTitle = ui?.panel_title || `${engine.display_name} Settings`;
  const summary = ui?.summary || schema?.description || engine.homepage || '';
  const privacyNotice = ui?.privacy_notice;
  const privacyTone = ui?.privacy_tone === 'warning' ? 'warning' : 'info';
  const showPanel = Boolean(summary || ui?.help_url || privacyNotice || !engine.verified);

  if (!showPanel) {
    return null;
  }

  return (
    <div style={{ marginBottom: '1rem', padding: '1rem', borderRadius: '16px', border: '1px solid rgba(43, 110, 255, 0.2)', background: 'linear-gradient(180deg, rgba(240, 247, 255, 0.9), rgba(245, 250, 255, 0.72))' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.9rem' }}>
        <div style={{ display: 'flex', gap: '0.7rem', alignItems: 'flex-start' }}>
          <div style={{ width: 30, height: 30, borderRadius: '10px', display: 'grid', placeItems: 'center', color: 'var(--accent)', background: 'rgba(43, 110, 255, 0.12)', flexShrink: 0 }}>
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
          style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', color: 'var(--accent)', textDecoration: 'none', fontWeight: 900, fontSize: '0.83rem', marginBottom: '0.9rem', padding: '0.55rem 0.75rem', borderRadius: '999px', border: '1px solid rgba(43, 110, 255, 0.15)', background: 'rgba(255,255,255,0.8)', boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}
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
            border: privacyTone === 'warning' ? '1px solid rgba(217, 119, 6, 0.28)' : '1px solid rgba(43, 110, 255, 0.18)',
            background: privacyTone === 'warning' ? 'rgba(245, 158, 11, 0.09)' : 'rgba(239, 246, 255, 0.72)',
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

const apiExampleStyle: React.CSSProperties = {
  margin: '0.9rem 0 0 0',
  padding: '0.9rem 1rem',
  borderRadius: '12px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--text-secondary)',
  fontSize: '0.8rem',
  lineHeight: 1.6,
  whiteSpace: 'pre-wrap',
  overflowX: 'auto',
};

const ApiSettingsPanel: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'linear-gradient(135deg, var(--surface-light) 0%, var(--surface) 100%)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
          <div style={{ padding: '0.6rem', borderRadius: '12px', background: 'var(--accent-tint)', color: 'var(--accent)' }}>
            <Server size={24} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 900 }}>Developer Integration Guide</h2>
            <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
              Connect your applications to Studio 2.0 via the unified orchestration and synthesis API.
            </p>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginTop: '1.5rem' }}>
          <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent)' }}>Unified Orchestration</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Use the <code>/api</code> endpoints to manage projects, chapters, and long-running generation jobs. 
              Studio handles chunking, engine routing, and file management automatically.
            </p>
          </div>
          <div style={{ padding: '1.25rem', borderRadius: '14px', background: 'rgba(255,255,255,0.5)', border: '1px solid var(--border)' }}>
            <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent)' }}>Direct Synthesis</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              Call the <code>TTS Server</code> directly for raw text-to-audio requests. 
              Ideal for real-time applications or simple synthesis tasks that don't require the Studio state machine.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.25rem', borderRadius: '14px', background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#92400e' }}>
        <ShieldAlert size={20} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div>
          <h4 style={{ margin: '0 0 0.35rem 0', fontSize: '0.9rem', fontWeight: 900 }}>Security Note</h4>
          <p style={{ margin: 0, fontSize: '0.82rem', lineHeight: 1.6 }}>
            Studio 2.0 does not currently implement internal API secret keys. 
            <strong> Never expose these endpoints directly to the public internet.</strong> 
            If access outside localhost is required, place Studio behind a secure proxy layer (like Nginx or Cloudflare Tunnel) with its own authentication.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '1.25rem' }}>
        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            1. Resource Discovery
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.4rem' }}>GET /api/engines</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Lists all registered TTS engines, their enablement status, and verification health.
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, marginBottom: '0.4rem' }}>GET /api/speaker-profiles</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Returns available voice profiles, engine assignments, and reference audio sample links.
                </div>
              </div>
            </div>
            <pre style={apiExampleStyle}>{`// Response Example
{
  "engines": [
    { "engine_id": "voxtral", "enabled": true, "status": "ready" },
    { "engine_id": "xtts", "enabled": true, "status": "ready" }
  ]
}`}</pre>
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            2. Orchestration & Generation
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The preferred way to generate audio is via the Studio processing queue. 
              This ensures proper resource management and provides detailed progress tracking.
            </p>
            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>POST /api/processing_queue</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Submit chapter to queue</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', borderRadius: '10px', background: 'var(--background)', border: '1px solid var(--border)' }}>
                <code style={{ fontWeight: 800 }}>GET /api/jobs</code>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Poll job status & progress</span>
              </div>
            </div>
            <pre style={apiExampleStyle}>{`curl -X POST http://localhost:8000/api/processing_queue \\
  -d "project_id=p-123&chapter_id=c-456&speaker_profile=Dark Fantasy"

// Polling response
{
  "job_id": "job_abc123",
  "status": "running",
  "progress": 0.45,
  "eta_seconds": 12
}`}</pre>
          </div>
        </section>

        <section>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '0.75rem', paddingLeft: '0.5rem' }}>
            3. Direct TTS Server Access
          </h3>
          <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              When the TTS Server is enabled, you can bypass the Studio state machine for stateless synthesis.
            </p>
            <pre style={apiExampleStyle}>{`POST http://localhost:8001/synthesize
Content-Type: application/json

{
  "engine_id": "voxtral",
  "text": "Hello from the API documentation.",
  "voice_ref": "Dark Fantasy",
  "output_path": "/path/to/output.wav"
}`}</pre>
          </div>
        </section>
      </div>

      <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookOpen size={20} style={{ color: 'var(--accent)' }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 800 }}>Full OpenAPI Schema</span>
        </div>
        <a 
          href="/docs" 
          target="_blank" 
          rel="noreferrer"
          style={{ padding: '0.5rem 1rem', borderRadius: '10px', background: 'var(--accent)', color: 'white', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 800 }}
        >
          View Swagger Docs
        </a>
      </div>
    </div>
  );
};

const AboutSettingsPanel: React.FC<{ onRefresh?: () => void | Promise<void> }> = ({ onRefresh }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const home = await api.fetchHome();
        setData(home);
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

  const renderStats: RenderStats = data?.render_stats || {};
  const runtimeServices: RuntimeService[] = data?.runtime_services || [];
  const engineList: TtsEngine[] = data?.engines || [];
  const audioDurationSeconds = typeof renderStats.audio_duration_seconds === 'number' ? renderStats.audio_duration_seconds : 0;
  const renderWordCount = typeof renderStats.word_count === 'number' ? renderStats.word_count : 0;
  const renderChars = typeof renderStats.chars === 'number' ? renderStats.chars : 0;
  const engineLabels = engineList.map((engine) => engine.display_name).filter(Boolean);
  const enginePluginValue = engineList.length > 0 ? `${engineList.length} loaded` : 'No plugins loaded';
  const enginePluginSummary = engineLabels.length > 0 ? engineLabels.join(' · ') : 'Refresh plugins to discover available engines.';
  const formatDurationSmart = (seconds: number) => {
    const totalMinutes = Math.max(0, Math.round(seconds / 60));
    if (totalMinutes <= 0) return '0m';
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  const formatSinceDate = (timestamp?: number | null) => {
    if (!timestamp) return 'first render';
    return `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp * 1000))}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <StatusCard
          icon={BadgeInfo}
          label="Studio Version"
          value={data?.version || '1.8.4'}
          subvalue="Release Channel: Stable"
        />
        <StatusCard
          icon={Server}
          label="Engine Plugins"
          value={enginePluginValue}
          subvalue={enginePluginSummary}
          tone={engineList.length > 0 ? 'blue' : 'gray'}
        />
        <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
              <Volume2 size={16} />
              <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>Production Tally</span>
            </div>
            <button
              type="button"
              className="btn-glass"
              onClick={async () => {
                try {
                  await api.resetRenderStats();
                  const home = await api.fetchHome();
                  setData(home);
                  await Promise.resolve(onRefresh?.());
                } catch (err) {
                  console.error('Failed to reset render stats', err);
                }
              }}
              style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, fontSize: '0.72rem' }}
            >
              Reset
            </button>
          </div>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
               <span style={{ fontSize: '2.25rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{formatDurationSmart(audioDurationSeconds)}</span>
               <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Produced</span>
            </div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontWeight: 600 }}>
                {renderWordCount.toLocaleString()} words / {renderChars.toLocaleString()} characters rendered
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <RefreshCw size={12} />
                <span>Tally since {formatSinceDate(renderStats.since_timestamp)}</span>
            </div>
          </div>
          <div style={{ position: 'absolute', right: '-10%', bottom: '-20%', opacity: 0.04, color: 'var(--accent)', transform: 'rotate(-15deg)' }}>
             <Volume2 size={120} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0 0.5rem' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
          Resetting tally starts a new count from now without deleting historical render rows.
        </div>
      </div>

      <div style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Runtime Diagnostics
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <DiagnosticRow
            icon={Globe}
            label="Frontend Client"
            value={typeof window !== 'undefined' ? window.location.origin : 'Browser session'}
            subvalue={typeof window !== 'undefined' && navigator.onLine ? 'online' : 'offline'}
          />
          <DiagnosticRow
            icon={Cpu}
            label="Backend API"
            value={data?.system_info?.api_base_url || data?.system_info?.backend_mode || 'Direct-In-Process'}
            subvalue={data?.system_info?.backend_mode || 'Backend'}
          />
          <DiagnosticRow
            icon={Layers}
            label="Orchestrator"
            value={data?.system_info?.orchestrator || 'Legacy'}
          />
          {runtimeServices.map((service) => (
            <RuntimeServiceRow
              key={service.id}
              service={service}
              onRestart={async () => {
                const home = await api.fetchHome();
                setData(home);
                await Promise.resolve(onRefresh?.());
              }}
            />
          ))}
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

const DiagnosticRow: React.FC<{ icon: React.ComponentType<{ size?: number }>; label: string; value: string; subvalue?: string }> = ({ icon: Icon, label, value, subvalue }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.8rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ color: 'var(--accent)' }}><Icon size={18} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
        {subvalue && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{subvalue}</span>}
      </div>
    </div>
    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', background: 'var(--background)', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
      {value}
    </span>
  </div>
);

const RuntimeServiceRow: React.FC<{ service: RuntimeService; onRestart?: () => void | Promise<void> }> = ({ service, onRestart }) => {
  const statusLabel = service.status || (service.healthy ? 'healthy' : 'unhealthy');
  const canRestart = !!service.can_restart;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.8rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>{service.label}</div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {service.url ? `${service.url}${service.port ? ` · port ${service.port}` : ''}` : 'not launched'}
          {service.message ? ` · ${service.message}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: service.healthy ? '#15803d' : '#b45309' }}>
          {statusLabel}
        </span>
        {canRestart && (
          <button
            type="button"
            className="btn-glass"
            onClick={async () => {
              try {
                await api.restartTtsServer();
                await Promise.resolve(onRestart?.());
              } catch (err) {
                console.error('Failed to restart TTS Server', err);
              }
            }}
            style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, fontSize: '0.8rem' }}
          >
            Restart
          </button>
        )}
      </div>
    </div>
  );
};

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

const ToggleButton: React.FC<{ enabled: boolean; busy: boolean; disabled?: boolean; title?: string; onClick: (e: React.MouseEvent) => void }> = ({ enabled, busy, disabled, title, onClick }) => (
  <button
    type="button"
    disabled={busy || disabled}
    onClick={onClick}
    title={title}
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
