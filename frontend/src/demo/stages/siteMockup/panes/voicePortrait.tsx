import React from 'react';
import type { Voice, VoicePill } from './voices';

const getVoicePill = (voice: Voice, category: VoicePill['category']) =>
  voice.pills.find((pill) => pill.category === category)?.label;

const getVoiceTone = (voice: Voice) => voice.styles?.[0] || getVoicePill(voice, 'extended') || 'Clear';
const getVoiceGender = (voice: Voice) => voice.gender || getVoicePill(voice, 'gender') || 'NB';
const getVoiceAge = (voice: Voice) => voice.age || getVoicePill(voice, 'age') || 'Adult';
const getVoiceClass = (voice: Voice) => voice.category || getVoicePill(voice, 'class') || 'Narrator';

const PORTRAIT_TONES: Record<string, { bg: string; ink: string; accent: string }> = {
  Warm: { bg: 'linear-gradient(145deg, #fff0dc 0%, #f7b66d 100%)', ink: '#7a4524', accent: '#e27944' },
  Deep: { bg: 'linear-gradient(145deg, #dfe6f2 0%, #6a7287 100%)', ink: '#263247', accent: '#465272' },
  Bright: { bg: 'linear-gradient(145deg, #fff8c7 0%, #78c7ff 100%)', ink: '#25506a', accent: '#f0b93c' },
  Light: { bg: 'linear-gradient(145deg, #fffbe8 0%, #b6e9ff 100%)', ink: '#33586b', accent: '#8bcde8' },
  Gruff: { bg: 'linear-gradient(145deg, #e5ded4 0%, #7b6a5b 100%)', ink: '#3f342b', accent: '#9b563d' },
  Clear: { bg: 'linear-gradient(145deg, #e8fbff 0%, #80d7e8 100%)', ink: '#1f5967', accent: '#35a9c8' },
  Cool: { bg: 'linear-gradient(145deg, #edf0ff 0%, #8f9df0 100%)', ink: '#303c78', accent: '#6879df' },
};

const PORTRAIT_BORDER_BY_CLASS: Record<string, string> = {
  Narrator: 'rgba(55, 112, 255, 0.72)',
  Dialogue: 'rgba(40, 170, 120, 0.72)',
  Character: 'rgba(156, 104, 62, 0.78)',
};

const getVoicePortraitSrc = (voice: Voice) => {
  if (voice.portraitImage) return voice.portraitImage;

  const gender = getVoiceGender(voice);
  const age = getVoiceAge(voice);
  const tone = getVoiceTone(voice);

  if (tone === 'Gruff' && age !== 'Senior') return '/demo-voice-silhouettes/gruff-ogre.svg';
  if (tone === 'Bright' || tone === 'Light') return '/demo-voice-silhouettes/light-fairy.svg';
  if (age === 'Child') return '/demo-voice-silhouettes/child.svg';
  if (age === 'Senior') return '/demo-voice-silhouettes/senior.svg';
  if (gender === 'Female') return '/demo-voice-silhouettes/female-narrator.svg';
  if (gender === 'Male') return '/demo-voice-silhouettes/male-narrator.svg';
  return '/demo-voice-silhouettes/neutral-nb.svg';
};

const FallbackVoiceAvatar: React.FC<{
  name: string;
  size: number;
  emphasized?: boolean;
  style?: React.CSSProperties;
}> = ({ name, size, emphasized, style }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '50%',
      background: 'var(--surface-alt)',
      border: '1.5px dashed var(--border-strong)',
      color: 'var(--text-secondary)',
      display: 'grid',
      placeItems: 'center',
      fontWeight: 800,
      fontSize: size > 50 ? 'var(--type-caption)' : 'var(--type-micro)',
      boxShadow: emphasized ? 'var(--shadow-md)' : 'var(--shadow-sm)',
      flexShrink: 0,
      ...style,
    }}
    aria-label={`${name} initials fallback portrait`}
  >
    {name.slice(0, 2).toUpperCase()}
  </div>
);

export const VoicePortrait: React.FC<{
  voice: Voice;
  size?: number;
  emphasized?: boolean;
  style?: React.CSSProperties;
}> = ({ voice, size = 52, emphasized = false, style }) => {
  if (voice.portrait === false) {
    return (
      <FallbackVoiceAvatar
        name={voice.name}
        size={size}
        emphasized={emphasized}
        style={style}
      />
    );
  }

  const gender = getVoiceGender(voice);
  const age = getVoiceAge(voice);
  const tone = getVoiceTone(voice);
  const voiceClass = getVoiceClass(voice);
  const palette = PORTRAIT_TONES[tone] ?? PORTRAIT_TONES.Clear;
  const border = PORTRAIT_BORDER_BY_CLASS[voiceClass] ?? 'var(--accent-tint-border)';
  const portraitSrc = getVoicePortraitSrc(voice);

  return (
    <div
      className="ns-voice-portrait"
      style={{
        width: size,
        height: size,
        '--voice-portrait-bg': palette.bg,
        '--voice-portrait-ink': palette.ink,
        '--voice-portrait-accent': palette.accent,
        '--voice-portrait-border': border,
        boxShadow: emphasized ? 'var(--accent-glow-strong)' : undefined,
        ...style,
      } as React.CSSProperties}
      role="img"
      aria-label={`${voice.name} generic ${age.toLowerCase()} ${gender.toLowerCase()} ${tone.toLowerCase()} ${voiceClass.toLowerCase()} portrait`}
    >
      <img src={portraitSrc} alt="" width={size - 6} height={size - 6} loading="lazy" />
    </div>
  );
};
