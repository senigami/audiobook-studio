/**
 * siteMockup/panes/huggingFaceDiscover.tsx — Hugging Face voice browse/import mockup
 *
 * Represents the vision from design-docs/plans/active/v2_huggingface_voice_interface.md:
 *   Search/browse (tag: audiobook-studio-voice) → Inspect card (title, author,
 *   license, languages, sample, description) → Consent gate (cloning-rights
 *   acknowledgement, recorded into provenance) → Import (download + register or
 *   pull reference audio) → Build (runs the clone pipeline) → Annotate (metadata
 *   pre-filled from the HF card, user-editable).
 *
 * License is always shown before import and never blocks it — restrictive
 * licenses are flagged with a warning badge only ("warn, don't block").
 * This is a presentational mockup: all network/import/build steps are timed
 * fake-progress state machines, matching the rest of the demo's conventions.
 */
import React, { useState, useEffect } from 'react';
import {
  Search,
  Download,
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
  Check,
  ChevronRight,
  X,
  Globe2,
  Play,
} from 'lucide-react';
import {
  Row,
  Col,
  Card,
  Btn,
  SemanticChip,
  ProgressBar,
  Chip,
} from '../shared';
import { VoicePortrait } from './voicePortrait';
import type { Voice } from './voices';

// ---------------------------------------------------------------------------
// Types + fixture data

export type HfLicense = 'cc-by-4.0' | 'cc-by-nc-4.0' | 'cc0-1.0' | 'openrail-m';

export interface HfVoiceCard {
  hubId: string;
  title: string;
  author: string;
  license: HfLicense;
  languages: string[];
  description: string;
  downloads: number;
  updated: string;
  /** Loosely reuses the demo's voice-portrait heuristics for a representative avatar. */
  previewVoice: Voice;
}

const LICENSE_LABEL: Record<HfLicense, string> = {
  'cc-by-4.0': 'CC BY 4.0',
  'cc-by-nc-4.0': 'CC BY-NC 4.0',
  'cc0-1.0': 'CC0 1.0 (Public Domain)',
  'openrail-m': 'OpenRAIL-M',
};

/** Licenses that restrict commercial/derivative use — flagged, never blocked. */
const RESTRICTIVE_LICENSES = new Set<HfLicense>(['cc-by-nc-4.0', 'openrail-m']);

const HF_VOICE_CARDS: HfVoiceCard[] = [
  {
    hubId: 'openvoices/warden-baritone',
    title: 'Warden Baritone',
    author: 'openvoices',
    license: 'cc-by-4.0',
    languages: ['English'],
    description: 'A resonant, low-register male voice trained on public-domain audiobook narration. Reads well for fantasy and historical fiction.',
    downloads: 4820,
    updated: '3 weeks ago',
    previewVoice: { name: 'Warden Baritone', description: '', pills: [
      { label: 'Character', category: 'class' }, { label: 'Male', category: 'gender' }, { label: 'Senior', category: 'age' }, { label: 'Gruff', category: 'extended' },
    ], cta: 'Preview voice', portrait: true, category: 'Character', gender: 'Male', age: 'Senior', styles: ['Gruff'] },
  },
  {
    hubId: 'narration-collective/soft-reader-fr',
    title: 'Soft Reader (FR)',
    author: 'narration-collective',
    license: 'cc0-1.0',
    languages: ['French'],
    description: 'Gentle French-language narrator voice built from community-donated audiobook samples. Public domain — no restrictions on use.',
    downloads: 1290,
    updated: '2 months ago',
    previewVoice: { name: 'Soft Reader (FR)', description: '', pills: [
      { label: 'Narrator', category: 'class' }, { label: 'Female', category: 'gender' }, { label: 'Adult', category: 'age' }, { label: 'Warm', category: 'extended' },
    ], cta: 'Preview voice', portrait: true, category: 'Narrator', gender: 'Female', age: 'Adult', styles: ['Warm'] },
  },
  {
    hubId: 'synthlab/announcer-x',
    title: 'Announcer X',
    author: 'synthlab',
    license: 'openrail-m',
    languages: ['English', 'German'],
    description: 'High-energy trailer/announcer preset with a synthetic edge. Model use restricted under OpenRAIL-M — review use-based restrictions before commercial release.',
    downloads: 9110,
    updated: '5 days ago',
    previewVoice: { name: 'Announcer X', description: '', pills: [
      { label: 'Character', category: 'class' }, { label: 'Male', category: 'gender' }, { label: 'Adult', category: 'age' }, { label: 'Deep', category: 'extended' },
    ], cta: 'Preview voice', portrait: true, category: 'Character', gender: 'Male', age: 'Adult', styles: ['Deep'] },
  },
  {
    hubId: 'quiet-fields/childrens-tale',
    title: "Children's Tale",
    author: 'quiet-fields',
    license: 'cc-by-nc-4.0',
    languages: ['English'],
    description: 'Bright, playful voice tuned for children\'s stories and picture-book narration. Non-commercial license — flagged for review before publishing paid work.',
    downloads: 640,
    updated: '4 months ago',
    previewVoice: { name: "Children's Tale", description: '', pills: [
      { label: 'Dialogue', category: 'class' }, { label: 'Female', category: 'gender' }, { label: 'Adult', category: 'age' }, { label: 'Bright', category: 'extended' },
    ], cta: 'Preview voice', portrait: true, category: 'Dialogue', gender: 'Female', age: 'Adult', styles: ['Bright'] },
  },
];

