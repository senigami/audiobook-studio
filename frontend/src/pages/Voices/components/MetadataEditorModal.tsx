/**
 * MetadataEditorModal — edit voice attributes, description, tags, languages, and icon.
 *
 * Attribute vocabulary sourced from design-docs/specs/voice-taxonomy.json (taxonomy_version 2.0).
 * Fetched at build time via a static import so the UI works offline; the import comment
 * ties the bundled data to the taxonomy_version for auditors.
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertCircle } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { VoiceAttributes, VoiceMetadata } from '@/types';
import { api } from '@/api';
import { getSection } from './metadata/taxonomy';
import { OneSelect } from './metadata/OneSelect';
import { ManySelect } from './metadata/ManySelect';
import { TagsInput } from './metadata/TagsInput';
import { IconUpload } from './metadata/IconUpload';

// ---------------------------------------------------------------------------
// Main modal
// ---------------------------------------------------------------------------

export interface MetadataEditorModalProps {
    isOpen: boolean;
    voice: VoiceMetadata | null;
    onClose: () => void;
    onSaved: (updated: VoiceMetadata) => void;
}

export const MetadataEditorModal: React.FC<MetadataEditorModalProps> = ({
    isOpen,
    voice,
    onClose,
    onSaved,
}) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, isOpen);

    // Local draft state — reset when voice changes
    const [attrs, setAttrs] = useState<VoiceAttributes>(voice?.attributes || {});
    const [tags, setTags] = useState<string[]>(voice?.tags || []);
    const [description, setDescription] = useState(voice?.description || '');
    const [languages, setLanguages] = useState<string>((voice?.languages || []).join(', '));
    const [iconPath, setIconPath] = useState(voice?.image);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [iconError, setIconError] = useState<string | null>(null);

    // Sync when voice prop changes (new voice opened)
    React.useEffect(() => {
        setAttrs(voice?.attributes || {});
        setTags(voice?.tags || []);
        setDescription(voice?.description || '');
        setLanguages((voice?.languages || []).join(', '));
        setIconPath(voice?.image);
        setError(null);
        setIconError(null);
    }, [voice?.id]);

    const setAttr = useCallback((key: keyof VoiceAttributes, val: any) => {
        setAttrs(prev => ({ ...prev, [key]: val }));
    }, []);

    const handleEscape = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    const handleSave = async () => {
        if (!voice) return;
        setSaving(true);
        setError(null);
        try {
            const patch = {
                description: description.trim() || undefined,
                attributes: Object.keys(attrs).length > 0 ? attrs : undefined,
                tags: tags.length > 0 ? tags : undefined,
                languages: languages
                    .split(',')
                    .map(l => l.trim())
                    .filter(Boolean),
            };
            const updated = await api.patchVoiceMetadata(voice.id, patch);
            onSaved(updated);
            onClose();
        } catch (err: any) {
            // Surface 422 verbatim per spec
            setError(err.message || 'Save failed');
        } finally {
            setSaving(false);
        }
    };

    const requiredMissing =
        !attrs.class || !attrs.gender || !attrs.age;

    if (!voice) return null;

    const oneFields: Array<keyof VoiceAttributes> = ['class', 'gender', 'age', 'accent', 'pace'];
    const manyFields: Array<keyof VoiceAttributes> = ['language', 'style', 'tone', 'timbre', 'use_case', 'quality'];

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
                        aria-labelledby="metadata-editor-title"
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        style={{
                            position: 'relative',
                            width: '100%',
                            maxWidth: '640px',
                            background: 'var(--surface)',
                            borderRadius: '20px',
                            boxShadow: 'var(--shadow-xl)',
                            border: '1px solid var(--border)',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0',
                            marginTop: '0',
                        }}
                    >
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.5rem 1.5rem 1rem', borderBottom: '1px solid var(--border)' }}>
                            <div>
                                <h2 id="metadata-editor-title" style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>
                                    Edit voice metadata
                                </h2>
                                <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {voice.name}
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
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '1.5rem', overflowY: 'auto', maxHeight: 'calc(100vh - 200px)' }}>

                            {/* Icon upload */}
                            <IconUpload
                                voiceId={voice.id}
                                currentImagePath={iconPath}
                                onSuccess={(img) => setIconPath(img)}
                                onError={(msg) => setIconError(msg)}
                            />
                            {iconError && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', borderRadius: '10px', background: 'var(--error-tint-bg)', color: 'var(--error)', fontSize: '0.8rem' }}>
                                    <AlertCircle size={16} />
                                    {iconError}
                                </div>
                            )}

                            {/* Description */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="voice-description" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                    DESCRIPTION
                                </label>
                                <textarea
                                    id="voice-description"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="1-3 sentences describing this voice..."
                                    rows={3}
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-dim)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        resize: 'vertical',
                                        fontFamily: 'inherit',
                                    }}
                                />
                            </div>

                            {/* Languages */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <label htmlFor="voice-languages" style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                                    LANGUAGES (BCP-47, comma-separated)
                                </label>
                                <input
                                    id="voice-languages"
                                    type="text"
                                    value={languages}
                                    onChange={e => setLanguages(e.target.value)}
                                    placeholder="en-US, fr-FR..."
                                    style={{
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        border: '1px solid var(--border)',
                                        background: 'var(--surface-dim)',
                                        color: 'var(--text-primary)',
                                        fontSize: '0.85rem',
                                        minHeight: '44px',
                                    }}
                                />
                            </div>

                            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 700, letterSpacing: '0.04em' }}>
                                ATTRIBUTES <span style={{ color: 'var(--error)' }}>*</span> required fields
                            </p>

                            {/* One-value fields */}
                            {oneFields.map(key => {
                                const section = getSection(key);
                                if (!section) return null;
                                return (
                                    <OneSelect
                                        key={key}
                                        section={section}
                                        value={(attrs as any)[key]}
                                        onChange={val => setAttr(key, val)}
                                    />
                                );
                            })}

                            {/* Many-value fields */}
                            {manyFields.map(key => {
                                const section = getSection(key);
                                if (!section) return null;
                                return (
                                    <ManySelect
                                        key={key}
                                        section={section}
                                        value={(attrs as any)[key]}
                                        onChange={val => setAttr(key, val)}
                                    />
                                );
                            })}

                            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

                            {/* Free tags */}
                            <TagsInput tags={tags} onChange={setTags} />

                            {/* 422 error */}
                            {error && (
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '12px', borderRadius: '10px', background: 'var(--error-tint-bg)', color: 'var(--error)', fontSize: '0.8rem' }}>
                                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <span style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                            {requiredMissing && (
                                <span style={{ fontSize: '0.75rem', color: 'var(--warning-text)', alignSelf: 'center', marginRight: 'auto' }}>
                                    Class, Gender, and Age are required to save.
                                </span>
                            )}
                            <button type="button" onClick={onClose} className="btn-ghost" style={{ height: '44px', padding: '0 20px', borderRadius: '12px' }}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || requiredMissing}
                                className="btn-primary"
                                style={{ height: '44px', padding: '0 24px', borderRadius: '12px', opacity: (saving || requiredMissing) ? 0.5 : 1 }}
                            >
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
};
