import React from 'react';
import { Play, Pause } from 'lucide-react';
import { usePlayerBus, loadAndPlay, play, pause } from '@/store/playerBus';
import type { TtsEngine } from '@/types';
import { formatEngineTestGeneratedAt } from '@/pages/Engines/components/engineFormatters';

/** "Latest Test Sample" playback block, shown after a successful engine test. */
export const EngineTestSample: React.FC<{
  engine: TtsEngine;
  testResult: TtsEngine['last_test'];
}> = ({ engine, testResult }) => {
  const playerBus = usePlayerBus();

  if (!testResult || !testResult.ok) {
    return null;
  }

  const isCurrentEngineAudio = playerBus.scope === 'preview' && playerBus.audioUrl === testResult.audio_url;
  const isEnginePlaying = isCurrentEngineAudio && playerBus.playing;

  return (
    <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'var(--surface-dim)', borderRadius: '12px', border: '1px solid var(--border)', animation: 'fade-in 0.3s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 900, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Latest Test Sample
        </span>
        <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-muted)' }}>
          Generated at: {formatEngineTestGeneratedAt(testResult.generated_at)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginTop: '0.25rem' }}>
        <button
          type="button"
          onClick={() => {
            if (isCurrentEngineAudio) {
              if (isEnginePlaying) {
                pause();
              } else {
                play();
              }
            } else {
              loadAndPlay({
                scope: 'preview',
                title: engine.display_name,
                subtitle: 'TTS Engine Test Sample',
                audioUrl: testResult.audio_url,
              });
            }
          }}
          className="btn-ghost"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.4rem 0.8rem',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-primary)',
            fontSize: '0.85rem',
          }}
        >
          {isEnginePlaying ? <Pause size={14} /> : <Play size={14} />}
          {isEnginePlaying ? 'Pause' : 'Play Sample'}
        </button>
      </div>
    </div>
  );
};
