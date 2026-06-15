/**
 * siteMockup/panes/splash.tsx — First-entry welcome / getting-started splash pane.
 *
 * Shown on initial load. Cleared by sidebar nav, opening a book, or pressing
 * "Enter Library →". Logo in TopBar navigates back here.
 */
import React from 'react';
import {
  BookOpen,
  Mic,
  Volume2,
  FileText,
  Puzzle,
  ExternalLink,
} from 'lucide-react';
import { Col, Row, Card, SemanticChip, Btn } from '../shared';

// ---------------------------------------------------------------------------
// Step card — numbered getting-started item

const StepCard: React.FC<{
  number: number;
  icon: React.ReactNode;
  heading: string;
  body: string;
}> = ({ number, icon, heading, body }) => (
  <Card
    style={{
      flex: 1,
      minWidth: 0,
      padding: '18px 18px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
    }}
  >
    <Row gap={10} style={{ alignItems: 'center' }}>
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
    </Row>
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
  </Card>
);

// ---------------------------------------------------------------------------
// Doc link card — muted link-style card

const DocCard: React.FC<{
  icon: React.ReactNode;
  label: string;
}> = ({ icon, label }) => (
  <Card
    style={{
      padding: '10px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      cursor: 'pointer',
      flex: '1 1 0',
      minWidth: 120,
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', flexShrink: 0 }}>
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
    <ExternalLink size={11} strokeWidth={1.8} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }} />
  </Card>
);

// ---------------------------------------------------------------------------
// SplashPane

export const SplashPane: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => (
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
    <Col
      gap={36}
      style={{ width: '100%', maxWidth: 840 }}
    >
      {/* ── Brand hero ── */}
      <Col gap={16} style={{ alignItems: 'center', textAlign: 'center' }}>
        {/* Mark — the real Audiobook Studio logo */}
        <img
          src={`${import.meta.env.BASE_URL}logo.png`}
          alt="Audiobook Studio"
          style={{ width: 96, height: 96, objectFit: 'contain' }}
        />

        <Col gap={6} style={{ alignItems: 'center' }}>
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
            Professional AI voice generation for creators and authors. Local-first, plugin-powered, and built for the long run.
          </p>
        </Col>

        {/* Status chips */}
        <Row gap={8} style={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <SemanticChip variant="success">Ready</SemanticChip>
          <SemanticChip variant="accent">Plugin-powered TTS</SemanticChip>
          <SemanticChip variant="neutral">Local-first</SemanticChip>
        </Row>
      </Col>

      {/* ── Getting started ── */}
      <Col gap={14}>
        <div
          style={{
            fontSize: 'var(--type-micro)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Getting started
        </div>
        <Row gap={12} style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
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
        </Row>
      </Col>

      {/* ── Learn more / Docs ── */}
      <Col gap={14}>
        <div
          style={{
            fontSize: 'var(--type-micro)',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          Learn more
        </div>
        <Row gap={8} style={{ flexWrap: 'wrap' }}>
          <DocCard icon={<FileText size={14} strokeWidth={1.8} />} label="Getting Started Guide" />
          <DocCard icon={<Mic size={14} strokeWidth={1.8} />} label="How voice cloning works" />
          <DocCard icon={<Puzzle size={14} strokeWidth={1.8} />} label="Plugins and engines" />
          <DocCard icon={<BookOpen size={14} strokeWidth={1.8} />} label="Read the docs" />
        </Row>
      </Col>

      {/* ── CTAs ── */}
      <Row gap={10} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
        <Btn
          primary
          onClick={onGetStarted}
          style={{ fontSize: 'var(--type-body)', padding: '8px 28px', gap: 8, display: 'inline-flex', alignItems: 'center' }}
        >
          Enter Library
          <span style={{ fontSize: 'var(--type-caption)', opacity: 0.8 }}>→</span>
        </Btn>
        <Btn
          style={{ fontSize: 'var(--type-callout)', padding: '8px 20px' }}
        >
          View Documentation
        </Btn>
      </Row>
    </Col>
  </div>
);
