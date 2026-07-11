/**
 * HuggingFaceDiscover.tsx — real (non-demo) Hugging Face voice browse/import panel.
 *
 * Renders the "🤗 Discover" tab in VoicesPage: in-app search of the Hub
 * (tag: audiobook-studio-voice), an inspect/consent/import wizard, and calls
 * the real backend endpoints under /api/voices/huggingface/* via `api`
 * (frontend/src/api/index.ts). No fixture data — every list/card here comes
 * from a live network response (or a request error state).
 *
 * License is always shown before import and never blocks it — restrictive
 * licenses are flagged with a warning badge only ("warn, don't block", per
 * design-docs/plans/active/v2_huggingface_voice_interface.md §7).
 *
 * UX loosely inspired by the demo mockup
 * (frontend/src/demo/stages/siteMockup/panes/huggingFaceDiscover.tsx) but
 * that file is fixture-driven and is NOT source-of-truth code.
 */
import React, { useCallback, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Search, Download, ShieldCheck, AlertTriangle, Check, X, ExternalLink } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import type { HfSearchResult, HfVoiceCard, HfImportResult } from '@/types';
import { api } from '@/api';

// ---------------------------------------------------------------------------
// License badge — warn, never block
// ---------------------------------------------------------------------------

const LicenseBadge: React.FC<{ license?: string | null; restrictive: boolean }> = ({ license, restrictive }) => {
    if (!license) return null;
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.65rem',
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: 'var(--radius-round)',
                background: restrictive ? 'var(--warning-tint-bg)' : 'var(--success-tint-bg)',
                color: restrictive ? 'var(--warning-text)' : 'var(--success)',
                border: `1px solid ${restrictive ? 'var(--warning-tint-border)' : 'var(--success-tint-border)'}`,
            }}
        >
            {restrictive ? <AlertTriangle size={10} /> : <ShieldCheck size={10} />}
            {license}
        </span>
    );
};

// ---------------------------------------------------------------------------
// Import wizard modal — Inspect -> Consent -> Import
// ---------------------------------------------------------------------------

type WizardStep = 'loading' | 'inspect' | 'consent' | 'importing' | 'error' | 'done';

interface ImportWizardModalProps {
    hubId: string;
    onClose: () => void;
    onImported: (result: HfImportResult) => void;
}

