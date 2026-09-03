/**
 * WelcomePage — first-entry welcome / getting-started splash.
 *
 * Rendered at route "/" inside the app shell (rail + top bar provided by the
 * shell). This component renders only the centered splash content column.
 */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Mic,
  Volume2,
  FileText,
  Puzzle,
  ExternalLink,
} from 'lucide-react';

import '@/pages/Welcome/WelcomePage.css';

// ---------------------------------------------------------------------------
// Status chip — semantically tinted inline badge

type ChipVariant = 'success' | 'accent' | 'neutral';

const chipStyles: Record<ChipVariant, React.CSSProperties> = {
  success: {
    background: 'var(--success-tint-bg)',
    border: '1px solid var(--success-color)',
    color: 'var(--success-text)',
  },
  accent: {
    background: 'var(--accent-tint-bg)',
    border: '1px solid var(--accent-tint-border)',
    color: 'var(--action-primary)',
  },
  neutral: {
    background: 'var(--surface-alt)',
    border: '1px solid var(--border)',
    color: 'var(--text-secondary)',
  },
};

const StatusChip: React.FC<{ variant: ChipVariant; children: React.ReactNode }> = ({
  variant,
  children,
}) => (
  <span className="welcome-status-chip" style={chipStyles[variant]}>
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// StepCard — numbered getting-started item

const StepCard: React.FC<{
  number: number;
  icon: React.ReactNode;
  heading: string;
  body: string;
}> = ({ number, icon, heading, body }) => (
  <div className="welcome-step-card">
    <div className="welcome-step-card__header">
      <div className="welcome-step-card__number-badge">
        <span className="welcome-step-card__number-badge-text">{number}</span>
      </div>
      <span className="text-accent" style={{ display: 'flex', alignItems: 'center' }}>
        {icon}
      </span>
      <span className="welcome-step-card__heading">{heading}</span>
    </div>
    <p className="welcome-step-card__body">{body}</p>
  </div>
);

// ---------------------------------------------------------------------------
// DocCard — muted link-style card
//
// The handbook (design-docs cross-ref: docs/handbook/) is a static GitHub
// Pages site, not served by the local app server (app/api/web.py only mounts
// /assets, /demo, /api/v1/tts) — so these are real external links, opened in
// a new tab, not in-app routes.

const HANDBOOK_BASE = 'https://senigami.github.io/audiobook-studio/handbook/';

const DocCard: React.FC<{ icon: React.ReactNode; label: string; href: string }> = ({ icon, label, href }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label} className="welcome-doc-card">
    <span className="welcome-doc-card__icon">{icon}</span>
    <span className="welcome-doc-card__label">{label}</span>
    <ExternalLink size={11} strokeWidth={1.8} className="welcome-doc-card__external-icon" />
  </a>
);

// ---------------------------------------------------------------------------
// Section label

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="label-micro-muted-strong welcome-section-label">{children}</div>
);

// ---------------------------------------------------------------------------
// WelcomePage

export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="welcome-page">
      <div className="welcome-page__container">
        {/* ── Brand hero ── */}
        <div className="welcome-hero">
          <img src="/logo.png" alt="Audiobook Studio" className="welcome-hero__logo" />

          <div className="welcome-hero__intro">
            <h1 className="welcome-hero__title">
              Audiobook{' '}
              <span className="text-accent">Studio</span>
            </h1>
            <p className="welcome-hero__subtitle">
              Everything runs on this machine. Add a voice, import a manuscript, and
              start rendering — the three steps below get you there.
            </p>
          </div>

          {/* Status chips */}
          <div className="welcome-hero__chips">
            <StatusChip variant="success">Ready to go</StatusChip>
            <StatusChip variant="accent">Your engines, your rules</StatusChip>
            <StatusChip variant="neutral">Nothing leaves this machine</StatusChip>
          </div>
        </div>

        {/* ── CTAs ── */}
        <div className="welcome-ctas">
          <button onClick={() => navigate('/library')} className="welcome-cta-primary">
            Enter Library
            <span className="welcome-cta-primary__arrow">→</span>
          </button>
          <a
            href={HANDBOOK_BASE}
            target="_blank"
            rel="noopener noreferrer"
            className="welcome-cta-secondary"
          >
            View Documentation
          </a>
        </div>

        {/* ── Getting started ── */}
        <div className="welcome-section">
          <SectionLabel>Getting started</SectionLabel>
          <div className="welcome-steps">
            <StepCard
              number={1}
              icon={<Mic size={16} strokeWidth={2} />}
              heading="Add or choose a voice"
              body="Browse the voice library or clone a new speaker from a short audio sample. Voices are portable and work across any book."
            />
            <StepCard
              number={2}
              icon={<BookOpen size={16} strokeWidth={2} />}
              heading="Create a book and import your manuscript"
              body="Start a new project, then paste or upload chapter text. The manuscript editor keeps your source and generated audio in sync."
            />
            <StepCard
              number={3}
              icon={<Volume2 size={16} strokeWidth={2} />}
              heading="Cast characters and render to audio"
              body="Assign voices to characters in the Casting pane, then send chapters to the render queue. Studio shows live progress, segment by segment."
            />
          </div>
        </div>

        {/* ── Learn more / Docs ── */}
        <div className="welcome-section">
          <SectionLabel>Learn more</SectionLabel>
          <div className="welcome-docs">
            <DocCard
              icon={<FileText size={14} strokeWidth={1.8} />}
              label="Getting Started Guide"
              href={`${HANDBOOK_BASE}#getting-started/quick-tour`}
            />
            <DocCard
              icon={<Mic size={14} strokeWidth={1.8} />}
              label="How voice cloning works"
              href={`${HANDBOOK_BASE}#concepts/voices`}
            />
            <DocCard
              icon={<Puzzle size={14} strokeWidth={1.8} />}
              label="Plugins and engines"
              href={`${HANDBOOK_BASE}#plugin-sdk/overview`}
            />
            <DocCard
              icon={<BookOpen size={14} strokeWidth={1.8} />}
              label="Read the docs"
              href={HANDBOOK_BASE}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
