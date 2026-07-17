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
  ArrowRight,
} from 'lucide-react';
import { Col, Row, Card, SemanticChip, Btn } from '../shared';

// ---------------------------------------------------------------------------
// Eyebrow — uppercase section label

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 'var(--type-micro)',
      fontWeight: 700,
      letterSpacing: 'var(--tracking-wide)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
    }}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Step card — numbered getting-started item

const StepCard: React.FC<{
  number: number;
  icon: React.ReactNode;
  heading: string;
  body: string;
}> = ({ number, icon, heading, body }) => (
  <Card
    interactive
    style={{
      flex: 1,
      minWidth: 0,
      padding: 'var(--space-5)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--space-3)',
    }}
  >
    <Row gap={12} style={{ alignItems: 'center' }}>
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: 'var(--radius-round)',
          background: 'var(--accent-gradient)',
          boxShadow: 'var(--accent-glow-strong)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: 'var(--type-caption)',
            fontWeight: 800,
            color: 'var(--text-on-accent)',
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
    </Row>
    <span
      style={{
        fontSize: 'var(--type-body)',
        fontWeight: 700,
        color: 'var(--text-primary)',
        lineHeight: 'var(--leading-snug)',
        letterSpacing: 'var(--tracking-tight)',
      }}
    >
      {heading}
    </span>
    <p
      style={{
        margin: 0,
        fontSize: 'var(--type-caption)',
        color: 'var(--text-secondary)',
        lineHeight: 'var(--leading-normal)',
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
    interactive
    style={{
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flex: '1 1 0',
      minWidth: 150,
    }}
  >
    <span style={{ display: 'flex', alignItems: 'center', color: 'var(--accent)', flexShrink: 0 }}>
      {icon}
    </span>
    <span
      style={{
        fontSize: 'var(--type-caption)',
        color: 'var(--text-primary)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </span>
    <ExternalLink size={12} strokeWidth={1.8} style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 'auto' }} />
  </Card>
);

// ---------------------------------------------------------------------------
// SplashPane

export const SplashPane: React.FC<{ onGetStarted: () => void }> = ({ onGetStarted }) => (
  <div
    className="ns-enter ns-splash"
    style={{
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '64px 24px 56px',
      background: 'var(--hero-glow)',
    }}
  >
    <Col
      className="ns-splash-inner"
      gap={48}
      style={{ width: '100%', maxWidth: 860 }}
    >
      {/* ── Brand hero ── */}
      <Col className="ns-splash-hero" gap={20} style={{ alignItems: 'center', textAlign: 'center' }}>
        {/* Mark — the real Audiobook Studio logo, on a soft glow halo */}
        <div
          className="ns-splash-logo"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 112,
            height: 112,
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 'var(--radius-round)',
              background: 'radial-gradient(circle, var(--accent-glow) 0%, transparent 68%)',
              filter: 'blur(6px)', /* decorative */
            }}
          />
          <img
            className="ns-splash-logo-img"
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Audiobook Studio"
            style={{ width: 100, height: 100, objectFit: 'contain', position: 'relative' }}
          />
        </div>

        <Col gap={12} style={{ alignItems: 'center' }}>
          <h1
            className="ns-splash-title"
            style={{
              margin: 0,
              fontSize: 'var(--type-display)',
              fontWeight: 'var(--type-weight-display)' as unknown as number,
              color: 'var(--text-primary)',
              lineHeight: 'var(--leading-tight)',
              letterSpacing: 'var(--tracking-display)',
            }}
          >
            Audiobook{' '}
            <span
              style={{
                background: 'var(--accent-gradient)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                color: 'var(--accent)',
              }}
            >
              Studio
            </span>
          </h1>
          <p
            className="ns-splash-subtitle"
            style={{
              margin: 0,
              fontSize: 'var(--type-headline)',
              color: 'var(--text-secondary)',
              lineHeight: 'var(--leading-normal)',
              maxWidth: 520,
              fontWeight: 400,
            }}
          >
            Everything runs on this machine. Add a voice, import a manuscript, and start rendering — the three steps below get you there.
          </p>
        </Col>

        {/* Status chips */}
        <Row className="ns-splash-chips" gap={8} style={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          <SemanticChip variant="success">Ready to go</SemanticChip>
          <SemanticChip variant="accent">Your engines, your rules</SemanticChip>
          <SemanticChip variant="neutral">Nothing leaves this machine</SemanticChip>
        </Row>

        {/* ── CTAs — directly under the hero where the eye lands ── */}
        <Row className="ns-splash-actions" gap={12} style={{ justifyContent: 'center', flexWrap: 'wrap', marginTop: 4 }}>
          <Btn
            primary
            onClick={onGetStarted}
            style={{
              fontSize: 'var(--type-body)',
              padding: '12px 28px',
              minHeight: 44,
              gap: 8,
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            Enter Library
            <ArrowRight size={16} strokeWidth={2.2} />
          </Btn>
          <Btn
            style={{ fontSize: 'var(--type-callout)', padding: '12px 22px', minHeight: 44 }}
          >
            View Documentation
          </Btn>
        </Row>
      </Col>

      {/* ── Getting started ── */}
      <Col gap={16}>
        <Eyebrow>Getting started</Eyebrow>
        <Row gap={16} className="ns-stagger" style={{ alignItems: 'stretch', flexWrap: 'wrap' }}>
          <StepCard
            number={1}
            icon={<Mic size={18} strokeWidth={2} />}
            heading="Add or choose a voice"
            body="Browse the voice library or clone a new speaker from a short audio sample. Voices are portable and work across any book."
          />
          <StepCard
            number={2}
            icon={<BookOpen size={18} strokeWidth={2} />}
            heading="Create a book and import your manuscript"
            body="Start a new project, then paste or upload chapter text. The manuscript editor keeps your source and generated audio in sync."
          />
          <StepCard
            number={3}
            icon={<Volume2 size={18} strokeWidth={2} />}
            heading="Cast characters and render to audio"
            body="Assign voices to characters in the Casting pane, then send chapters to the render queue. Studio shows live progress, segment by segment."
          />
        </Row>
      </Col>

      {/* ── Learn more / Docs ── */}
      <Col gap={16}>
        <Eyebrow>Learn more</Eyebrow>
        <Row gap={12} className="ns-stagger" style={{ flexWrap: 'wrap' }}>
          <DocCard icon={<FileText size={15} strokeWidth={1.8} />} label="Getting Started Guide" />
          <DocCard icon={<Mic size={15} strokeWidth={1.8} />} label="How voice cloning works" />
          <DocCard icon={<Puzzle size={15} strokeWidth={1.8} />} label="Plugins and engines" />
          <DocCard icon={<BookOpen size={15} strokeWidth={1.8} />} label="Read the docs" />
        </Row>
      </Col>
    </Col>
  </div>
);
