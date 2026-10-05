import { useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronUp, Plus, ArrowUpCircle, Trash2, MoreVertical, Ban, UserPlus, Play, Pause } from 'lucide-react';
import { ColorSwatchPicker } from '@/components/forms/ColorSwatchPicker';
import { VoiceProfileSelect } from '@/pages/ChapterEditor/components/VoiceProfileSelect';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { usePlayerBus, loadAndPlay, pause as pauseBus } from '@/store/playerBus';
import type { Character, ChapterSegment, Speaker, SpeakerProfile, TtsEngine } from '@/types';
import type { VoiceOption } from '@/utils/voiceProfiles';
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
  /** Delete a (temp) character (with confirm handled by the caller). */
  onDeleteCharacter?: (characterId: string) => void;
  /** Chapter-level default voice override (localVoice from useStudioChapter). */
  localVoice?: string;
  /** Called when the chapter default voice is changed. Required to show the voice select. */
  handleVoiceChange?: (voice: string) => void;
  /** Available voice options for the chapter default voice select. */
  availableVoices?: VoiceOption[];
  /** Label for the "use project default" option in the voice select. */
  chapterDefaultVoiceLabel?: string;
  /** Resolved name of the project-default voice (e.g. "David"), shown as the narrator's voice in small print. */
  chapterDefaultVoiceName?: string;
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
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (alwaysOpen || !onToggle) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <div
      onClick={alwaysOpen ? undefined : onToggle}
      onKeyDown={handleKeyDown}
      role={alwaysOpen ? undefined : 'button'}
      tabIndex={alwaysOpen ? undefined : 0}
      aria-expanded={alwaysOpen ? undefined : open}
      className="cast-palette__tier-header"
      style={{ cursor: alwaysOpen ? 'default' : 'pointer' }}
    >
      <span className="cast-palette__tier-header-label">
        {label}
      </span>
      <span className="label-micro-muted" style={{ marginRight: alwaysOpen ? 0 : 2 }}>
        {count}
      </span>
      {!alwaysOpen && (
        open
          ? <ChevronUp size={10} aria-hidden="true" className="cast-palette__tier-chevron" />
          : <ChevronDown size={10} aria-hidden="true" className="cast-palette__tier-chevron" />
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
  onDelete?: () => void;
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
  onDelete,
}: CharacterRowProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [labelFocused, setLabelFocused] = useState(false);
  const playerBus = usePlayerBus();

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

  const activateRow = () => {
    if (allowDisarm && selectedCharacterId === char.id && selectedProfileName === defaultProfile) {
      onDisarm();
      return;
    }
    onSelect();
  };

  return (
    <div
      data-testid={`cast-row-${char.id}`}
      className="cast-palette__row"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Card row: color swatch (its own button) is a SIBLING of the
          selectable label region below, never nested inside another
          button — nesting interactive controls produces invalid HTML
          and confuses assistive tech. */}
      <div
        className="cast-palette__card"
        style={{
          border: `1px solid ${isSpeakerSelected ? char.color : 'var(--border)'}`,
          borderLeft: isSpeakerSelected ? `3px solid ${char.color}` : '3px solid transparent',
          background: isSpeakerSelected ? `${char.color}14` : 'transparent',
          opacity: isMuted ? 0.55 : 1,
        }}
      >
        <ColorSwatchPicker
          value={char.color || '#94a3b8'}
          onChange={onColorChange}
          size="sm"
        />
        <div
          role="button"
          tabIndex={0}
          onClick={activateRow}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              activateRow();
            }
          }}
          aria-pressed={isSpeakerSelected}
          title={titleAttr}
          className="cast-palette__label"
        >
          <div
            className="cast-palette__avatar"
            style={{
              background: `${char.color}22`,
              border: `1px solid ${char.color}55`,
              color: char.color,
            }}
          >
            {char.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="cast-palette__info">
            <div className="cast-palette__name">
              {char.name}
            </div>
            <div className="label-micro-muted cast-palette__truncate">
              {isSpeakerSelected && selectedProfileName
                ? getVariantDisplayName(speakerProfiles.find((p) => p.name === selectedProfileName) || { name: selectedProfileName, variant_name: null } as SpeakerProfile)
                : getVariantDisplayName(speakerProfiles.find((p) => p.name === char.speaker_profile_name) || { name: char.speaker_profile_name, variant_name: null } as SpeakerProfile) || 'No voice'}
            </div>
          </div>
          {segmentCount > 0 && (
            <div
              title={`${segmentCount} line${segmentCount === 1 ? '' : 's'} assigned`}
              aria-label={`${segmentCount} line${segmentCount === 1 ? '' : 's'} assigned`}
              className="cast-palette__count-badge"
              style={{
                color: isSpeakerSelected ? char.color : 'var(--text-muted)',
                background: isSpeakerSelected ? `${char.color}14` : 'var(--surface-light)',
              }}
            >
              {segmentCount}
            </div>
          )}
          {variants.length > 1 && (
            <span
              title={`${variants.length} voices — click to choose`}
              aria-label={`${variants.length} voices available`}
              className="cast-palette__variant-indicator"
            >
              {isSpeakerSelected
                ? <ChevronUp size={12} aria-hidden="true" />
                : <ChevronDown size={12} aria-hidden="true" />}
            </span>
          )}
        </div>
      </div>

      {/* Promote/Delete overflow for tier-2 temps: always rendered (never
          conditionally unmounted) so it's reachable by keyboard Tab —
          quiet at rest, fully visible on hover or keyboard focus. */}
      {(onPromote || onDelete) && (
        <div
          className="cast-palette__row-menu"
          style={{ opacity: hovered || menuOpen || labelFocused ? 1 : 0.4 }}
          onFocus={() => setLabelFocused(true)}
          onBlur={() => setLabelFocused(false)}
        >
          <ActionMenu
            trigger={<MoreVertical size={14} aria-hidden="true" className="cast-palette__menu-icon" />}
            onOpenChange={setMenuOpen}
            items={[
              ...(onPromote ? [{ label: 'Promote to book cast', icon: ArrowUpCircle, onClick: onPromote }] : []),
              ...(onDelete ? [{ label: 'Delete character', icon: Trash2, isDestructive: true, onClick: onDelete }] : []),
            ]}
          />
        </div>
      )}

      {/* Variant list */}
      {variants.length > 1 && isSpeakerSelected && (
        <div className="cast-palette__variant-list">
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

            // Inline audition (persona fast-follow: Casting Director) — a play/pause
            // button per candidate variant so two voices can be compared without
            // leaving the chapter. Reuses the same global player-bus idiom as
            // VoiceCatalogCard's preview button (ADR-0010): a single "now playing"
            // slot means clicking candidate B naturally interrupts candidate A —
            // sequential audition for free, no new playback state to manage.
            const previewUrl = variant.preview_url ?? null;
            const isPlayingPreview =
              playerBus.scope === 'preview' &&
              playerBus.audioUrl === previewUrl &&
              playerBus.playing;
            const handlePreviewToggle = (event: React.MouseEvent) => {
              event.stopPropagation();
              if (!previewUrl) return;
              if (isPlayingPreview) {
                pauseBus();
              } else {
                loadAndPlay({
                  scope: 'preview',
                  title: `${char.name} — ${getVariantDisplayName(variant)}`,
                  subtitle: 'Voice preview',
                  audioUrl: previewUrl,
                });
              }
            };

            return (
              <div key={variant.name} className="cast-palette__variant-row">
                <button
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
                  className="cast-palette__variant-btn"
                  style={{
                    border: `1px solid ${isVariantSelected ? char.color : 'transparent'}`,
                    background: isVariantSelected ? `${char.color}10` : 'transparent',
                    opacity: !selectable ? 0.4 : 0.8,
                  }}
                >
                  <div
                    className="cast-palette__variant-dot"
                    style={{
                      border: `1.5px solid ${char.color}`,
                      background: isVariantSelected ? char.color : 'transparent',
                    }}
                  />
                  <div className="cast-palette__variant-text" style={{ fontWeight: isVariantSelected ? 600 : 400 }}>
                    <span className="cast-palette__variant-label">
                      {getVariantDisplayName(variant)}
                    </span>
                    {!selectable && <Ban size={10} aria-hidden="true" className="cast-palette__variant-ban-icon" />}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={handlePreviewToggle}
                  disabled={!previewUrl}
                  aria-label={isPlayingPreview ? `Pause ${getVariantDisplayName(variant)} preview` : `Play ${getVariantDisplayName(variant)} preview`}
                  title={previewUrl ? 'Play preview' : 'No preview available'}
                  className="cast-palette__variant-play-btn"
                >
                  {isPlayingPreview ? <Pause size={11} aria-hidden="true" /> : <Play size={11} aria-hidden="true" />}
                </button>
              </div>
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
  onDeleteCharacter,
  localVoice,
  handleVoiceChange,
  availableVoices = [],
  chapterDefaultVoiceLabel,
  chapterDefaultVoiceName,
}: CastPaletteProps) {
  const segmentCounts = useMemo(() => buildSegmentCounts(segments), [segments]);
  // The narrator's effective voice: the chapter override if set, otherwise the project default.
  const isClearMode = selectedCharacterId === 'CLEAR_ASSIGNMENT';
  const effectiveNarratorVoice = localVoice
    ? (availableVoices.find((option) => option.value === localVoice)?.name ?? localVoice)
    : (chapterDefaultVoiceName ?? '');

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
        onDelete={tier === 'tier2' && onDeleteCharacter ? () => onDeleteCharacter(char.id) : undefined}
      />
    );
  };

  // Decide which layout to render
  const useTiered = !!currentChapterId;
  // Per design-docs/workflows/chapter-editor-modes.md §13 decision #2: a book/
  // chapter with zero characters (across all three tiers) shows a single
  // empty-state card instead of three stacked "0 · none assigned" tiers.
  const totalCastCount = tier1.length + tier2.length + tier3.length;
  const hasNoCast = totalCastCount === 0;

  return (
    <aside className="cast-palette" aria-label="Cast palette">
      <div className="cast-palette__header">
        <div className="cast-palette__header-title">
          Cast
        </div>
      </div>

      <div className="cast-palette__body">
        {/* Narrator (default) — the chapter's default voice + clear-assignment paint mode */}
        <div className="cast-palette__narrator">
          <button
            type="button"
            aria-pressed={isClearMode}
            title="Click sentences to revert them to the narrator's voice"
            onClick={() => {
              if (isClearMode) {
                setSelectedCharacterId(null);
              } else {
                setSelectedCharacterId('CLEAR_ASSIGNMENT');
                setSelectedProfileName(null);
              }
            }}
            className="cast-palette__narrator-btn"
            style={{
              border: isClearMode ? '1px solid var(--action-primary)' : '1px solid var(--border)',
              borderLeft: isClearMode ? '3px solid var(--action-primary)' : '3px solid transparent',
              background: isClearMode ? 'var(--surface-light)' : 'transparent',
              opacity: selectedCharacterId !== null && !isClearMode ? 0.55 : 1,
            }}
          >
            <div className="cast-palette__narrator-icon">
              <div className="cast-palette__narrator-dot" />
            </div>
            <div className="cast-palette__info">
              <div className="cast-palette__narrator-name">
                Narrator (default)
              </div>
              <div
                className="cast-palette__truncate"
                style={{ fontSize: 'var(--type-micro)', color: isClearMode ? 'var(--action-primary)' : 'var(--text-muted)' }}
              >
                {isClearMode
                  ? 'click sentences to clear'
                  : (effectiveNarratorVoice || 'revert lines to narrator')}
              </div>
            </div>
          </button>
          {handleVoiceChange && (
            <label className="label-micro-muted cast-palette__override-label">
              <span className="cast-palette__override-caption">Override voice</span>
              <VoiceProfileSelect
                value={localVoice ?? ''}
                onChange={handleVoiceChange}
                options={availableVoices}
                defaultLabel={chapterDefaultVoiceLabel ?? 'Use Project Default'}
                /* VoiceProfileSelect's own inline `style` (with a trailing
                   `...style` spread) always wins over a CSS class — an
                   inline style attribute beats external stylesheet rules
                   regardless of specificity — so this override must stay
                   inline, not become a className, or it would silently stop
                   applying. */
                style={{ width: '100%', fontSize: '0.7rem', padding: '0.25rem 1.5rem 0.25rem 0.4rem', marginTop: '0.1rem' }}
              />
            </label>
          )}
        </div>

        {/* ── Empty-cast state ──────────────────────────────── */}
        {hasNoCast ? (
          <div className="cast-palette__empty">
            <p className="cast-palette__empty-text cast-palette__empty-text--lead">
              No cast yet — this chapter reads in the narrator&apos;s voice.
            </p>
            {onCreateTempCharacter && (
              <button
                type="button"
                onClick={onCreateTempCharacter}
                className="cast-palette__empty-add-btn"
              >
                <UserPlus size={12} aria-hidden="true" />
                Add character
              </button>
            )}
            <p className="cast-palette__empty-text cast-palette__empty-text--tail">
              Building a full cast? Try the Casting Call tool in the rail on the left.
            </p>
          </div>
        ) : useTiered ? (
          <>
            {/* Tier 1: In this chapter */}
            <TierHeader
              label="In this chapter"
              count={tier1.length}
              open={true}
              alwaysOpen
            />
            {tier1.length === 0 ? (
              <div className="cast-palette__tier-empty">
                none assigned
              </div>
            ) : (
              <div className="cast-palette__tier-list">
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
              <div className="cast-palette__tier-list">
                {tier2.map((char) => renderRow(char, 'tier2'))}
                {onCreateTempCharacter && (
                  <div className="cast-palette__temp-wrap">
                    <button
                      type="button"
                      onClick={onCreateTempCharacter}
                      className="cast-palette__temp-btn"
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
              <div className="cast-palette__tier-list">
                {tier3.length === 0 ? (
                  <div className="cast-palette__tier-empty">
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

      <div className="cast-palette__footer">
        {selectedCharacterId === 'CLEAR_ASSIGNMENT'
          ? 'click sentences to revert to narrator'
          : selectedCharacterId
            ? 'a character is selected — click sentences to assign it'
            : 'select a character, then click sentences to assign'}
      </div>
    </aside>
  );
}
