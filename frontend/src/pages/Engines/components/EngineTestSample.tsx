import React from 'react';
import { Play, Pause } from 'lucide-react';
import { usePlayerBus, loadAndPlay, play, pause } from '@/store/playerBus';
import type { TtsEngine } from '@/types';
import { formatEngineTestGeneratedAt } from '@/pages/Engines/components/engineFormatters';
import '@/pages/Engines/components/EngineCard.css';

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
    <div className="engine-test-sample">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span className="engine-eyebrow">
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
          className="btn-ghost engine-test-sample__play-btn"
        >
          {isEnginePlaying ? <Pause size={14} /> : <Play size={14} />}
          {isEnginePlaying ? 'Pause' : 'Play Sample'}
        </button>
      </div>
    </div>
  );
};
