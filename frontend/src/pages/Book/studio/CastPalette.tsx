import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Plus, ArrowUpCircle } from 'lucide-react';
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
  /** The currently-active chapter's ID — drives 3-tier grouping. */
  currentChapterId?: string | null;
  /** Called when user clicks "+ Temp character"; implementation creates + reloads characters. */
  onCreateTempCharacter?: () => void;
  /** Called when user clicks Promote on a tier-2 character. */
  onPromoteCharacter?: (characterId: string) => void;
}

function buildSegmentCounts(segments: ChapterSegment[]) {
  return segments.reduce<Record<string, number>>((counts, segment) => {
    if (!segment.character_id) return counts;
    counts[segment.character_id] = (counts[segment.character_id] || 0) + 1;
    return counts;
  }, {});
}

// ---------------------------------------------------------------------------
// TierHeader

interface TierHeaderProps {
  label: string;
  count: number;
  open: boolean;
  onToggle?: () => void;
  alwaysOpen?: boolean;
}

function TierHeader({ label, count, open, onToggle, alwaysOpen }: TierHeaderProps) {
  return (
    <div
      onClick={alwaysOpen ? undefined : onToggle}
      role={alwaysOpen ? undefined : 'button'}
      aria-expanded={alwaysOpen ? undefined : open}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px var(--space-2)',
        borderTop: '1px solid var(--hairline)',
        borderBottom: '1px solid var(--hairline)',
        background: 'var(--surface-alt)',
        cursor: alwaysOpen ? 'default' : 'pointer',
        userSelect: 'none',
        flexShrink: 0,
        marginTop: 4,
      }}
    >
      <span style={{
        flex: 1,
        fontSize: 'var(--type-micro)',
        fontWeight: 700,
        letterSpacing: '0.07em',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}>
        {label}
      </span>
      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: alwaysOpen ? 0 : 2 }}>
        {count}
      </span>
      {!alwaysOpen && (
        open
          ? <ChevronUp size={10} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          : <ChevronDown size={10} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CharacterRow (single character entry, preserving all original variant logic)

interface CharacterRowProps {
  char: Character;
  isSpeakerSelected: boolean;
  isMuted: boolean;
  segmentCount: number;
  speakers: Speaker[];
  speakerProfiles: SpeakerProfile[];
  engines: TtsEngine[];
  selectedCharacterId: string | null;
  selectedProfileName: string | null;
  allowDisarm: boolean;
  onSelect: () => void;
  onDisarm: () => void;
  onColorChange: (color: string) => void;
  onVariantSelect: (variantName: string) => void;
  onVariantDisarm: () => void;
  onPromote?: () => void;
}

function CharacterRow({
  char,
  isSpeakerSelected,
  isMuted,
  segmentCount,
  speakers,
  speakerProfiles,
  engines,
  selectedCharacterId,
  selectedProfileName,
  allowDisarm,
  onSelect,
  onDisarm,
  onColorChange,
  onVariantSelect,
  onVariantDisarm,
  onPromote,
}: CharacterRowProps) {
  const [hovered, setHovered] = useState(false);

  const charProfile = speakerProfiles.find((p) => p.name === char.speaker_profile_name);
  const baseName = (char.speaker_profile_name ?? '').split(' - ')[0];
  const speakerMatch =
    (charProfile ? speakers.find((s) => s.id === charProfile.speaker_id) : undefined) ||
    speakers.find((s) => s.name === char.speaker_profile_name) ||
    speakers.find((s) => s.name === baseName);
  const variants = speakerMatch ? speakerProfiles.filter((p) => p.speaker_id === speakerMatch.id) : [];

  const resolveDefaultProfileName = () => {
    const profile = speakerProfiles.find((p) => p.name === char.speaker_profile_name);
    if (profile) return profile.name;
    const vList = speakerMatch ? speakerProfiles.filter((p) => p.speaker_id === speakerMatch.id) : [];
    return getDefaultVoiceProfileName(vList);
  };

  const isProfileSelectable = (profile?: SpeakerProfile | null) => {
    if (!profile) return false;
    const engineId = getVoiceProfileEngine(profile) || getDefaultEngineId(engines);
    const engine = engines.find((e) => e.engine_id === engineId);
    return Boolean(engine && engine.enabled && engine.status === 'ready');
  };

  const defaultProfile = resolveDefaultProfileName();
  const titleAttr = (() => {
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
  })();

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ margin: '0 0.35rem 0.35rem' }}
    >
      <button
        type="button"
        onClick={() => {
          if (allowDisarm && selectedCharacterId === char.id && selectedProfileName === defaultProfile) {
            onDisarm();
            return;
          }
          onSelect();
        }}
        aria-pressed={isSpeakerSelected}
        title={titleAttr}
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
          onChange={onColorChange}
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
            {isSpeakerSelected && selectedProfileName
              ? getVariantDisplayName(speakerProfiles.find((p) => p.name === selectedProfileName) || { name: selectedProfileName, variant_name: null } as SpeakerProfile)
              : getVariantDisplayName(speakerProfiles.find((p) => p.name === char.speaker_profile_name) || { name: char.speaker_profile_name, variant_name: null } as SpeakerProfile) || 'No voice'}
          </div>
        </div>
        {segmentCount > 0 && (
          <div style={{
            fontSize: '0.55rem',
            fontWeight: 700,
            color: isSpeakerSelected ? char.color : 'var(--text-muted)',
            background: isSpeakerSelected ? `${char.color}14` : 'var(--surface-light)',
            padding: '1px 5px',
            borderRadius: 999,
            flexShrink: 0,
          }}>
            {segmentCount}
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

      {/* Promote affordance for tier-2 temps */}
      {onPromote && hovered && (
        <div style={{ paddingLeft: 4, paddingBottom: 2, display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPromote(); }}
            title="Promote to book character"
            style={{
              fontSize: 'var(--type-micro)',
              padding: '1px 6px',
              borderRadius: 999,
              border: '1px solid var(--accent-tint-border)',
              background: 'var(--accent-tint-bg)',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              whiteSpace: 'nowrap',
            }}
          >
            <ArrowUpCircle size={9} aria-hidden="true" />
            Promote
          </button>
        </div>
      )}

      {/* Variant list */}
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
                    onVariantDisarm();
                    return;
                  }
                  onVariantSelect(variant.name);
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
                  {getVariantDisplayName(variant)}{!selectable ? ' \u{1F6AB}' : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CastPalette

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
  currentChapterId,
  onCreateTempCharacter,
  onPromoteCharacter,
}: CastPaletteProps) {
  const segmentCounts = useMemo(() => buildSegmentCounts(segments), [segments]);

  // IDs of book characters that appear in current chapter (≥1 segment assigned)
  const usedInChapter = useMemo(() => {
    if (!currentChapterId) return new Set<string>();
    const ids = new Set<string>();
    for (const seg of segments) {
      if (seg.character_id) ids.add(seg.character_id);
    }
    return ids;
  }, [segments, currentChapterId]);

  // 3-tier grouping
  const { tier1, tier2, tier3 } = useMemo(() => {
    if (!currentChapterId) {
      // No chapter context: flat list, all in tier1
      return { tier1: characters, tier2: [] as Character[], tier3: [] as Character[] };
    }
    const t1: Character[] = [];
    const t2: Character[] = [];
    const t3: Character[] = [];
    for (const char of characters) {
      if (char.chapter_id === currentChapterId) {
        t2.push(char);
      } else if (!char.chapter_id && usedInChapter.has(char.id)) {
        t1.push(char);
      } else if (!char.chapter_id) {
        t3.push(char);
      }
      // chars with a different chapter_id are scoped to another chapter — omit
    }
    return { tier1: t1, tier2: t2, tier3: t3 };
  }, [characters, currentChapterId, usedInChapter]);

  const [tier2Open, setTier2Open] = useState(true);
  const [tier3Open, setTier3Open] = useState(false);

  const makeRowHandlers = (char: Character) => {
    const charProfile = speakerProfiles.find((p) => p.name === char.speaker_profile_name);
    const baseName = (char.speaker_profile_name ?? '').split(' - ')[0];
    const speakerMatch =
      (charProfile ? speakers.find((s) => s.id === charProfile.speaker_id) : undefined) ||
      speakers.find((s) => s.name === char.speaker_profile_name) ||
      speakers.find((s) => s.name === baseName);
    const vList = speakerMatch ? speakerProfiles.filter((p) => p.speaker_id === speakerMatch.id) : [];

    const getDefault = () => {
      const profile = speakerProfiles.find((p) => p.name === char.speaker_profile_name);
      if (profile) return profile.name;
      return getDefaultVoiceProfileName(vList);
    };

    return {
      onSelect: () => {
        setSelectedCharacterId(char.id);
        setSelectedProfileName(getDefault());
      },
      onDisarm: () => {
        setSelectedCharacterId(null);
        setSelectedProfileName(null);
      },
      onColorChange: (color: string) => onUpdateCharacterColor(char.id, color),
      onVariantSelect: (variantName: string) => {
        setSelectedCharacterId(char.id);
        setSelectedProfileName(variantName);
      },
      onVariantDisarm: () => {
        setSelectedCharacterId(null);
        setSelectedProfileName(null);
      },
    };
  };

  const renderRow = (char: Character, tier: 'tier1' | 'tier2' | 'tier3') => {
    const isSpeakerSelected = selectedCharacterId === char.id;
    const isMuted = selectedCharacterId !== null && selectedCharacterId !== char.id;
    const handlers = makeRowHandlers(char);
    return (
      <CharacterRow
        key={char.id}
        char={char}
        isSpeakerSelected={isSpeakerSelected}
        isMuted={isMuted}
        segmentCount={segmentCounts[char.id] || 0}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        selectedCharacterId={selectedCharacterId}
        selectedProfileName={selectedProfileName}
        allowDisarm={allowDisarm}
        onSelect={handlers.onSelect}
        onDisarm={handlers.onDisarm}
        onColorChange={handlers.onColorChange}
        onVariantSelect={handlers.onVariantSelect}
        onVariantDisarm={handlers.onVariantDisarm}
        onPromote={tier === 'tier2' && onPromoteCharacter ? () => onPromoteCharacter(char.id) : undefined}
      />
    );
  };

  // Decide which layout to render
  const useTiered = !!currentChapterId;

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
        {/* Narrator (default) clear-assignment button */}
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

        {/* ── Tiered layout ─────────────────────────────────── */}
        {useTiered ? (
          <>
            {/* Tier 1: In this chapter */}
            <TierHeader
              label="In this chapter"
              count={tier1.length}
              open={true}
              alwaysOpen
            />
            {tier1.length === 0 ? (
              <div style={{ padding: '0.2rem 0.6rem', fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                none assigned
              </div>
            ) : (
              <div style={{ marginTop: 4 }}>
                {tier1.map((char) => renderRow(char, 'tier1'))}
              </div>
            )}

            {/* Tier 2: Chapter cast (temp) */}
            <TierHeader
              label="Chapter cast"
              count={tier2.length}
              open={tier2Open}
              onToggle={() => setTier2Open((v) => !v)}
            />
            {tier2Open && (
              <div style={{ marginTop: 4 }}>
                {tier2.map((char) => renderRow(char, 'tier2'))}
                {onCreateTempCharacter && (
                  <div style={{ margin: '0 0.35rem 0.35rem' }}>
                    <button
                      type="button"
                      onClick={onCreateTempCharacter}
                      style={{
                        width: '100%',
                        border: '1px dashed var(--border)',
                        borderRadius: 10,
                        background: 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '0.35rem 0.55rem',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        fontSize: 'var(--type-micro)',
                        fontStyle: 'italic',
                      }}
                    >
                      <Plus size={10} aria-hidden="true" />
                      Temp character
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tier 3: Everyone else */}
            <TierHeader
              label="Everyone else"
              count={tier3.length}
              open={tier3Open}
              onToggle={() => setTier3Open((v) => !v)}
            />
            {tier3Open && (
              <div style={{ marginTop: 4 }}>
                {tier3.length === 0 ? (
                  <div style={{ padding: '0.2rem 0.6rem', fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    none
                  </div>
                ) : (
                  tier3.map((char) => renderRow(char, 'tier3'))
                )}
              </div>
            )}
          </>
        ) : (
          /* Flat layout when no chapter context */
          characters.map((char) => renderRow(char, 'tier1'))
        )}
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
