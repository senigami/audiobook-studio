/**
 * MetadataEditorModal — edit voice attributes, description, tags, languages, and icon.
 *
 * Attribute vocabulary sourced from design-docs/specs/voice-taxonomy.json (taxonomy_version 2.0).
 * Fetched at build time via a static import so the UI works offline; the import comment
 * ties the bundled data to the taxonomy_version for auditors.
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, AlertCircle } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { VoiceAttributes, VoiceMetadata } from '@/types';
import { api } from '@/api';

// ---------------------------------------------------------------------------
// Taxonomy vocabulary — statically bundled from design-docs/specs/voice-taxonomy.json
// taxonomy_version "1.0". Update both this const and the source JSON when the
// taxonomy version bumps.
// ---------------------------------------------------------------------------

interface TaxonomySection {
    key: string;
    label: string;
    rule: 'one-required' | 'one-optional' | 'many-optional';
    values: Array<{ id: string; label: string }>;
}

const taxonomy: { sections: TaxonomySection[] } = {
    sections: [
        {
            key: 'class', label: 'Class', rule: 'one-required',
            values: [
                { id: 'human', label: 'Human' }, { id: 'synthetic', label: 'Synthetic / AI' },
                { id: 'creature', label: 'Creature / Monster' }, { id: 'character', label: 'Stylized Character' },
                { id: 'deity', label: 'Mythic / Narrator-God' },
            ],
        },
        {
            key: 'gender', label: 'Gender', rule: 'one-required',
            values: [
                { id: 'feminine', label: 'Feminine' }, { id: 'masculine', label: 'Masculine' },
                { id: 'neutral', label: 'Neutral / Androgynous' }, { id: 'ambiguous', label: 'Ambiguous' },
                { id: 'not-applicable', label: 'Not applicable' },
            ],
        },
        {
            key: 'age', label: 'Age', rule: 'one-required',
            values: [
                { id: 'child', label: 'Child' }, { id: 'teen', label: 'Teen' },
                { id: 'young-adult', label: 'Young adult' }, { id: 'adult', label: 'Adult' },
                { id: 'middle-aged', label: 'Middle-aged' }, { id: 'senior', label: 'Senior / Elderly' },
                { id: 'ageless', label: 'Ageless / Timeless' },
            ],
        },
        {
            key: 'accent', label: 'Accent', rule: 'one-optional',
            values: [
                { id: 'none', label: 'Neutral / None' }, { id: 'us-general', label: 'American (General)' },
                { id: 'us-southern', label: 'American (Southern)' }, { id: 'us-nyc', label: 'American (New York)' },
                { id: 'us-midwest', label: 'American (Midwest)' }, { id: 'us-african-american', label: 'American (AAVE)' },
                { id: 'british-rp', label: 'British (RP)' }, { id: 'british-cockney', label: 'British (Cockney)' },
                { id: 'british-northern', label: 'British (Northern)' }, { id: 'scottish', label: 'Scottish' },
                { id: 'irish', label: 'Irish' }, { id: 'welsh', label: 'Welsh' },
                { id: 'australian', label: 'Australian' }, { id: 'new-zealand', label: 'New Zealand' },
                { id: 'canadian', label: 'Canadian' }, { id: 'south-african', label: 'South African' },
                { id: 'indian', label: 'Indian' }, { id: 'caribbean', label: 'Caribbean' },
                { id: 'european', label: 'Continental European' }, { id: 'other', label: 'Other' },
            ],
        },
        {
            key: 'language', label: 'Language', rule: 'many-optional',
            values: [
                { id: 'english', label: 'English' }, { id: 'spanish', label: 'Spanish' },
                { id: 'french', label: 'French' }, { id: 'german', label: 'German' },
                { id: 'italian', label: 'Italian' }, { id: 'portuguese', label: 'Portuguese' },
                { id: 'polish', label: 'Polish' }, { id: 'turkish', label: 'Turkish' },
                { id: 'russian', label: 'Russian' }, { id: 'dutch', label: 'Dutch' },
                { id: 'czech', label: 'Czech' }, { id: 'arabic', label: 'Arabic' },
                { id: 'chinese', label: 'Chinese' }, { id: 'japanese', label: 'Japanese' },
                { id: 'korean', label: 'Korean' }, { id: 'hindi', label: 'Hindi' },
                { id: 'hungarian', label: 'Hungarian' }, { id: 'other', label: 'Other' },
            ],
        },
        {
            key: 'style', label: 'Style', rule: 'many-optional',
            values: [
                { id: 'conversational', label: 'Conversational' }, { id: 'narration', label: 'Narration' },
                { id: 'characters', label: 'Characters' }, { id: 'social-media', label: 'Social media' },
                { id: 'educational', label: 'Educational' }, { id: 'advertisement', label: 'Advertisement' },
                { id: 'entertainment', label: 'Entertainment' },
            ],
        },
        {
            key: 'tone', label: 'Tone', rule: 'many-optional',
            values: [
                { id: 'warm', label: 'Warm' }, { id: 'friendly', label: 'Friendly' }, { id: 'calm', label: 'Calm' },
                { id: 'soothing', label: 'Soothing' }, { id: 'cheerful', label: 'Cheerful' }, { id: 'upbeat', label: 'Upbeat' },
                { id: 'energetic', label: 'Energetic' }, { id: 'confident', label: 'Confident' },
                { id: 'authoritative', label: 'Authoritative' }, { id: 'professional', label: 'Professional' },
                { id: 'serious', label: 'Serious' }, { id: 'somber', label: 'Somber' }, { id: 'dramatic', label: 'Dramatic' },
                { id: 'intense', label: 'Intense' }, { id: 'epic', label: 'Epic' }, { id: 'mysterious', label: 'Mysterious' },
                { id: 'menacing', label: 'Menacing' }, { id: 'sinister', label: 'Sinister' }, { id: 'playful', label: 'Playful' },
                { id: 'quirky', label: 'Quirky' }, { id: 'sarcastic', label: 'Sarcastic' }, { id: 'deadpan', label: 'Deadpan' },
                { id: 'gentle', label: 'Gentle' }, { id: 'wise', label: 'Wise' }, { id: 'sensual', label: 'Sensual' },
                { id: 'melancholic', label: 'Melancholic' }, { id: 'heroic', label: 'Heroic' }, { id: 'villainous', label: 'Villainous' },
            ],
        },
        {
            key: 'timbre', label: 'Timbre', rule: 'many-optional',
            values: [
                { id: 'deep', label: 'Deep' }, { id: 'low', label: 'Low' }, { id: 'high-pitched', label: 'High-pitched' },
                { id: 'bright', label: 'Bright' }, { id: 'rich', label: 'Rich' }, { id: 'resonant', label: 'Resonant' },
                { id: 'booming', label: 'Booming' }, { id: 'smooth', label: 'Smooth' }, { id: 'velvety', label: 'Velvety' },
                { id: 'silky', label: 'Silky' }, { id: 'clear', label: 'Clear' }, { id: 'crisp', label: 'Crisp' },
                { id: 'soft', label: 'Soft' }, { id: 'breathy', label: 'Breathy' }, { id: 'husky', label: 'Husky' },
                { id: 'raspy', label: 'Raspy' }, { id: 'gravelly', label: 'Gravelly' }, { id: 'gritty', label: 'Gritty' },
                { id: 'rough', label: 'Rough' }, { id: 'nasal', label: 'Nasal' }, { id: 'thin', label: 'Thin' },
                { id: 'light', label: 'Light' }, { id: 'robotic', label: 'Robotic' }, { id: 'distorted', label: 'Distorted' },
            ],
        },
        {
            key: 'pace', label: 'Pace', rule: 'one-optional',
            values: [
                { id: 'slow', label: 'Slow' }, { id: 'measured', label: 'Measured' }, { id: 'moderate', label: 'Moderate' },
                { id: 'brisk', label: 'Brisk' }, { id: 'fast', label: 'Fast' }, { id: 'variable', label: 'Variable / Expressive' },
            ],
        },
        {
            key: 'use_case', label: 'Use case', rule: 'many-optional',
            values: [
                { id: 'audiobook', label: 'Audiobook' }, { id: 'narration', label: 'Narration' },
                { id: 'character-dialogue', label: 'Character dialogue' }, { id: 'storytelling', label: 'Storytelling' },
                { id: 'documentary', label: 'Documentary' }, { id: 'e-learning', label: 'E-learning' },
                { id: 'meditation', label: 'Meditation' }, { id: 'news', label: 'News' }, { id: 'podcast', label: 'Podcast' },
                { id: 'advertising', label: 'Advertising' }, { id: 'gaming', label: 'Gaming' },
                { id: 'animation', label: 'Animation' }, { id: 'assistant', label: 'Assistant' }, { id: 'ivr', label: 'IVR' },
            ],
        },
        {
            key: 'quality', label: 'Quality / technical', rule: 'many-optional',
            values: [
                { id: 'studio-quality', label: 'Studio quality' }, { id: 'clean', label: 'Clean' },
                { id: 'denoised', label: 'Denoised' }, { id: 'hi-fi', label: 'Hi-fi' },
                { id: 'phone-quality', label: 'Phone quality' }, { id: 'vintage', label: 'Vintage' },
                { id: 'multilingual', label: 'Multilingual' }, { id: 'expressive', label: 'Expressive' },
                { id: 'fast-inference', label: 'Fast inference' },
            ],
        },
    ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSection(key: string): TaxonomySection | undefined {
    return taxonomy.sections.find(s => s.key === key);
}

function chip(
    label: string,
    active: boolean,
    onClick: () => void,
    required?: boolean
): React.ReactNode {
    return (
        <button
            key={label}
            type="button"
            onClick={onClick}
            aria-pressed={active}
            style={{
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: '1px solid',
                borderColor: active ? 'var(--accent)' : 'var(--border)',
                background: active ? 'var(--accent)' : 'transparent',
                color: active ? 'white' : 'var(--text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                minHeight: '32px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
            }}
        >
            {label}
            {required && !active && (
                <span style={{ color: 'var(--error)', fontSize: '0.6rem', fontWeight: 900 }}>*</span>
            )}
        </button>
    );
}

// ---------------------------------------------------------------------------
// OneSelect — single-value taxonomy field
// ---------------------------------------------------------------------------
function OneSelect({
    section,
    value,
    onChange,
}: {
    section: TaxonomySection;
    value: string | undefined;
    onChange: (v: string | undefined) => void;
}) {
    const isRequired = section.rule === 'one-required';
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {section.label.toUpperCase()}
                {isRequired && <span style={{ color: 'var(--error)', marginLeft: '2px' }}>*</span>}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {section.values.map(opt =>
                    chip(opt.label, value === opt.id, () => onChange(value === opt.id && !isRequired ? undefined : opt.id), isRequired)
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// ManySelect — multi-value taxonomy field
// ---------------------------------------------------------------------------
function ManySelect({
    section,
    value,
    onChange,
}: {
    section: TaxonomySection;
    value: string[] | undefined;
    onChange: (v: string[]) => void;
}) {
    const selected = value || [];
    const toggle = (id: string) => {
        if (selected.includes(id)) {
            onChange(selected.filter(x => x !== id));
        } else {
            onChange([...selected, id]);
        }
    };
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                {section.label.toUpperCase()}
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {section.values.map(opt =>
                    chip(opt.label, selected.includes(opt.id), () => toggle(opt.id))
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// TagsInput — free-form lowercase-hyphenated tags
// ---------------------------------------------------------------------------
function TagsInput({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
    const [draft, setDraft] = useState('');

    const commit = () => {
        const cleaned = draft.trim().toLowerCase().replace(/\s+/g, '-');
        if (cleaned && !tags.includes(cleaned)) {
            onChange([...tags, cleaned]);
        }
        setDraft('');
    };

    const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit();
        } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                FREE TAGS
            </label>
            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '6px',
                padding: '8px',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                background: 'var(--surface-dim)',
                minHeight: '44px',
                alignItems: 'center',
            }}>
                {tags.map(t => (
                    <span
                        key={t}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '2px 10px',
                            borderRadius: '999px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            background: 'var(--accent-tint-bg)',
                            color: 'var(--accent)',
                            border: '1px solid var(--accent)',
                        }}
                    >
                        {t}
                        <button
                            type="button"
                            onClick={() => onChange(tags.filter(x => x !== t))}
                            aria-label={`Remove tag ${t}`}
                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontSize: '0.85rem' }}
                        >
                            ×
                        </button>
                    </span>
                ))}
                <input
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onKeyDown={handleKey}
                    onBlur={commit}
                    placeholder={tags.length === 0 ? 'cowboy, wizard, grandmother...' : ''}
                    aria-label="Add free tag"
                    style={{
                        border: 'none',
                        outline: 'none',
                        background: 'transparent',
                        fontSize: '0.8rem',
                        color: 'var(--text-primary)',
                        minWidth: '120px',
                        flex: 1,
                    }}
                />
            </div>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                Enter or comma to add. Lowercase, hyphen-separated.
            </p>
        </div>
    );
}

// ---------------------------------------------------------------------------
// IconUpload
// ---------------------------------------------------------------------------
function IconUpload({
    voiceId,
    currentImagePath,
    onSuccess,
    onError,
}: {
    voiceId: string;
    currentImagePath: string | undefined;
    onSuccess: (image: string) => void;
    onError: (msg: string) => void;
}) {
    const [uploading, setUploading] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const result = await api.uploadVoiceIcon(voiceId, file);
            onSuccess(result.image);
        } catch (err: any) {
            // Surface 422 message verbatim
            onError(err.message || 'Upload failed');
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const iconUrl = currentImagePath
        ? `/api/voices/${encodeURIComponent(voiceId)}/icon`
        : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.04em' }}>
                ICON
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                    width: '64px',
                    height: '64px',
                    borderRadius: '12px',
                    border: '1px solid var(--border)',
                    background: 'var(--surface-dim)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    flexShrink: 0,
                }}>
                    {iconUrl ? (
                        <img src={iconUrl} alt="Voice icon" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                        <Upload size={24} style={{ color: 'var(--text-muted)' }} />
                    )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <button
                        type="button"
                        disabled={uploading}
                        onClick={() => inputRef.current?.click()}
                        className="btn-glass"
                        style={{ height: '36px', padding: '0 14px', fontSize: '0.8rem', fontWeight: 700 }}
                    >
                        {uploading ? 'Uploading…' : (iconUrl ? 'Replace icon' : 'Upload icon')}
                    </button>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                        Square image required (1:1). PNG, JPEG, or WebP.
                    </p>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        aria-label="Upload voice icon"
                        style={{ display: 'none' }}
                        onChange={handle}
                    />
                </div>
            </div>
        </div>
    );
}

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
