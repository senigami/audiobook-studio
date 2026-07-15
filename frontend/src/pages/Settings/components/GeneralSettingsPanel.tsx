import React, { useState, useMemo } from 'react';
import { ShieldCheck, PlugZap, Music, Palette, FlaskConical, Layers, KeyRound } from 'lucide-react';
import type { Settings as AppSettings, SpeakerProfile, TtsEngine, Speaker } from '@/types';
import { buildVoiceOptions } from '@/utils/voiceProfiles';
import { SettingCard, ToggleButton, NumberStepper } from '@/pages/Settings/components/SettingsComponents';
import { loadThemePref, saveThemePref, type Theme } from '@/utils/theme';
import { isDevModeEnabled, setDevModeEnabled, useDevMode } from '@/utils/devMode';

// Matches the MAX_GLOBAL_CONCURRENT_SYNTHESIS backstop (app/orchestration/scheduler/resources.py:44-46).
const MAX_GLOBAL_PARALLEL_CAP = 8;

interface GeneralSettingsPanelProps {
  settings: AppSettings | undefined;
  speakerProfiles?: SpeakerProfile[];
  speakers?: Speaker[];
  engines?: TtsEngine[];
  onRefresh: () => void;
  onShowNotification?: (message: string) => void;
}

export const GeneralSettingsPanel: React.FC<GeneralSettingsPanelProps> = ({ 
  settings, 
  speakerProfiles, 
  speakers = [],
  engines = [], 
  onRefresh, 
  onShowNotification 
}) => {
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(loadThemePref);
  const devMode = useDevMode();
  const [hfTokenInput, setHfTokenInput] = useState('');
  const hfTokenConfigured = settings?.huggingface_token === '***';

  const handleThemeChange = (val: Theme) => {
    setTheme(val);
    saveThemePref(val);
  };

  const options = useMemo(() =>
    buildVoiceOptions(speakerProfiles || [], speakers, engines),
    [speakerProfiles, speakers, engines]
  );

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

  // tts_parallel_cap is only read from the JSON body on the backend
  // (app/api/routers/system.py's form branch doesn't parse it), so this
  // posts JSON rather than reusing the form-encoded helpers above.
  const updateParallelCap = async (cap: number) => {
    setSavingKey('tts_parallel_cap');
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tts_parallel_cap: cap }),
      });
      onRefresh();
    } catch (error) {
      console.error('Failed to update setting', error);
      onShowNotification?.('Settings update failed. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  const saveHfToken = async (value: string) => {
    setSavingKey('huggingface_token');
    try {
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ huggingface_token: value }),
      });
      setHfTokenInput('');
      onRefresh();
      onShowNotification?.(value ? 'Hugging Face token saved.' : 'Hugging Face token cleared.');
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
      {/* Platform hint banner */}
      <div
        aria-label="Platform hint"
        style={{
          padding: '0.6rem 1rem',
          borderRadius: '10px',
          background: 'var(--accent-tint-bg)',
          border: '1px solid var(--accent-tint-border, var(--border))',
          color: 'var(--text-muted)',
          fontSize: '0.82rem',
          lineHeight: 1.5,
        }}
      >
        Engines and integrations are managed under <strong style={{ color: 'var(--accent)' }}>Platform</strong>.
      </div>

      {/* Appearance section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Appearance
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <SettingCard
            icon={Palette}
            title="Theme"
            description="Choose between light, dark, or follow your system setting."
            action={
              <select
                value={theme}
                onChange={(e) => handleThemeChange(e.target.value as Theme)}
                aria-label="Theme"
                style={{
                  padding: '0.45rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  minWidth: '140px',
                }}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            }
          />
        </div>
      </section>

      {/* Developer section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Developer
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <SettingCard
            icon={FlaskConical}
            title="Developer Mode"
            description="Show developer tools: testing pages and debug copy buttons."
            action={
              <ToggleButton
                enabled={devMode}
                busy={false}
                onClick={() => setDevModeEnabled(!isDevModeEnabled())}
              />
            }
          />
        </div>
      </section>

      <section>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
          Core Synthesis Defaults
        </h3>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', fontWeight: 700 }}>
          Changes auto-save
        </div>
      </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <SettingCard
            icon={ShieldCheck}
            title="Stability Mode"
            description="Enable Studio's conservative cleanup pass before synthesis. It can help with odd punctuation, broken markup, and other text that tends to make voices stumble."
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
                value={settings?.default_engine || ''}
                onChange={(e) => updateStringSetting('default_engine', e.target.value)}
                disabled={savingKey === 'default_engine'}
                style={{
                  padding: '0.45rem',
                  borderRadius: '8px',
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  minWidth: '140px',
                }}
              >
                {engines.map(eng => {
                  // Some plugin manifests (e.g. XTTS) already bake a "(Local)"/
                  // "(Cloud)" suffix into display_name; don't double it up for
                  // those while still labeling engines whose manifest doesn't.
                  const suffix = eng.cloud ? '(Cloud)' : eng.local ? '(Local)' : '';
                  const hasSuffix = suffix && eng.display_name?.trim().endsWith(suffix);
                  const label = suffix && !hasSuffix ? `${eng.display_name} ${suffix}` : eng.display_name;
                  return (
                    <option key={eng.engine_id} value={eng.engine_id}>
                      {label}
                    </option>
                  );
                })}
                {engines.length === 0 && (
                  <option value="">(No engines loaded)</option>
                )}
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
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                  fontWeight: 800,
                  minWidth: '140px',
                }}
              >
                <option value="">(None)</option>
                {options.map(opt => (
                  <option
                    key={opt.id}
                    value={opt.value}
                    disabled={opt.disabled}
                    title={opt.disabled_reason}
                  >
                    {opt.name}
                  </option>
                ))}
              </select>
            }
          />
          <SettingCard
            icon={Layers}
            title="Parallel Segment Rendering"
            description="How many segments Studio may render at once, across all engines. Set to 1 to force strictly one-at-a-time (sequential) rendering."
            action={
              <NumberStepper
                ariaLabel="Max concurrent segment renders"
                value={settings?.tts_parallel_cap ?? 1}
                min={1}
                max={MAX_GLOBAL_PARALLEL_CAP}
                disabled={savingKey === 'tts_parallel_cap'}
                onStep={(next) => updateParallelCap(next)}
                onInputChange={(raw) => {
                  const parsed = parseInt(raw, 10);
                  if (Number.isNaN(parsed)) return;
                  const clamped = Math.min(MAX_GLOBAL_PARALLEL_CAP, Math.max(1, parsed));
                  updateParallelCap(clamped);
                }}
              />
            }
          />
        </div>
      </section>

      {/* Publishing section */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            Publishing
          </h3>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          <SettingCard
            icon={KeyRound}
            title="Hugging Face Access Token"
            description={
              hfTokenConfigured
                ? 'Configured. Used to publish voices to Hugging Face from Voice Lab. Enter a new token to replace it, or save an empty field to clear it.'
                : 'Required to publish voices to Hugging Face from Voice Lab. Create a token with write access at huggingface.co/settings/tokens.'
            }
            action={
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {hfTokenConfigured && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      color: 'var(--success)',
                      background: 'var(--success-tint-bg, var(--accent-glow))',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Configured
                  </span>
                )}
                <input
                  type="password"
                  aria-label="Hugging Face access token"
                  placeholder={hfTokenConfigured ? 'Replace token…' : 'hf_...'}
                  value={hfTokenInput}
                  disabled={savingKey === 'huggingface_token'}
                  onChange={(e) => setHfTokenInput(e.target.value)}
                  style={{
                    width: '200px',
                    padding: '0.45rem',
                    borderRadius: '8px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    fontSize: '0.85rem',
                  }}
                />
                <button
                  type="button"
                  className="btn-glass"
                  disabled={savingKey === 'huggingface_token' || (!hfTokenInput && !hfTokenConfigured)}
                  onClick={() => saveHfToken(hfTokenInput)}
                  style={{ padding: '0.45rem 0.9rem', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700 }}
                >
                  {savingKey === 'huggingface_token' ? 'Saving…' : hfTokenInput ? 'Save' : 'Clear'}
                </button>
              </div>
            }
          />
        </div>
      </section>
    </div>
  );
};
