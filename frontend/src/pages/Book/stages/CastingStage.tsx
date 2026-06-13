import { AlertTriangle } from 'lucide-react';
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

      <div className="casting-stage__narrator-row" aria-label="Narrator default voice">
        <div className="casting-stage__narrator-copy">
          <strong>Narrator (default)</strong>
          <span>fallback for any unassigned line</span>
        </div>
        <div className="casting-stage__narrator-select">
          <VoiceProfileSelect
            value={effectiveProjectVoice}
            onChange={(voice) => void actions.handleProjectVoiceChange(voice)}
            options={mergedVoices}
            defaultLabel={projectDefaultVoiceLabel}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      <CharactersTab
        projectId={bookId}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
      />
    </section>
  );
}
