/**
 * CastingSuggestionsModal — "Suggest voices for this character".
 *
 * Calls POST /api/voices/cast (design-docs/specs/voice-bundles.md §9, cast_voices()
 * in app/domain/voices/metadata.py) to get ranked voice recommendations for a
 * character, and lets the user confirm one. Selecting a suggestion routes through
 * the caller's existing voice-assignment mutation (onAssign) — this component
 * NEVER assigns a voice on its own.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle, Sparkles, Check } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { api } from '@/api';
import type { Character, CastingRecommendation, Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';
import { buildCastingCatalog, characterToCastingBrief, resolveCastingVoiceIdToProfileName } from '@/utils/voiceCasting';

export interface CastingSuggestionsModalProps {
  isOpen: boolean;
  character: Character | null;
  voiceMetadataList: VoiceMetadata[];
  speakers: Speaker[];
  speakerProfiles: SpeakerProfile[];
  engines?: TtsEngine[];
  onClose: () => void;
  /** Confirm+assign a suggestion — the caller wires this to the existing real assignment mutation. */
  onAssign: (characterId: string, speakerProfileName: string) => void;
}

export const CastingSuggestionsModal: React.FC<CastingSuggestionsModalProps> = ({
  isOpen,
  character,
  voiceMetadataList,
  speakers,
  speakerProfiles,
  engines,
  onClose,
  onAssign,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, isOpen);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<CastingRecommendation[]>([]);
  const [needsInput, setNeedsInput] = useState(false);
  const [assignedVoiceId, setAssignedVoiceId] = useState<string | null>(null);

  const handleEscape = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen || !character) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setRecommendations([]);
    setNeedsInput(false);
    setAssignedVoiceId(null);

    api.castVoices({
      character: characterToCastingBrief(character),
      catalog: buildCastingCatalog(voiceMetadataList),
    })
      .then(result => {
        if (cancelled) return;
        setRecommendations(result.recommendations);
        setNeedsInput(result.needs_input);
      })
      .catch((err: any) => {
        if (cancelled) return;
        // Surfaces the 422 (unknown contract_version/card_version major) message verbatim.
        setError(err.message || 'Could not get voice suggestions.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isOpen, character, voiceMetadataList]);

  const handleSelect = (voiceId: string) => {
    if (!character) return;
    const profileName = resolveCastingVoiceIdToProfileName(voiceId, voiceMetadataList, speakers, speakerProfiles, engines);
    if (!profileName) {
      setError('That voice is no longer available to assign.');
      return;
    }
    onAssign(character.id, profileName);
    setAssignedVoiceId(voiceId);
  };

  if (!character) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}
          onKeyDown={handleEscape}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            style={{ position: 'fixed', inset: 0, background: 'var(--overlay-backdrop)', backdropFilter: 'blur(8px)' }}
          />

          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="casting-suggestions-title"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: '520px',
              background: 'var(--surface)',
              borderRadius: '20px',
              boxShadow: 'var(--shadow-xl)',
              border: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 id="casting-suggestions-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={18} style={{ color: 'var(--accent)' }} />
                  Suggest voices
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {character.name}
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close dialog"
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '10px', minWidth: '44px', minHeight: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
              {loading && (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ranking voices…</p>
              )}

              {!loading && error && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px', borderRadius: '10px', background: 'var(--error-tint-bg)', color: 'var(--error)', fontSize: '0.8rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
                </div>
              )}

              {!loading && !error && recommendations.length === 0 && (
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                  No voices in the catalog could be scored for this character yet. Add or tag some voices in the Voice Lab, then try again.
                </p>
              )}

              {!loading && !error && needsInput && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 12px', borderRadius: '10px', background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)', color: 'var(--warning-text)', fontSize: '0.8rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>
                    Not enough eligible voices to rank with confidence yet — add more voices to the catalog, or give
                    "{character.name}" a fuller description for better matches. Showing what's available below.
                  </span>
                </div>
              )}

              {!loading && !error && recommendations.map(rec => {
                const meta = voiceMetadataList.find(v => v.id === rec.voice_id);
                const isAssigned = assignedVoiceId === rec.voice_id;
                return (
                  <div
                    key={rec.voice_id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      borderRadius: '12px',
                      border: `1px solid ${isAssigned ? 'var(--accent)' : 'var(--border)'}`,
                      background: isAssigned ? 'var(--accent-tint-bg)' : 'var(--surface-dim)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{meta?.name || rec.voice_id}</span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>
                          {Math.round(rec.score * 100)}% match
                        </span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {rec.reason}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSelect(rec.voice_id)}
                      disabled={isAssigned}
                      className={isAssigned ? 'btn-ghost' : 'btn-primary'}
                      style={{ height: '36px', padding: '0 14px', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      {isAssigned ? (<><Check size={14} /> Assigned</>) : 'Use this voice'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
              <button type="button" onClick={onClose} className="btn-ghost" style={{ height: '44px', padding: '0 20px', borderRadius: '12px' }}>
                {assignedVoiceId ? 'Done' : 'Cancel'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
