import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { GlassInput } from '@/components/forms/GlassInput';
import { VoiceProfileSelect } from '@/pages/ChapterEditor/components/VoiceProfileSelect';
import type { VoiceOption } from '@/utils/voiceProfiles';

interface TempCharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableVoices: VoiceOption[];
  onCreate: (name: string, profileName: string) => void;
}

export function TempCharacterModal({ isOpen, onClose, availableVoices, onCreate }: TempCharacterModalProps) {
  const [name, setName] = useState('');
  const [voice, setVoice] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName('');
      setVoice('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const submit = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), voice);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--overlay-backdrop)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(420px, calc(100vw - 2rem))',
          background: 'var(--surface)',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: 'var(--shadow-lg)',
          border: '1px solid var(--border)',
        }}
      >
        <h3 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '8px' }}>
          New temp character
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
          Pick a name and a voice. You can change the voice later on the Cast screen.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          <GlassInput
            autoFocus
            placeholder="e.g. Innkeeper"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) {
                submit();
              }
            }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '24px' }}>
          <label style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>
            Voice
            <VoiceProfileSelect
              value={voice}
              onChange={setVoice}
              options={availableVoices}
              defaultLabel="Use project default"
              style={{ width: '100%' }}
            />
          </label>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            type="button"
            onClick={onClose}
            className="btn-ghost"
            style={{ flex: 1, height: '44px', borderRadius: '12px' }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={submit}
            className="btn-primary"
            style={{ flex: 1, height: '44px', borderRadius: '12px' }}
          >
            Create
          </button>
        </div>
      </motion.div>
    </div>
  );
}