const ImportWizardModal: React.FC<ImportWizardModalProps> = ({ hubId, onClose, onImported }) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    useFocusTrap(dialogRef, true);

    const [step, setStep] = useState<WizardStep>('loading');
    const [card, setCard] = useState<HfVoiceCard | null>(null);
    const [consentChecked, setConsentChecked] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [result, setResult] = useState<HfImportResult | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        api.inspectHfVoice(hubId)
            .then(c => {
                if (!cancelled) {
                    setCard(c);
                    setStep('inspect');
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setError(err?.message || 'Failed to fetch the Hugging Face voice card.');
                    setStep('error');
                }
            });
        return () => { cancelled = true; };
    }, [hubId]);

    const handleEscape = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
    }, [onClose]);

    const handleImport = async () => {
        setStep('importing');
        try {
            const res = await api.importHfVoice({ hubId, consent: true });
            setResult(res);
            setStep('done');
        } catch (err: any) {
            setError(err?.message || 'Import failed.');
            setStep('error');
        }
    };

    return (
        <div
            style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '2rem 1rem', overflowY: 'auto' }}
            onKeyDown={handleEscape}
        >
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
                aria-label={`Import ${hubId} from Hugging Face`}
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                    position: 'relative', width: '100%', maxWidth: '460px',
                    background: 'var(--surface)', borderRadius: '20px', boxShadow: 'var(--shadow-xl)',
                    border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.25rem 1rem', borderBottom: '1px solid var(--border)' }}>
                    <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800 }}>Import from Hugging Face</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close import dialog"
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', borderRadius: '8px' }}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {step === 'loading' && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Fetching voice card…</p>
                    )}

                    {step === 'error' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <div style={{
                                fontSize: '0.8rem', color: 'var(--error)', background: 'var(--error-tint-bg)',
                                border: '1px solid var(--error-tint-border)', borderRadius: '10px', padding: '10px 12px',
                            }}>
                                {error}
                            </div>
                            <button className="btn-glass" onClick={onClose}>Close</button>
                        </div>
                    )}

                    {step === 'inspect' && card && (
                        <>
                            <div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{card.hub_id}</div>
                                {card.author && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>by {card.author}</div>}
                            </div>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                                <LicenseBadge license={card.license} restrictive={card.is_restrictive_license} />
                                {card.languages.map(l => (
                                    <span key={l} style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 'var(--radius-round)', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                                        {l}
                                    </span>
                                ))}
                            </div>
                            {card.description && (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                                    {card.description}
                                </p>
                            )}
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                No code is run when importing a voice — only reference audio and metadata are downloaded.
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                                <button className="btn-glass" onClick={onClose}>Cancel</button>
                                <button className="btn-primary" onClick={() => setStep('consent')}>Continue</button>
                            </div>
                        </>
                    )}

                    {step === 'consent' && card && (
                        <>
                            {card.is_restrictive_license && (
                                <div style={{
                                    fontSize: '0.8rem', color: 'var(--warning-text)', background: 'var(--warning-tint-bg)',
                                    border: '1px solid var(--warning-tint-border)', borderRadius: '10px', padding: '10px 12px',
                                    display: 'flex', gap: 8, alignItems: 'flex-start',
                                }}>
                                    <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                                    <span>
                                        <strong>{card.license}</strong> restricts some uses (e.g. commercial or derivative
                                        work). Studio does not block this import — review the license and decide if it
                                        fits your project.
                                    </span>
                                </div>
                            )}
                            <div style={{
                                fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--surface-alt)',
                                border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px',
                            }}>
                                This will contact huggingface.co to download reference audio and metadata for this voice.
                            </div>
                            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: '0.8rem' }}>
                                <input
                                    type="checkbox"
                                    checked={consentChecked}
                                    onChange={e => setConsentChecked(e.target.checked)}
                                    style={{ marginTop: 3, cursor: 'pointer' }}
                                />
                                <span>
                                    I have reviewed the license and confirm I have the right to clone and use this voice.
                                    This acknowledgement is recorded with the imported voice's provenance.
                                </span>
                            </label>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
                                <button className="btn-glass" onClick={() => setStep('inspect')}>Back</button>
                                <button className="btn-primary" disabled={!consentChecked} onClick={handleImport}>
                                    Import
                                </button>
                            </div>
                        </>
                    )}

                    {step === 'importing' && (
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', padding: '1rem 0' }}>
                            Downloading reference audio and registering the voice…
                        </p>
                    )}

                    {step === 'done' && result && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '0.5rem 0' }}>
                            <div style={{
                                width: 36, height: 36, borderRadius: '50%', background: 'var(--success-tint-bg)',
                                border: '1px solid var(--success-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Check size={18} color="var(--success)" />
                            </div>
                            <span style={{ fontSize: '1rem', fontWeight: 700 }}>Voice imported</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                "{result.voice_name}" is now in My Voices. Assign an engine and build it to start using it.
                            </span>
                            <button className="btn-primary" style={{ width: '100%' }} onClick={() => onImported(result)}>
                                Done
                            </button>
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Discover panel
// ---------------------------------------------------------------------------

export const HuggingFaceDiscover: React.FC<{ onImported?: () => void }> = ({ onImported }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<HfSearchResult[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [importingHubId, setImportingHubId] = useState<string | null>(null);
    const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());

    const runSearch = useCallback(async (q?: string) => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.searchHfVoices(q);
            setResults(res);
        } catch (err: any) {
            setError(err?.message || 'Hugging Face search failed.');
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load — browse the full tag with no query.
    React.useEffect(() => {
        void runSearch();
    }, [runSearch]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {importingHubId && (
                <ImportWizardModal
                    hubId={importingHubId}
                    onClose={() => setImportingHubId(null)}
                    onImported={() => {
                        setInstalledIds(prev => new Set(prev).add(importingHubId));
                        setImportingHubId(null);
                        onImported?.();
                    }}
                />
            )}

            <form
                onSubmit={e => { e.preventDefault(); void runSearch(query.trim() || undefined); }}
                style={{ display: 'flex', gap: 8, alignItems: 'center' }}
            >
                <div style={{
                    flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                    background: 'var(--surface-alt)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-card)', padding: '6px 12px',
                }}>
                    <Search size={13} color="var(--text-muted)" />
                    <input
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        placeholder="Search voices tagged audiobook-studio-voice…"
                        aria-label="Search Hugging Face voices"
                        style={{ flex: 1, border: 'none', background: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                    />
                </div>
                <button type="submit" className="btn-primary" disabled={loading}>
                    {loading ? 'Searching…' : 'Search'}
                </button>
            </form>

            {error && (
                <div style={{
                    fontSize: '0.8rem', color: 'var(--error)', background: 'var(--error-tint-bg)',
                    border: '1px solid var(--error-tint-border)', borderRadius: '10px', padding: '10px 12px',
                }}>
                    {error}
                </div>
            )}

            {results && !error && (
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {results.length} voice{results.length === 1 ? '' : 's'} found · public search, no sign-in required
                </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(results || []).map(r => {
                    const installed = installedIds.has(r.hub_id);
                    return (
                        <div
                            key={r.hub_id}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
                            }}
                        >
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                                    <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>{r.hub_id}</span>
                                    {r.author && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>by {r.author}</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                                    {r.tags.filter(t => t !== 'audiobook-studio-voice').map(t => (
                                        <span key={t} style={{ fontSize: '0.65rem', padding: '2px 8px', borderRadius: 'var(--radius-round)', background: 'var(--surface-alt)', border: '1px solid var(--border)' }}>
                                            {t}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            {installed ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--success)' }}>
                                    <Check size={13} /> Installed
                                </span>
                            ) : (
                                <button className="btn-primary" onClick={() => setImportingHubId(r.hub_id)}>
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        <Download size={13} /> Import
                                    </span>
                                </button>
                            )}
                        </div>
                    );
                })}
                {results && results.length === 0 && !error && (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        No voices found. Try a different search.
                    </div>
                )}
            </div>

            <a
                href="https://huggingface.co/models?other=audiobook-studio-voice"
                target="_blank"
                rel="noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
                Browse the full audiobook-studio-voice tag on huggingface.co <ExternalLink size={11} />
            </a>
        </div>
    );
};
