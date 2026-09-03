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
                    className="metadata-editor-modal__overlay"
                    onKeyDown={handleEscape}
                >
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        aria-hidden="true"
                        className="metadata-editor-modal__backdrop"
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
                        className="metadata-editor-modal__dialog"
                    >
                        {/* Header */}
                        <div className="metadata-editor-modal__header">
                            <div>
                                <h2 id="metadata-editor-title" className="metadata-editor-modal__title">
                                    Edit voice metadata
                                </h2>
                                <p className="metadata-editor-modal__subtitle">
                                    {voice.name}
                                </p>
                            </div>
                            <button
                                onClick={onClose}
                                aria-label="Close dialog"
                                className="metadata-editor-modal__close-btn"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="metadata-editor-modal__body">

                            {/* Icon upload */}
                            <IconUpload
                                voiceId={voice.id}
                                currentImagePath={iconPath}
                                onSuccess={(img) => setIconPath(img)}
                                onError={(msg) => setIconError(msg)}
                            />
                            {iconError && (
                                <div className="metadata-editor-modal__icon-error">
                                    <AlertCircle size={16} />
                                    {iconError}
                                </div>
                            )}

                            {/* Description */}
                            <div className="metadata-field">
                                <label htmlFor="voice-description" className="metadata-field-label">
                                    DESCRIPTION
                                </label>
                                <textarea
                                    id="voice-description"
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    placeholder="1-3 sentences describing this voice..."
                                    rows={3}
                                    className="metadata-field-input"
                                    style={{ resize: 'vertical', fontFamily: 'inherit' }}
                                />
                            </div>

                            {/* Languages */}
                            <div className="metadata-field">
                                <label htmlFor="voice-languages" className="metadata-field-label">
                                    LANGUAGES (BCP-47, comma-separated)
                                </label>
                                <input
                                    id="voice-languages"
                                    type="text"
                                    value={languages}
                                    onChange={e => setLanguages(e.target.value)}
                                    placeholder="en-US, fr-FR..."
                                    className="metadata-field-input"
                                    style={{ minHeight: '44px' }}
                                />
                            </div>

                            <hr className="metadata-editor-modal__divider" />
                            <p className="metadata-field-label" style={{ margin: 0 }}>
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

                            <hr className="metadata-editor-modal__divider" />

                            {/* Free tags */}
                            <TagsInput tags={tags} onChange={setTags} />

                            {/* 422 error */}
                            {error && (
                                <div className="metadata-editor-modal__error-banner">
                                    <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                                    <span style={{ whiteSpace: 'pre-wrap' }}>{error}</span>
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="metadata-editor-modal__footer">
                            {requiredMissing && (
                                <span className="metadata-editor-modal__required-warning">
                                    Class, Gender, and Age are required to save.
                                </span>
                            )}
                            <button type="button" onClick={onClose} className="btn-ghost metadata-editor-modal__action-btn" style={{ padding: '0 20px' }}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || requiredMissing}
                                className="btn-primary metadata-editor-modal__action-btn"
                                style={{ padding: '0 var(--space-5)', opacity: (saving || requiredMissing) ? 0.5 : 1 }}
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
