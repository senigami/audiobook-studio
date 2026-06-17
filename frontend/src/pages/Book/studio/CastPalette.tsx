import { useMemo } from 'react';
import { ColorSwatchPicker } from '@/components/forms/ColorSwatchPicker';
import type { Character, ChapterSegment, Speaker, SpeakerProfile, TtsEngine } from '@/types';
import {
  formatVoiceEngineLabel,
  getDefaultEngineId,
  getDefaultVoiceProfileName,
  getVariantDisplayName,
  getVoiceProfileEngine,
} from '@/utils/voiceProfiles';

interface CastPaletteProps {
  characters: Character[];
  segments: ChapterSegment[];
  speakers: Speaker[];
  speakerProfiles: SpeakerProfile[];
  engines?: TtsEngine[];
  selectedCharacterId: string | null;
  setSelectedCharacterId: (id: string | null) => void;
  selectedProfileName: string | null;
  setSelectedProfileName: (name: string | null) => void;
  expandedCharacterId: string | null;
  setExpandedCharacterId: (id: string | null) => void;
  onUpdateCharacterColor: (id: string, color: string) => void;
  allowDisarm?: boolean;
}

function buildSegmentCounts(segments: ChapterSegment[]) {
  return segments.reduce<Record<string, number>>((counts, segment) => {
    if (!segment.character_id) return counts;
    counts[segment.character_id] = (counts[segment.character_id] || 0) + 1;
    return counts;
  }, {});
}

