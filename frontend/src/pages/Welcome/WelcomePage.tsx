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
    color: 'var(--accent)',
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
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      padding: '3px 10px',
      borderRadius: 'var(--radius-round)',
      fontSize: 'var(--type-micro)',
      fontWeight: 600,
      lineHeight: 1.4,
      ...chipStyles[variant],
    }}
  >
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
  <div
    style={{
      flex: 1,
      minWidth: 0,
      padding: '18px 18px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-sm)',
    }}
  >
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-round)',
          background: 'var(--accent-tint-bg)',
          border: '1px solid var(--accent-tint-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--type-micro)',
            fontWeight: 800,
            color: 'var(--accent)',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {number}
        </span>
      </div>
      <span style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)' }}>
        {icon}
      </span>
      <span
        style={{
          fontSize: 'var(--type-callout)',
          fontWeight: 700,
          color: 'var(--text-primary)',
          lineHeight: 1.3,
        }}
      >
        {heading}
      </span>
    </div>
    <p
      style={{
        margin: 0,
        fontSize: 'var(--type-caption)',
        color: 'var(--text-secondary)',
        lineHeight: 1.55,
      }}
    >
      {body}
    </p>
  </div>
);

// ---------------------------------------------------------------------------
// DocCard — muted link-style card

const DocCard: React.FC<{ icon: React.ReactNode; label: string }> = ({ icon, label }) => (
  <a
    href="#"
    aria-label={label}
    style={{
      flex: '1 1 0',
      minWidth: 120,
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-sm)',
      textDecoration: 'none',
    }}
  >
    <span
      style={{
        display: 'flex',
        alignItems: 'center',
        color: 'var(--text-muted)',
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
    <span
      style={{
        fontSize: 'var(--type-caption)',
        color: 'var(--text-secondary)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
    <ExternalLink
      size={11}
      strokeWidth={1.8}
      style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }}
    />
  </a>
);

// ---------------------------------------------------------------------------
// Section label

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 'var(--type-micro)',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
    }}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// WelcomePage

export const WelcomePage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '40px 24px 48px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 840,
          display: 'flex',
          flexDirection: 'column',
          gap: 36,
        }}
      >
        {/* ── Brand hero ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 16,
          }}
        >
          <img
            src="/logo.png"
            alt="Audiobook Studio"
            style={{ width: 96, height: 96, objectFit: 'contain' }}
          />

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <h1
              style={{
                margin: 0,
                fontSize: 'var(--type-title)',
                fontWeight: 800,
                color: 'var(--text-primary)',
                lineHeight: 1.15,
                letterSpacing: '-0.02em',
              }}
            >
              Audiobook{' '}
              <span style={{ color: 'var(--accent)' }}>Studio</span>
            </h1>
            <p
              style={{
                margin: 0,
                fontSize: 'var(--type-body)',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
                maxWidth: 480,
              }}
            >
              Professional AI voice generation for creators and authors. Local-first,
              plugin-powered, and built for the long run.
            </p>
          </div>

          {/* Status chips */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 8,
              alignItems: 'center',
              flexWrap: 'wrap',
              justifyContent: 'center',
            }}
          >
            <StatusChip variant="success">Ready</StatusChip>
            <StatusChip variant="accent">Plugin-powered TTS</StatusChip>
            <StatusChip variant="neutral">Local-first</StatusChip>
          </div>
        </div>

        {/* ── Getting started ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SectionLabel>Getting started</SectionLabel>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              gap: 12,
              alignItems: 'stretch',
              flexWrap: 'wrap',
            }}
          >
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <SectionLabel>Learn more</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <DocCard icon={<FileText size={14} strokeWidth={1.8} />} label="Getting Started Guide" />
            <DocCard icon={<Mic size={14} strokeWidth={1.8} />} label="How voice cloning works" />
            <DocCard icon={<Puzzle size={14} strokeWidth={1.8} />} label="Plugins and engines" />
            <DocCard icon={<BookOpen size={14} strokeWidth={1.8} />} label="Read the docs" />
          </div>
        </div>

        {/* ── CTAs ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 10,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={() => navigate('/library')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 28px',
              background: 'var(--accent)',
              color: 'var(--text-on-accent)',
              border: 'none',
              borderRadius: 'var(--radius-button)',
              fontSize: 'var(--type-body)',
              fontWeight: 600,
              cursor: 'pointer',
              lineHeight: 1.4,
            }}
          >
            Enter Library
            <span style={{ fontSize: 'var(--type-caption)', opacity: 0.8 }}>→</span>
          </button>
          <a
            href="#"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '8px 20px',
              background: 'var(--surface-alt)',
              color: 'var(--text-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-button)',
              fontSize: 'var(--type-callout)',
              fontWeight: 600,
              cursor: 'pointer',
              textDecoration: 'none',
              lineHeight: 1.4,
            }}
          >
            View Documentation
          </a>
        </div>
      </div>
    </div>
  );
};
