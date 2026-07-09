import React, { useState, useEffect, useMemo, useCallback } from 'react';
import type { Character, Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';
import { api } from '@/api';
import { Plus, Trash2, User as UserIcon, Sparkles } from 'lucide-react';
import { ColorSwatchPicker } from '@/components/forms/ColorSwatchPicker';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { CastingSuggestionsModal } from '@/components/CastingSuggestionsModal';
import { VoiceProfileSelect } from '@/pages/ChapterEditor/components/VoiceProfileSelect';
import { buildVoiceOptions } from '@/utils/voiceProfiles';
import { emitToast } from '@/utils/toast';

interface CharactersTabProps {
  projectId: string;
  speakers: Speaker[];
  speakerProfiles: SpeakerProfile[];
  engines?: TtsEngine[];
  /** Optional non-deletable row rendered as the first entry of the list (e.g. the Narrator default). */
  pinnedRow?: React.ReactNode;
}

export const CharactersTab: React.FC<CharactersTabProps> = ({ projectId, speakers, speakerProfiles, engines = [], pinnedRow }) => {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);

  // New character form
  const [newName, setNewName] = useState('');
  const [newVoice, setNewVoice] = useState('');
  const [newColor, setNewColor] = useState('#8b5cf6');

  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  // AI casting — "Suggest voices for this character" (POST /api/voices/cast)
  const [voiceMetadataList, setVoiceMetadataList] = useState<VoiceMetadata[]>([]);
  const [castingCharacter, setCastingCharacter] = useState<Character | null>(null);

  const loadCharacters = async () => {
    setLoading(true);
    try {
      const chars = await api.fetchCharacters(projectId);
      setCharacters(chars);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCharacters();
  }, [projectId]);

  useEffect(() => {
    api.listVoicesWithMetadata()
      .then(list => setVoiceMetadataList(Array.isArray(list) ? list : []))
      .catch(() => {
        // Non-fatal: the "Suggest voices" action degrades to an empty catalog message.
      });
  }, []);

  // Compute merged voices groupings
  const availableVoices = useMemo(() => {
    return buildVoiceOptions(speakerProfiles || [], speakers || [], engines, characters);
  }, [speakerProfiles, speakers, engines, characters]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      await api.createCharacter(projectId, newName.trim(), newVoice || undefined, undefined, newColor);
      setNewName('');
      setNewVoice('');
      setNewColor('#8b5cf6');
      await loadCharacters();
    } catch (e) {
      console.error("Failed to create character", e);
      emitToast('Failed to create character.');
    }
  };

  const handleUpdateVoice = async (id: string, newProfile: string) => {
    try {
      // Optimistic update
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, speaker_profile_name: newProfile || null } : c));
      await api.updateCharacter(id, undefined, newProfile || "");
    } catch (e) {
      console.error("Failed to update character voice", e);
      emitToast('Failed to update character voice.');
      loadCharacters(); // Revert on failure
    }
  };

  // Confirming an AI casting suggestion goes through the exact same real
  // assignment mutation as the manual voice dropdown above — it never auto-assigns.
  const handleAssignSuggestedVoice = useCallback((characterId: string, speakerProfileName: string) => {
    void handleUpdateVoice(characterId, speakerProfileName);
  }, []);

  const handleUpdateName = async (id: string, newNameStr: string) => {
      const trimmedName = newNameStr.trim();
      if (!trimmedName) return;
      try {
          // Optimistic update
          setCharacters(prev => prev.map(c => c.id === id ? { ...c, name: trimmedName } : c));
          await api.updateCharacter(id, trimmedName);
      } catch (e) {
          console.error("Failed to update character name", e);
          emitToast('Failed to update character name.');
          loadCharacters(); // Revert on failure
      }
  };

  const handleUpdateColor = async (id: string, color: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, color } : c));
      await api.updateCharacter(id, undefined, undefined, undefined, color);
    } catch (e) {
      console.error("Failed to update character color", e);
      emitToast('Failed to update character color.');
      loadCharacters();
    }
  };

  const handlePromote = async (id: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, chapter_id: null } : c));
      await api.promoteCharacter(id);
    } catch (e) {
      console.error("Failed to promote character", e);
      emitToast('Failed to promote character.');
      loadCharacters(); // Revert on failure
    }
  };

  const handleDelete = async (id: string, name: string) => {
    setConfirmConfig({
      title: 'Delete Character',
      message: `Delete character "${name}"? All assigned sentences will revert to the default speaker.`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          await api.deleteCharacter(id);
          setCharacters(prev => prev.filter(c => c.id !== id));
        } catch (e) {
          console.error("Failed to delete character", e);
          emitToast('Failed to delete character.');
        }
      }
    });
  };

  return (
    <div className="animate-in" style={{ padding: '0.5rem 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <UserIcon size={20} />
            Characters & Voices
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Map character names to specific speakers. You can then assign sentences to these characters in the Production editor.
          </p>
        </div>
      </div>

      {/* Add New */}
      <div style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', borderRadius: '12px', padding: '1rem', marginBottom: '2rem' }}>
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ width: '60px' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Color
            </label>
            <ColorSwatchPicker value={newColor} onChange={setNewColor} />
          </div>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Character Name
            </label>
            <input
              type="text"
              className="input-field"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Wizard, Captain..."
              required
              style={{ width: '100%' }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.4rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              SPEAKER
            </label>
            <div className="select-wrapper">
              <VoiceProfileSelect
                value={newVoice}
                onChange={setNewVoice}
                options={availableVoices}
                defaultLabel="Unassigned (Default Speaker)"
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={!newName.trim()} title="Create Character">
            <Plus size={16} /> Add
          </button>
        </form>
      </div>

      {/* List */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>Loading characters...</div>
      ) : (
        <div style={{ display: 'grid', gap: '0.8rem' }}>
          {pinnedRow}
          {characters.length === 0 && (
            <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--surface)', borderRadius: '12px', border: '1px solid var(--border)', borderStyle: 'dashed' }}>
              <UserIcon size={28} color="var(--text-muted)" style={{ margin: '0 auto 0.75rem', opacity: 0.5 }} />
              <p style={{ color: 'var(--text-muted)' }}>No additional characters yet.</p>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', opacity: 0.8, marginTop: '0.5rem' }}>Add characters to assign specific speakers to lines of dialog.</p>
            </div>
          )}
          {characters.map(char => (
            <div key={char.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface)', padding: '0.8rem 1rem', borderRadius: '12px', border: '1px solid var(--border)' }}>

              <ColorSwatchPicker value={char.color || '#8b5cf6'} onChange={(color) => handleUpdateColor(char.id, color)} size="md" />

              {char.chapter_id && (
                <>
                  <span title="Chapter-scoped temporary character" style={{
                    fontSize: '0.65rem',
                    fontWeight: 600,
                    padding: '1px 6px',
                    borderRadius: 999,
                    background: 'var(--warning-tint-bg)',
                    border: '1px solid var(--warning-tint-border)',
                    color: 'var(--warning-text)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}>
                    temp
                  </span>
                  <button
                    onClick={() => handlePromote(char.id)}
                    className="btn-ghost"
                    style={{ fontSize: '0.7rem', padding: '2px 8px', color: 'var(--text-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}
                    title="Promote to a permanent book-level character"
                  >
                    Promote
                  </button>
                </>
              )}

              <div style={{ flex: 3 }}>
                  <input
                      key={`${char.id}-${char.name}`}
                      type="text"
                      defaultValue={char.name}
                      onBlur={(e) => { if (e.target.value !== char.name) handleUpdateName(char.id, e.target.value); }}
                      className="input-field"
                      aria-label={`Character name: ${char.name}`}
                      style={{ background: 'transparent', border: 'none', padding: 0, fontWeight: 600, fontSize: '1rem', color: 'var(--text-primary)', boxShadow: 'none', width: '100%' }}
                  />
              </div>

              <div style={{ flex: 2 }} className="select-wrapper">
                <VoiceProfileSelect
                  value={char.speaker_profile_name || ''}
                  onChange={val => handleUpdateVoice(char.id, val)}
                  options={availableVoices}
                  defaultLabel="Default Speaker"
                  style={{ width: '100%' }}
                />
              </div>

              <button
                onClick={() => setCastingCharacter(char)}
                className="btn-ghost"
                style={{ padding: '0.4rem', color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--accent)';
                  e.currentTarget.style.background = 'var(--accent-tint-bg)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Suggest voices for this character"
              >
                <Sparkles size={16} />
              </button>

              <button
                onClick={() => handleDelete(char.id, char.name)}
                className="btn-ghost"
                style={{ padding: '0.4rem', color: 'var(--text-muted)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = 'var(--error)';
                  e.currentTarget.style.background = 'var(--error-glow)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = 'var(--text-muted)';
                  e.currentTarget.style.background = 'transparent';
                }}
                title="Delete Character"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        onConfirm={() => {
          confirmConfig?.onConfirm();
          setConfirmConfig(null);
        }}
        onCancel={() => setConfirmConfig(null)}
        isDestructive={confirmConfig?.isDestructive}
        confirmText={confirmConfig?.confirmText}
      />

      <CastingSuggestionsModal
        isOpen={!!castingCharacter}
        character={castingCharacter}
        voiceMetadataList={voiceMetadataList}
        speakers={speakers}
        speakerProfiles={speakerProfiles}
        engines={engines}
        onClose={() => setCastingCharacter(null)}
        onAssign={handleAssignSuggestedVoice}
      />
    </div>
  );
};