export function CastPalette({
  characters,
  segments,
  speakers,
  speakerProfiles,
  engines = [],
  selectedCharacterId,
  setSelectedCharacterId,
  selectedProfileName,
  setSelectedProfileName,
  onUpdateCharacterColor,
  allowDisarm = true,
}: CastPaletteProps) {
  const segmentCounts = useMemo(() => buildSegmentCounts(segments), [segments]);

  const resolveDefaultProfileName = (char: Character) => {
    const profile = speakerProfiles.find((p) => p.name === char.speaker_profile_name);
    if (profile) return profile.name;
    const speakerMatch = speakers.find((s) => s.name === char.speaker_profile_name);
    const variants = speakerMatch ? speakerProfiles.filter((p) => p.speaker_id === speakerMatch.id) : [];
    return getDefaultVoiceProfileName(variants);
  };

  const isProfileSelectable = (profile?: SpeakerProfile | null) => {
    if (!profile) return false;
    const engineId = getVoiceProfileEngine(profile) || getDefaultEngineId(engines);
    const engine = engines.find((e) => e.engine_id === engineId);
    return Boolean(engine && engine.enabled && engine.status === 'ready');
  };


  return (
    <aside className="cast-palette" aria-label="Cast palette" style={{
      width: 180,
      flexShrink: 0,
      borderLeft: '1px solid var(--border)',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      minHeight: 0,
    }}>
      <div style={{
        padding: '0.5rem 0.6rem',
        borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          fontSize: '0.65rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}>
          Cast
        </div>
      </div>

      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '0.35rem 0',
      }}>
        <div style={{ margin: '0 0.35rem 0.35rem' }}>
          <button
            type="button"
            aria-pressed={selectedCharacterId === 'CLEAR_ASSIGNMENT'}
            onClick={() => {
              if (selectedCharacterId === 'CLEAR_ASSIGNMENT') {
                setSelectedCharacterId(null);
              } else {
                setSelectedCharacterId('CLEAR_ASSIGNMENT');
                setSelectedProfileName(null);
              }
            }}
            style={{
              width: '100%',
              border: selectedCharacterId === 'CLEAR_ASSIGNMENT'
                ? '1px solid var(--accent)'
                : '1px solid var(--border)',
              borderLeft: selectedCharacterId === 'CLEAR_ASSIGNMENT'
                ? '3px solid var(--accent)'
                : '3px solid transparent',
              borderRadius: 10,
              background: selectedCharacterId === 'CLEAR_ASSIGNMENT'
                ? 'var(--surface-light)'
                : 'transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0.45rem 0.55rem',
              color: 'var(--text-primary)',
              cursor: 'pointer',
              textAlign: 'left',
              opacity: selectedCharacterId !== null && selectedCharacterId !== 'CLEAR_ASSIGNMENT' ? 0.55 : 1,
            }}
          >
            <div style={{
              width: 18,
              height: 18,
              borderRadius: '50%',
              background: 'transparent',
              border: '1px solid var(--text-muted)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <div style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: 'var(--text-muted)',
              }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: '0.72rem',
                fontWeight: 700,
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                Narrator (default)
              </div>
              <div style={{
                fontSize: '0.58rem',
                color: 'var(--text-muted)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'click sentences to clear' : 'revert lines to narrator'}
              </div>
            </div>
          </button>
        </div>

        {characters.map((char) => {
          // A character stores its voice as a COMPOUND profile name ("Male - Young"),
          // but speakers are named by their BASE ("Male"). Resolve the speaker via the
          // character's own profile's speaker_id (compound-safe); fall back to exact- then
          // base-name match so non-variant voices and legacy data still work.
          const charProfile = speakerProfiles.find((p) => p.name === char.speaker_profile_name);
          const baseName = (char.speaker_profile_name ?? "").split(" - ")[0];
          const speakerMatch =
            (charProfile ? speakers.find((s) => s.id === charProfile.speaker_id) : undefined) ||
            speakers.find((s) => s.name === char.speaker_profile_name) ||
            speakers.find((s) => s.name === baseName);
          const variants = speakerMatch ? speakerProfiles.filter((p) => p.speaker_id === speakerMatch.id) : [];
          const isSpeakerSelected = selectedCharacterId === char.id;
          const defaultProfile = resolveDefaultProfileName(char);
          const count = segmentCounts[char.id] || 0;
          const isMuted = selectedCharacterId !== null && selectedCharacterId !== char.id;

          return (
            <div key={char.id} style={{ margin: '0 0.35rem 0.35rem' }}>
              <button
                type="button"
                onClick={() => {
                  if (allowDisarm && selectedCharacterId === char.id && selectedProfileName === defaultProfile) {
                    setSelectedCharacterId(null);
                    setSelectedProfileName(null);
                    return;
                  }
                  setSelectedCharacterId(char.id);
                  setSelectedProfileName(defaultProfile);
                }}
                aria-pressed={isSpeakerSelected}
                title={(() => {
                  const profileObj = speakerProfiles.find((p) => p.name === defaultProfile);
                  if (profileObj && !isProfileSelectable(profileObj)) {
                    const engineId = getVoiceProfileEngine(profileObj) || getDefaultEngineId(engines) || (engines[0]?.engine_id || '');
                    const engine = engines.find((e) => e.engine_id === engineId);
                    const engineLabel = engine?.display_name || formatVoiceEngineLabel(engineId);
                    if (!engine) return `Engine ${engineId} not found`;
                    if (!engine.enabled) return `Engine ${engineLabel} is disabled`;
                    return `Engine ${engineLabel} is ${engine.status.replace('_', ' ')}`;
                  }
                  return undefined;
                })()}
                style={{
                  width: '100%',
                  border: `1px solid ${isSpeakerSelected ? char.color : 'var(--border)'}`,
                  borderLeft: isSpeakerSelected ? `3px solid ${char.color}` : '3px solid transparent',
                  borderRadius: 10,
                  background: isSpeakerSelected ? `${char.color}14` : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '0.45rem 0.55rem',
                  color: 'var(--text-primary)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  opacity: isMuted ? 0.55 : 1,
                }}
              >
                <ColorSwatchPicker
                  value={char.color || '#94a3b8'}
                  onChange={(color) => onUpdateCharacterColor(char.id, color)}
                  size="sm"
                />
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: `${char.color}22`,
                  border: `1px solid ${char.color}55`,
                  color: char.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {char.name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    lineHeight: 1.2,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {char.name}
                  </div>
                  <div style={{
                    fontSize: '0.58rem',
                    color: 'var(--text-muted)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {selectedCharacterId === char.id && selectedProfileName
                      ? getVariantDisplayName(speakerProfiles.find((p) => p.name === selectedProfileName) || { name: selectedProfileName, variant_name: null } as SpeakerProfile)
                      : getVariantDisplayName(speakerProfiles.find((p) => p.name === char.speaker_profile_name) || { name: char.speaker_profile_name, variant_name: null } as SpeakerProfile) || 'No voice'}
                  </div>
                </div>
                {count > 0 && (
                  <div style={{
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    color: isSpeakerSelected ? char.color : 'var(--text-muted)',
                    background: isSpeakerSelected ? `${char.color}14` : 'var(--surface-light)',
                    padding: '1px 5px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}>
                    {count}
                  </div>
                )}
                {variants.length > 1 && (
                  <div style={{
                    fontSize: '0.55rem',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    background: 'var(--surface-light)',
                    padding: '1px 5px',
                    borderRadius: 999,
                    flexShrink: 0,
                  }}>
                    {variants.length}
                  </div>
                )}
              </button>

              {variants.length > 1 && isSpeakerSelected && (
                <div style={{ marginLeft: 18, marginTop: 4 }}>
                  {variants.map((variant) => {
                    const isVariantSelected = selectedCharacterId === char.id && selectedProfileName === variant.name;
                    const selectable = isProfileSelectable(variant);
                    const engineId = getVoiceProfileEngine(variant) || getDefaultEngineId(engines) || (engines[0]?.engine_id || '');
                    const engineLabel = formatVoiceEngineLabel(engineId);
                    const engine = engines.find((e) => e.engine_id === engineId);
                    let disabledReason = '';
                    if (!selectable) {
                      const variantEngineLabel = engine?.display_name || engineLabel;
                      if (!engine) disabledReason = `Engine ${engineId} not found`;
                      else if (!engine.enabled) disabledReason = `Engine ${variantEngineLabel} is disabled`;
                      else disabledReason = `Engine ${variantEngineLabel} is ${engine.status.replace('_', ' ')}`;
                    }

                    return (
                      <button
                        key={variant.name}
                        type="button"
                        onClick={() => {
                          if (allowDisarm && selectedCharacterId === char.id && selectedProfileName === variant.name) {
                            setSelectedCharacterId(null);
                            setSelectedProfileName(null);
                            return;
                          }
                          setSelectedCharacterId(char.id);
                          setSelectedProfileName(variant.name);
                        }}
                        disabled={false}
                        title={disabledReason || undefined}
                        style={{
                          width: '100%',
                          marginTop: 4,
                          border: `1px solid ${isVariantSelected ? char.color : 'transparent'}`,
                          borderRadius: 8,
                          background: isVariantSelected ? `${char.color}10` : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '0.32rem 0.4rem',
                          color: 'var(--text-primary)',
                          textAlign: 'left',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          opacity: !selectable ? 0.4 : 0.8,
                          minWidth: 0,
                        }}
                      >
                        <div style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          border: `1.5px solid ${char.color}`,
                          background: isVariantSelected ? char.color : 'transparent',
                          flexShrink: 0,
                        }} />
                        <div style={{
                          flex: 1,
                          fontSize: '0.66rem',
                          fontWeight: isVariantSelected ? 600 : 400,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>
                          {getVariantDisplayName(variant)}{!selectable ? ' 🚫' : ''}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{
        padding: '0.5rem 0.6rem 0.65rem',
        borderTop: '1px solid var(--border)',
        fontSize: '0.55rem',
        color: 'var(--text-muted)',
        lineHeight: 1.4,
      }}>
        {selectedCharacterId === 'CLEAR_ASSIGNMENT'
          ? 'click sentences to revert to narrator'
          : selectedCharacterId
            ? 'paint a voice, then click text to assign'
            : 'choose a cast member to start painting'}
      </div>
    </aside>
  );
}
