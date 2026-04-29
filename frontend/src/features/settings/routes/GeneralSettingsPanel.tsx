import React, { useState } from 'react';
import { ShieldCheck, PlugZap, Music } from 'lucide-react';
import type { Settings as AppSettings, SpeakerProfile, TtsEngine } from '../../../types';
import { isVoiceProfileSelectable, formatVoiceEngineLabel, getVoiceProfileEngine } from '../../../utils/voiceProfiles';
import { SettingCard, ToggleButton } from './SettingsComponents';

interface GeneralSettingsPanelProps {
  settings: AppSettings | undefined;
  speakerProfiles?: SpeakerProfile[];
  engines?: TtsEngine[];
  onRefresh: () => void;
  onShowNotification?: (message: string) => void;
}

export const GeneralSettingsPanel: React.FC<GeneralSettingsPanelProps> = ({ 
  settings, 
  speakerProfiles, 
  engines = [], 
  onRefresh, 
  onShowNotification 
}) => {
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
                {speakerProfiles?.map(p => {
                  const selectable = isVoiceProfileSelectable(p, engines);
                  const engineLabel = formatVoiceEngineLabel(getVoiceProfileEngine(p));
                  return (
                    <option 
                      key={p.name} 
                      value={p.name} 
                      disabled={!selectable}
                      title={!selectable ? `This voice is unavailable because the ${engineLabel} engine is not ready.` : undefined}
                    >
                      {p.name}{!selectable ? ' 🚫' : ''}
                    </option>
                  );
                })}
              </select>
            }
          />
        </div>
      </section>
    </div>
  );
};