// ---------------------------------------------------------------------------
// License badge — warn, never block

const LicenseBadge: React.FC<{ license: HfLicense }> = ({ license }) => {
  const restrictive = RESTRICTIVE_LICENSES.has(license);
  return (
    <SemanticChip variant={restrictive ? 'warning' : 'success'}>
      <Row gap={3} style={{ alignItems: 'center' }}>
        {restrictive ? <AlertTriangle size={9} /> : <ShieldCheck size={9} />}
        {LICENSE_LABEL[license]}
      </Row>
    </SemanticChip>
  );
};

// ---------------------------------------------------------------------------
// Import wizard — Inspect → Consent → Import → Build → Annotate

type WizardStep = 'inspect' | 'consent' | 'importing' | 'building' | 'annotate' | 'done';

const ImportWizardModal: React.FC<{
  card: HfVoiceCard;
  onClose: () => void;
  onComplete: (name: string) => void;
}> = ({ card, onClose, onComplete }) => {
  const [step, setStep] = useState<WizardStep>('inspect');
  const [consentChecked, setConsentChecked] = useState(false);
  const [progress, setProgress] = useState(0);
  const [voiceName, setVoiceName] = useState(card.title);
  const [description, setDescription] = useState(card.description);

  const restrictive = RESTRICTIVE_LICENSES.has(card.license);

  useEffect(() => {
    if (step !== 'importing' && step !== 'building') return;
    setProgress(0);
    const iv = setInterval(() => {
      setProgress(p => {
        if (p >= 100) {
          clearInterval(iv);
          setStep(step === 'importing' ? 'building' : 'annotate');
          return 0;
        }
        return Math.min(100, p + 14);
      });
    }, 160);
    return () => clearInterval(iv);
  }, [step]);

  const stepIndex = (['inspect', 'consent', 'importing', 'building', 'annotate'] as WizardStep[]).indexOf(step);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Import ${card.title} from Hugging Face`}
      style={{
        position: 'fixed', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--surface)', border: 'var(--hairline)', borderRadius: 'var(--radius-panel)',
        width: 420, maxHeight: '90%', overflowY: 'auto', boxShadow: 'var(--shadow-xl)', padding: 'var(--space-4)',
      }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
            Import from Hugging Face
          </span>
          <button onClick={onClose} aria-label="Close import dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={15} />
          </button>
        </Row>

        {/* Step progress dots */}
        {step !== 'done' && (
          <Row gap={4} style={{ marginBottom: 'var(--space-4)' }}>
            {['Inspect', 'Consent', 'Import', 'Build', 'Annotate'].map((label, i) => (
              <div key={label} style={{ flex: 1, textAlign: 'center' }}>
                <div style={{
                  height: 3, borderRadius: 2, marginBottom: 4,
                  background: i <= stepIndex ? 'var(--action-primary)' : 'var(--border)',
                }} />
                <span style={{ fontSize: '0.6rem', color: i <= stepIndex ? 'var(--action-primary)' : 'var(--text-muted)', fontWeight: i === stepIndex ? 700 : 400 }}>
                  {label}
                </span>
              </div>
            ))}
          </Row>
        )}

        {step === 'inspect' && (
          <Col gap={10}>
            <Row gap={10} style={{ alignItems: 'center' }}>
              <VoicePortrait voice={card.previewVoice} size={56} />
              <Col gap={3} style={{ flex: 1 }}>
                <span style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>{card.title}</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{card.hubId}</span>
              </Col>
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <LicenseBadge license={card.license} />
              {card.languages.map(l => <Chip key={l}>{l}</Chip>)}
            </Row>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-normal)' }}>
              {card.description}
            </div>
            <Btn small aria-label={`Preview ${card.title}`} style={{ alignSelf: 'flex-start' }}>
              <Row gap={4} style={{ alignItems: 'center' }}><Play size={10} /> Preview sample</Row>
            </Btn>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No code is run when importing a voice — only reference audio and metadata are downloaded.
            </div>
            <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
              <Btn small onClick={onClose}>Cancel</Btn>
              <Btn small primary onClick={() => setStep('consent')}>Continue</Btn>
            </Row>
          </Col>
        )}

        {step === 'consent' && (
          <Col gap={10}>
            {restrictive && (
              <div style={{
                fontSize: 'var(--type-caption)', color: 'var(--warning-text)',
                background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
                borderRadius: 'var(--radius-card)', padding: 'var(--space-2) var(--space-3)',
                display: 'flex', gap: 6, alignItems: 'flex-start', lineHeight: 'var(--leading-snug)',
              }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>
                  <strong>{LICENSE_LABEL[card.license]}</strong> restricts some uses (e.g. commercial or
                  derivative work). Studio does not block this import — review the license terms and
                  decide if it fits your project.
                </span>
              </div>
            )}
            <div style={{
              fontSize: 'var(--type-micro)', color: 'var(--text-muted)',
              background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-card)',
              padding: 'var(--space-2) var(--space-3)', display: 'flex', gap: 6, alignItems: 'flex-start',
            }}>
              <Globe2 size={12} style={{ flexShrink: 0, marginTop: 1 }} />
              This will contact huggingface.co to download reference audio and metadata for this voice.
            </div>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={e => setConsentChecked(e.target.checked)}
                style={{ marginTop: 3, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', lineHeight: 'var(--leading-snug)' }}>
                I have reviewed the license and confirm I have the right to clone and use this voice.
                This acknowledgement is recorded with the imported voice's provenance.
              </span>
            </label>
            <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
              <Btn small onClick={() => setStep('inspect')}>Back</Btn>
              <Btn small primary disabled={!consentChecked} onClick={() => setStep('importing')}>
                Import
              </Btn>
            </Row>
          </Col>
        )}

        {step === 'importing' && (
          <Col gap={10} style={{ alignItems: 'center', padding: 'var(--space-3) 0' }}>
            <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
              Downloading reference audio and voice.json from Hugging Face…
            </span>
            <div style={{ width: '100%' }}><ProgressBar pct={progress} height={6} shimmer /></div>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{progress}%</span>
          </Col>
        )}

        {step === 'building' && (
          <Col gap={10} style={{ alignItems: 'center', padding: 'var(--space-3) 0' }}>
            <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
              Building local voice asset with the primary engine…
            </span>
            <div style={{ width: '100%' }}><ProgressBar pct={progress} height={6} shimmer /></div>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{progress}%</span>
          </Col>
        )}

        {step === 'annotate' && (
          <Col gap={10}>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
              Metadata pre-filled from the Hugging Face card — edit before adding to your library.
            </div>
            <Col gap={4}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-secondary)' }}>Name</div>
              <input
                value={voiceName}
                onChange={e => setVoiceName(e.target.value)}
                style={{
                  background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                  padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
                }}
              />
            </Col>
            <Col gap={4}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-secondary)' }}>Description</div>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
                style={{
                  background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                  padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%', resize: 'vertical',
                }}
              />
            </Col>
            <div style={{
              fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontFamily: 'monospace',
              background: 'var(--surface-alt)', borderRadius: 'var(--radius-button)', padding: 'var(--space-1) var(--space-2)',
            }}>
              provenance.source = imported · author = {card.author} · consent_ack = true
            </div>
            <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
              <Btn small primary onClick={() => setStep('done')}>Add to library</Btn>
            </Row>
          </Col>
        )}

        {step === 'done' && (
          <Col gap={12} style={{ alignItems: 'center', padding: 'var(--space-3) 0' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: 'var(--success-tint-bg)',
              border: '1px solid var(--success-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={20} color="var(--success)" />
            </div>
            <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)' }}>Voice imported</span>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', textAlign: 'center' }}>
              "{voiceName}" is now in My Voices, ready to cast.
            </span>
            <Btn primary style={{ width: '100%' }} onClick={() => onComplete(voiceName)}>Done</Btn>
          </Col>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Upload-to-HF flow (Voices tab action) — export loose files + auto-tag

export const UploadToHfModal: React.FC<{
  voiceName: string;
  onClose: () => void;
}> = ({ voiceName, onClose }) => {
  const [step, setStep] = useState<'form' | 'uploading' | 'done'>('form');
  const [repoName, setRepoName] = useState(voiceName.toLowerCase().replace(/\s+/g, '-'));
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [progress, setProgress] = useState(0);
  const hasToken = true; // demo: token already configured in Settings

  useEffect(() => {
    if (step !== 'uploading') return;
    setProgress(0);
    const iv = setInterval(() => {
      setProgress(p => {
        if (p >= 100) { clearInterval(iv); setStep('done'); return 100; }
        return Math.min(100, p + 12);
      });
    }, 150);
    return () => clearInterval(iv);
  }, [step]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Upload ${voiceName} to Hugging Face`}
      style={{
        position: 'fixed', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--surface)', border: 'var(--hairline)', borderRadius: 'var(--radius-panel)',
        width: 360, boxShadow: 'var(--shadow-xl)', padding: 'var(--space-4)',
      }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
            Publish to Hugging Face
          </span>
          <button onClick={onClose} aria-label="Close upload dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={15} />
          </button>
        </Row>

        {step === 'form' && (
          <Col gap={10}>
            {!hasToken ? (
              <div style={{
                fontSize: 'var(--type-caption)', color: 'var(--warning-text)',
                background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
                borderRadius: 'var(--radius-card)', padding: 'var(--space-2) var(--space-3)',
              }}>
                Add a Hugging Face access token in Settings → Integrations to publish voices.
              </div>
            ) : (
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                Uploading pushes loose files (voice.json, samples/preview.mp3) to your Hugging Face
                repo and tags it <code style={{ fontFamily: 'monospace' }}>audiobook-studio-voice</code> automatically.
              </div>
            )}
            <Col gap={4}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-secondary)' }}>Repository name</div>
              <input
                value={repoName}
                onChange={e => setRepoName(e.target.value)}
                style={{
                  background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                  padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%', fontFamily: 'monospace',
                }}
              />
            </Col>
            <Row gap={6}>
              {(['public', 'private'] as const).map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  style={{
                    flex: 1, padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)',
                    borderRadius: 'var(--radius-button)', cursor: 'pointer', fontFamily: 'inherit',
                    border: `1px solid ${visibility === v ? 'var(--action-primary)' : 'var(--border)'}`,
                    background: visibility === v ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                    color: visibility === v ? 'var(--action-primary)' : 'var(--text-secondary)',
                    textTransform: 'capitalize',
                  }}
                >
                  {v}
                </button>
              ))}
            </Row>
            <Row gap={4} style={{ flexWrap: 'wrap' }}>
              {['audiobook-studio-voice', 'as-narrator', 'as-english'].map(tag => (
                <Chip key={tag}>{tag}</Chip>
              ))}
            </Row>
            <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
              <Btn small onClick={onClose}>Cancel</Btn>
              <Btn small primary disabled={!hasToken || !repoName.trim()} onClick={() => setStep('uploading')}>
                Publish
              </Btn>
            </Row>
          </Col>
        )}

        {step === 'uploading' && (
          <Col gap={10} style={{ alignItems: 'center', padding: 'var(--space-3) 0' }}>
            <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>Uploading to huggingface.co/{repoName}…</span>
            <div style={{ width: '100%' }}><ProgressBar pct={progress} height={6} shimmer /></div>
          </Col>
        )}

        {step === 'done' && (
          <Col gap={12} style={{ alignItems: 'center', padding: 'var(--space-3) 0' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%', background: 'var(--success-tint-bg)',
              border: '1px solid var(--success-tint-border)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Check size={20} color="var(--success)" />
            </div>
            <a
              href={`https://huggingface.co/${repoName}`}
              target="_blank" rel="noreferrer"
              style={{ fontSize: 'var(--type-caption)', color: 'var(--action-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              huggingface.co/{repoName} <ExternalLink size={11} />
            </a>
            <Btn primary style={{ width: '100%' }} onClick={onClose}>Done</Btn>
          </Col>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Discover pane — replaces the old thin DISCOVER_CARDS grid

export const HuggingFaceDiscoverPane: React.FC = () => {
  const [importingCard, setImportingCard] = useState<HfVoiceCard | null>(null);
  const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
  const [browseMode, setBrowseMode] = useState<'search' | 'paste'>('search');
  const [pasteUrl, setPasteUrl] = useState('');

  return (
    <Col gap={12}>
      {importingCard && (
        <ImportWizardModal
          card={importingCard}
          onClose={() => setImportingCard(null)}
          onComplete={() => {
            setInstalledIds(prev => new Set(prev).add(importingCard.hubId));
            setImportingCard(null);
          }}
        />
      )}

      <Row gap={8} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{
          display: 'inline-flex', border: 'var(--hairline)', borderRadius: 'var(--radius-round)',
          overflow: 'hidden', background: 'var(--surface-alt)', flexShrink: 0,
        }}>
          {(['search', 'paste'] as const).map((m, i) => (
            <button
              key={m}
              type="button"
              onClick={() => setBrowseMode(m)}
              style={{
                fontSize: 'var(--type-micro)', fontWeight: 600, padding: 'var(--space-1) var(--space-3)',
                cursor: 'pointer', border: 0, borderRight: i === 0 ? 'var(--hairline)' : 'none',
                background: browseMode === m ? 'var(--accent-tint-bg)' : 'transparent',
                color: browseMode === m ? 'var(--action-primary)' : 'var(--text-secondary)', fontFamily: 'inherit',
              }}
            >
              {m === 'search' ? 'Browse Hugging Face' : 'Paste a Hub URL'}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          {browseMode === 'search' ? 'in-app browse — the target experience' : 'fallback path for a specific voice repo'}
        </span>
      </Row>

      {browseMode === 'paste' ? (
        <Card style={{ padding: 'var(--space-4)' }}>
          <Col gap={8}>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
              Paste a Hugging Face repo ID or URL to import a single voice directly.
            </div>
            <Row gap={6}>
              <input
                value={pasteUrl}
                onChange={e => setPasteUrl(e.target.value)}
                placeholder="e.g. openvoices/warden-baritone"
                style={{
                  flex: 1, background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                  padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', fontFamily: 'monospace',
                }}
              />
              <Btn small primary disabled={!pasteUrl.trim()} onClick={() => setImportingCard(HF_VOICE_CARDS[0])}>
                Fetch
              </Btn>
            </Row>
          </Col>
        </Card>
      ) : (
        <>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-alt)', border: 'var(--hairline)',
              borderRadius: 'var(--radius-card)', padding: 'var(--space-1) var(--space-3)',
            }}>
              <Search size={12} color="var(--text-muted)" />
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                Search voices tagged audiobook-studio-voice…
              </span>
            </div>
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <Chip>English</Chip>
            <Chip>French</Chip>
            <Chip>CC0 / CC-BY only</Chip>
            <Chip>+ Filter</Chip>
          </Row>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
            {HF_VOICE_CARDS.length} voices found · public search, no sign-in required
          </div>

          <Col gap={8}>
            {HF_VOICE_CARDS.map(card => {
              const installed = installedIds.has(card.hubId);
              return (
                <Card key={card.hubId} style={{ padding: 'var(--space-3)' }}>
                  <Row gap={10} style={{ alignItems: 'flex-start' }}>
                    <VoicePortrait voice={card.previewVoice} size={44} />
                    <Col gap={4} style={{ flex: 1, minWidth: 0 }}>
                      <Row gap={6} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>{card.title}</span>
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>by {card.author}</span>
                      </Row>
                      <Row gap={5} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <LicenseBadge license={card.license} />
                        {card.languages.map(l => <Chip key={l}>{l}</Chip>)}
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                          ↓ {card.downloads.toLocaleString()} · updated {card.updated}
                        </span>
                      </Row>
                      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-snug)' }}>
                        {card.description}
                      </div>
                    </Col>
                    <Col gap={5} style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                      <Btn small aria-label={`Preview ${card.title}`}>
                        <Row gap={3} style={{ alignItems: 'center' }}><Play size={9} /> Preview</Row>
                      </Btn>
                      {installed ? (
                        <SemanticChip variant="success"><Row gap={3} style={{ alignItems: 'center' }}><Check size={9} /> Installed</Row></SemanticChip>
                      ) : (
                        <Btn small primary onClick={() => setImportingCard(card)}>
                          <Row gap={3} style={{ alignItems: 'center' }}><Download size={9} /> Import</Row>
                        </Btn>
                      )}
                    </Col>
                  </Row>
                </Card>
              );
            })}
          </Col>
        </>
      )}

      <a
        href="https://huggingface.co/models?other=audiobook-studio-voice"
        target="_blank" rel="noreferrer"
        style={{ fontSize: 'var(--type-micro)', color: 'var(--action-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}
      >
        Browse the full audiobook-studio-voice tag on huggingface.co <ExternalLink size={10} /> <ChevronRight size={10} />
      </a>
    </Col>
  );
};
