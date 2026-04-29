import React from 'react';
import { User, Info, ChevronRight, ChevronDown } from 'lucide-react';
import { ColorSwatchPicker } from '../ColorSwatchPicker';
import type { Character, SpeakerProfile, Speaker } from '../../types';
import {
  getDefaultVoiceProfileName,
  getVariantDisplayName,
  getVoiceProfileEngine,
  formatVoiceEngineLabel,
  buildVoiceOptions,
} from '../../utils/voiceProfiles';

interface CharacterSidebarProps {
  characters: Character[];
  speakers: Speaker[];
  speakerProfiles: SpeakerProfile[];
  engines?: import('../../types').TtsEngine[];
  selectedCharacterId: string | null;
  setSelectedCharacterId: (id: string | null) => void;
  selectedProfileName: string | null;
  setSelectedProfileName: (name: string | null) => void;
  expandedCharacterId: string | null;
  setExpandedCharacterId: (id: string | null) => void;
  onUpdateCharacterColor: (id: string, color: string) => void;
  segmentsCount: number;
  wordCount: number;
}

export const CharacterSidebar: React.FC<CharacterSidebarProps> = ({
  characters,
  speakers,
  speakerProfiles,
  engines = [],
  selectedCharacterId,
  setSelectedCharacterId,
  selectedProfileName,
  setSelectedProfileName,
  expandedCharacterId,
  setExpandedCharacterId,
  onUpdateCharacterColor,
  segmentsCount,
  wordCount
}) => {
  const resolveDefaultProfileName = (char: Character) => {
    const profile = (speakerProfiles || []).find(p => p.name === char.speaker_profile_name);
    if (profile) return profile.name;
    const speakerMatch = (speakers || []).find(s => s.name === char.speaker_profile_name);
    const variants = speakerMatch ? (speakerProfiles || []).filter(p => p.speaker_id === speakerMatch.id) : [];
    return getDefaultVoiceProfileName(variants);
  };

  const allVoices = React.useMemo(() =>
    buildVoiceOptions(speakerProfiles, speakers, engines, characters),
    [speakerProfiles, speakers, engines, characters]
  );

  const unassignedVoices = React.useMemo(() => {
    const sepIdx = allVoices.findIndex(v => v.id === 'separator-line');
    if (sepIdx === -1) return [];
    return allVoices.slice(sepIdx + 1);
  }, [allVoices]);

  const isSidebarProfileSelectable = (profile?: SpeakerProfile | null) => {
    if (!profile) return false;
    const engineId = getVoiceProfileEngine(profile) || 'xtts';
    const engine = engines.find(e => e.engine_id === engineId);
    return Boolean(engine && engine.enabled && engine.status === 'ready');
  };

  const toggleCharacterExpansion = (characterId: string) => {
    setExpandedCharacterId(expandedCharacterId === characterId ? null : characterId);
  };

  return (
    <div style={{
      width: '320px',
      marginLeft: '1rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem'
    }}>
        <div className="glass-panel" style={{ padding: '1rem', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                <User size={16} />
                Characters
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', overflowY: 'auto', flex: 1, paddingRight: '0.5rem' }}>
                <button
                    onClick={() => {
                        if (selectedCharacterId === 'CLEAR_ASSIGNMENT') {
                            setSelectedCharacterId(null);
                        } else {
                            setSelectedCharacterId('CLEAR_ASSIGNMENT');
                            setSelectedProfileName(null);
                        }
                    }}
                    style={{
                        padding: '0.75rem',
                        borderRadius: '8px',
                        border: `1px solid ${selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'var(--accent)' : 'var(--border)'}`,
                        background: selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'var(--surface-light)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        color: 'var(--text-primary)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                        position: 'relative'
                    }}
                >
                    <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: 'var(--text-muted)' }} />
                    <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>None / Default</div>
                        <div style={{ fontSize: '0.7rem', opacity: 0.6 }}>{selectedCharacterId === 'CLEAR_ASSIGNMENT' ? 'Click lines to clear' : 'Explicit clear mode'}</div>
                    </div>
                    {selectedCharacterId === 'CLEAR_ASSIGNMENT' && (
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent)', position: 'absolute', top: '8px', right: '8px' }} />
                    )}
                </button>

                {characters.map(char => {
                    const speakerMatch = (speakers || []).find(s => s.name === char.speaker_profile_name);
                    const variants = speakerMatch ? (speakerProfiles || []).filter(p => p.speaker_id === speakerMatch.id) : [];
                    const isExpanded = expandedCharacterId === char.id;
                    const isSpeakerSelected = selectedCharacterId === char.id;

                    return (
                        <React.Fragment key={char.id}>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                {variants.length > 1 ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleCharacterExpansion(char.id);
                                        }}
                                        className="btn-ghost"
                                        style={{
                                            width: '28px', minWidth: '28px', height: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            padding: 0, opacity: 0.6, borderRadius: '4px'
                                        }}
                                    >
                                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                    </button>
                                ) : (
                                    <div style={{ width: '28px', minWidth: '28px' }} />
                                )}

                                    <div
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => {
                                        const defaultProfile = resolveDefaultProfileName(char);
                                        setSelectedCharacterId(char.id);
                                        setSelectedProfileName(defaultProfile);
                                    }}
                                    onKeyDown={(e) => {
                                        if (e.key !== 'Enter' && e.key !== ' ') return;
                                        e.preventDefault();
                                        const defaultProfile = resolveDefaultProfileName(char);
                                        setSelectedCharacterId(char.id);
                                        setSelectedProfileName(defaultProfile);
                                    }}
                                    aria-disabled={(() => {
                                        const defaultProfile = resolveDefaultProfileName(char);
                                        const profileObj = speakerProfiles.find(p => p.name === defaultProfile);
                                        return profileObj ? !isSidebarProfileSelectable(profileObj) : false;
                                    })()}
                                    title={(() => {
                                        const defaultProfile = resolveDefaultProfileName(char);
                                        const profileObj = speakerProfiles.find(p => p.name === defaultProfile);
                                        if (profileObj && !isSidebarProfileSelectable(profileObj)) {
                                            const engineId = getVoiceProfileEngine(profileObj) || 'xtts';
                                            const engineLabel = formatVoiceEngineLabel(engineId);
                                            const engine = engines.find(e => e.engine_id === engineId);
                                            if (!engine) return `Engine ${engineId} not found`;
                                            if (!engine.enabled) return `Engine ${engineLabel} is disabled`;
                                            return `Engine ${engineLabel} is ${engine.status.replace('_', ' ')}`;
                                        }
                                        return undefined;
                                    })()}
                                    style={{
                                        flex: 1, padding: '0.75rem', borderRadius: '8px',
                                        border: `1px solid ${isSpeakerSelected ? char.color : 'var(--border)'}`,
                                        background: isSpeakerSelected ? `${char.color}15` : 'transparent',
                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                        color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s',
                                        minWidth: 0,
                                        opacity: (() => {
                                            const defaultProfile = resolveDefaultProfileName(char);
                                            const profileObj = speakerProfiles.find(p => p.name === defaultProfile);
                                            return profileObj && !isSidebarProfileSelectable(profileObj) ? 0.4 : 1;
                                        })()
                                    }}
                                >
                                    <ColorSwatchPicker
                                        value={char.color || '#94a3b8'}
                                        onChange={(color) => onUpdateCharacterColor(char.id, color)}
                                        size="sm"
                                    />
                                    <div style={{ flex: 1, overflow: 'hidden' }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {char.name}
                                            {(() => {
                                                const defaultProfile = resolveDefaultProfileName(char);
                                                const profileObj = speakerProfiles.find(p => p.name === defaultProfile);
                                                return profileObj && !isSidebarProfileSelectable(profileObj) ? ' 🚫' : '';
                                            })()}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {selectedCharacterId === char.id && selectedProfileName
                                                ? getVariantDisplayName(speakerProfiles.find(p => p.name === selectedProfileName) || { name: selectedProfileName, variant_name: null } as SpeakerProfile)
                                                : getVariantDisplayName(speakerProfiles.find(p => p.name === char.speaker_profile_name) || { name: char.speaker_profile_name, variant_name: null } as SpeakerProfile) || 'No voice'}
                                        </div>
                                    </div>
                                    {variants.length > 1 && (
                                        <div style={{ fontSize: '0.65rem', background: 'var(--surface-light)', padding: '2px 6px', borderRadius: '10px', opacity: 0.8, fontWeight: 700, flexShrink: 0 }}>
                                            {variants.length}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {isExpanded && variants.map(variant => {
                                const isVariantSelected = selectedCharacterId === char.id && selectedProfileName === variant.name;
                                const selectable = isSidebarProfileSelectable(variant);
                                const engineId = getVoiceProfileEngine(variant) || 'xtts';
                                const engineLabel = formatVoiceEngineLabel(engineId);
                                const engine = engines.find(e => e.engine_id === engineId);
                                let disabledReason = '';
                                if (!selectable) {
                                    if (!engine) disabledReason = `Engine ${engineId} not found`;
                                    else if (!engine.enabled) disabledReason = `Engine ${engineLabel} is disabled`;
                                    else disabledReason = `Engine ${engineLabel} is ${engine.status.replace('_', ' ')}`;
                                }

                                return (
                                    <button
                                        key={variant.name}
                                        onClick={() => {
                                            setSelectedCharacterId(char.id);
                                            setSelectedProfileName(variant.name);
                                        }}
                                        disabled={false}
                                        title={disabledReason || undefined}
                                        style={{
                                            marginLeft: '36px', padding: '0.5rem 0.75rem', borderRadius: '6px',
                                            border: `1px solid ${isVariantSelected ? char.color : 'transparent'}`,
                                            background: isVariantSelected ? `${char.color}10` : 'transparent',
                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                            color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer', transition: 'all 0.2s',
                                            opacity: !selectable ? 0.4 : (isVariantSelected ? 1 : 0.7),
                                            minWidth: 0
                                        }}
                                    >
                                        <div style={{
                                            width: '8px', height: '8px', borderRadius: '50%',
                                            border: `1.5px solid ${char.color}`,
                                            background: isVariantSelected ? char.color : 'transparent',
                                            flexShrink: 0
                                        }} />
                                        <div style={{ flex: 1, fontSize: '0.8rem', fontWeight: isVariantSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {getVariantDisplayName(variant)}{!selectable ? ' 🚫' : ''}
                                        </div>
                                    </button>
                                );
                            })}
                        </React.Fragment>
                    );
                })}

                {unassignedVoices.length > 0 && (
                    <>
                        <div style={{
                            marginTop: '1rem',
                            padding: '0.5rem 0',
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                            letterSpacing: '0.05em',
                            borderTop: '1px solid var(--border)'
                        }}>
                            Other Voices
                        </div>
                        {unassignedVoices.map(voice => (
                            <button
                                key={voice.id}
                                onClick={() => {
                                    setSelectedCharacterId(null);
                                    setSelectedProfileName(voice.value);
                                }}
                                disabled={voice.disabled}
                                title={voice.disabled_reason}
                                style={{
                                    padding: '0.65rem 0.75rem',
                                    borderRadius: '8px',
                                    border: `1px solid ${selectedCharacterId === null && selectedProfileName === voice.value ? 'var(--accent)' : 'transparent'}`,
                                    background: selectedCharacterId === null && selectedProfileName === voice.value ? 'var(--surface-light)' : 'transparent',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    color: 'var(--text-primary)',
                                    textAlign: 'left',
                                    cursor: voice.disabled ? 'not-allowed' : 'pointer',
                                    transition: 'all 0.2s',
                                    opacity: voice.disabled ? 0.4 : 1,
                                    fontSize: '0.8rem',
                                    width: '100%'
                                }}
                            >
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-muted)', opacity: 0.5 }} />
                                <div style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {voice.name}
                                </div>
                            </button>
                        ))}
                    </>
                )}
            </div>

            <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <Info size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Select a character to bulk-assign lines by clicking them in the script.
            </div>
        </div>

        <div className="glass-panel" style={{ padding: '1rem' }}>
            <h4 style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Info size={12} /> Chapter
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
                <div style={{ background: 'var(--surface)', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{segmentsCount}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Segments</div>
                </div>
                <div style={{ background: 'var(--surface)', padding: '0.5rem', borderRadius: '6px', textAlign: 'center' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 700 }}>{wordCount.toLocaleString()}</div>
                    <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Words</div>
                </div>
            </div>
        </div>
    </div>
  );
};
