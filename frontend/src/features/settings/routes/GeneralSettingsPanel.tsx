import React, { useState, useMemo } from 'react';
import { ShieldCheck, PlugZap, Music } from 'lucide-react';
import type { Settings as AppSettings, SpeakerProfile, TtsEngine, Speaker } from '../../../types';
import { buildVoiceOptions } from '../../../utils/voiceProfiles';
import { SettingCard, ToggleButton } from './SettingsComponents';

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
        </div>
      </section>
    </div>
  );
};
