import { AlertTriangle, Lock, Mic } from 'lucide-react';
import { CharactersTab } from '@/components/CharactersTab';
import { VoiceProfileSelect } from '@/pages/ChapterEditor/components/VoiceProfileSelect';
import { useBookDataContext } from '@/pages/Book/BookDataContext';

export function CastingStage() {
  const {
    actions,
    bookId,
    effectiveProjectVoice,
    engines,
    mergedVoices,
    projectDefaultVoiceLabel,
    projectVoiceStatus,
    speakerProfiles,
    speakers,
  } = useBookDataContext();

  return (
    <section className="casting-stage" aria-label="Casting">
      {!projectVoiceStatus.enabled && projectVoiceStatus.message && (
        <div className="casting-stage__warning" role="alert">
          <AlertTriangle size={18} />
          <div>
            <strong>Project Default Voice Engine Unavailable</strong>
            <span>{projectVoiceStatus.message}</span>
          </div>
        </div>
      )}

      <CharactersTab
        projectId={bookId}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        pinnedRow={
          <div
            className="casting-stage__narrator-row"
            aria-label="Narrator default voice"
            style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface)', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid var(--accent)' }}
          >
            <div style={{ width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-glow)', color: 'var(--accent)', flexShrink: 0 }}>
              <Mic size={16} />
            </div>
            <div style={{ flex: 3 }}>
              <div style={{ fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)' }}>Narrator (default)</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>fallback for any unassigned line</div>
            </div>
            <div style={{ flex: 2 }} className="select-wrapper">
              <VoiceProfileSelect
                value={effectiveProjectVoice}
                onChange={(voice) => void actions.handleProjectVoiceChange(voice)}
                options={mergedVoices}
                defaultLabel={projectDefaultVoiceLabel}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ padding: '0.4rem', color: 'var(--text-muted)' }} title="The narrator is the default voice and can't be removed">
              <Lock size={16} />
            </div>
          </div>
        }
      />
    </section>
  );
}
