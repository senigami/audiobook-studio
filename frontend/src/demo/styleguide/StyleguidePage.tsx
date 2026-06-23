/**
 * StyleguidePage — design spec sheet for Audiobook Studio.
 *
 * A storybook-like page laying out the design system: tokens, type rules,
 * component states, and PROPOSED design directions for owner review.
 *
 * Sections:
 *   1. Color tokens (auto-generated from tokens.css — zero drift)
 *   2. Typography — shipped type/space/motion tokens (auto-parsed from tokens.css)
 *   3. Components — current states (live-mounted)
 *   4. Proposed directions (U1, U8, U15, U16 mockup gallery)
 *   5. Theme side-by-side
 */

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import tokensCss from '@/theme/tokens.css?raw';
import { parseTokens, groupTokens, type TokenEntry } from './parseTokens';
import { AudioLines, Play, SkipBack, SkipForward, Rewind, FastForward } from 'lucide-react';
import { GlassInput } from '@/components/forms/GlassInput';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { StatusOrb } from '@/components/ui/StatusOrb';
import type { Chapter, Job } from '@/types';

// ---------------------------------------------------------------------------
// Scroll-spy hook
// ---------------------------------------------------------------------------

function useActiveSection(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-20% 0px -70% 0px', threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [key]);
  return active;
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const SECTION_IDS = {
  colors: 'sg-colors',
  typography: 'sg-typography',
  components: 'sg-components',
  proposals: 'sg-proposals',
  theme: 'sg-theme',
} as const;

const SECTION_LABELS: Record<keyof typeof SECTION_IDS, string> = {
  colors: '1. Color Tokens',
  typography: '2. Typography',
  components: '3. Components',
  proposals: '4. Proposed Directions',
  theme: '5. Theme Side-by-Side',
};

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------

const SectionWrapper: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({
  id, title, children,
}) => (
  <section
    id={id}
    style={{
      marginBottom: '3rem',
      scrollMarginTop: '56px',
    }}
  >
    <h2
      style={{
        fontSize: '1.25rem',
        fontWeight: 700,
        color: 'var(--text-primary)',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
        borderBottom: '2px solid var(--border)',
      }}
    >
      {title}
    </h2>
    {children}
  </section>
);

const SubSection: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div style={{ marginBottom: '1.5rem' }}>
    <h3
      style={{
        fontWeight: 600,
        color: 'var(--text-secondary)',
        marginBottom: '0.75rem',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        fontSize: '0.75rem',
      }}
    >
      {title}
    </h3>
    {children}
  </div>
);

const ProposedChip: React.FC = () => (
  <span
    style={{
      display: 'inline-block',
      background: 'rgba(245, 158, 11, 0.15)',
      color: 'var(--warning-text, #92400e)',
      border: '1px solid rgba(245, 158, 11, 0.35)',
      borderRadius: 999,
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      padding: '2px 10px',
      verticalAlign: 'middle',
      marginLeft: 8,
    }}
  >
    PROPOSED
  </span>
);

const OwnerDecisionChip: React.FC = () => (
  <span
    style={{
      display: 'inline-block',
      background: 'rgba(239, 68, 68, 0.1)',
      color: 'var(--error-text, #991b1b)',
      border: '1px solid rgba(239, 68, 68, 0.25)',
      borderRadius: 999,
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      padding: '2px 10px',
      verticalAlign: 'middle',
      marginLeft: 8,
    }}
  >
    OWNER DECISION NEEDED
  </span>
);

/** Green status chip for proposals the owner has ratified (affirmed / approved / decided). */
const DecidedChip: React.FC<{ label?: string }> = ({ label = 'AFFIRMED' }) => (
  <span
    style={{
      display: 'inline-block',
      background: 'rgba(34, 197, 94, 0.14)',
      color: 'var(--success-text, #166534)',
      border: '1px solid rgba(34, 197, 94, 0.32)',
      borderRadius: 999,
      fontSize: '0.6875rem',
      fontWeight: 700,
      letterSpacing: '0.07em',
      textTransform: 'uppercase',
      padding: '2px 10px',
      verticalAlign: 'middle',
      marginLeft: 8,
    }}
  >
    {label}
  </span>
);

const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children, style,
}) => (
  <div
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card, 12px)',
      padding: '1.25rem',
      ...style,
    }}
  >
    {children}
  </div>
);

const SpecimenCard: React.FC<{
  label: string;
  caption?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ label, caption, children, style }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      ...style,
    }}
  >
    <div
      style={{
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 60,
      }}
    >
      {children}
    </div>
    <div>
      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label}
      </div>
      {caption && (
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 2 }}>
          {caption}
        </div>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Section 1: Color tokens
// ---------------------------------------------------------------------------

/** Detect if a CSS value looks like a color (not a shadow, var ref, px value, etc.) */
function isColorValue(value: string): boolean {
  const v = value.trim();
  if (v.startsWith('#')) return true;
  if (/^rgba?\s*\(/.test(v)) return true;
  if (/^hsl/.test(v)) return true;
  if (v === 'transparent' || v === 'inherit') return true;
  return false;
}

function isShadowValue(value: string): boolean {
  return /\d+px/.test(value) && !value.startsWith('#') && !value.startsWith('rgba');
}

function isRadiusValue(name: string): boolean {
  return name.includes('radius');
}

const GROUP_LABELS: Record<string, string> = {
  surface: 'Surfaces',
  bg: 'Backgrounds',
  background: 'Backgrounds (alias)',
  text: 'Text',
  accent: 'Accent / Brand Blue',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
  glass: 'Glass',
  border: 'Borders',
  shadow: 'Shadows',
  progress: 'Progress Bars',
  radius: 'Radius',
  overlay: 'Overlay',
  cloud: 'Cloud Engine',
  as: 'Brand (AS)',
  header: 'Header',
  misc: 'Miscellaneous',
};

const ColorSwatch: React.FC<{ value: string; theme: 'light' | 'dark'; name: string }> = ({
  value, theme, name,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {/* Paint the parsed literal value, NOT var(--name): a CSS variable would
          resolve against the page's ACTIVE theme, so the "light" column would
          show dark values whenever the page itself is in dark mode. */}
      <div
        title={`${name} (${theme}): ${value}`}
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: '1px solid rgba(0,0,0,0.12)',
          background: value,
          flexShrink: 0,
        }}
      />
      <div
        style={{
          fontSize: '0.6875rem',
          color: theme === 'dark' ? '#9ca3af' : 'var(--text-muted)',
          maxWidth: 80,
          textAlign: 'center',
          wordBreak: 'break-all',
        }}
      >
        {value.length > 22 ? value.slice(0, 22) + '…' : value}
      </div>
    </div>
  );
};

const TokenRow: React.FC<{ entry: TokenEntry }> = ({ entry }) => {
  const isColor = isColorValue(entry.lightValue) || isColorValue(entry.darkValue);
  const isShadow = isShadowValue(entry.lightValue);
  const isRadius = isRadiusValue(entry.name);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '220px 1fr 80px 80px',
        gap: 8,
        alignItems: 'center',
        padding: '6px 4px',
        borderBottom: '1px solid var(--border)',
        fontSize: '0.75rem',
      }}
    >
      <code
        style={{
          fontFamily: 'monospace',
          color: 'var(--text-primary)',
          fontSize: '0.6875rem',
          wordBreak: 'break-all',
        }}
      >
        {entry.name}
      </code>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', wordBreak: 'break-word' }}>
        {entry.comment || (entry.lightValue.length > 40 ? entry.lightValue.slice(0, 40) + '…' : entry.lightValue)}
      </div>
      {/* Light swatch */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {isColor ? (
          <ColorSwatch value={entry.lightValue} theme="light" name={entry.name} />
        ) : isShadow ? (
          <div
            style={{
              width: 36,
              height: 20,
              borderRadius: 6,
              background: 'var(--surface)',
              boxShadow: entry.lightValue,
              border: '1px solid var(--border)',
            }}
          />
        ) : isRadius ? (
          <div
            style={{
              width: 36,
              height: 36,
              background: 'var(--accent)',
              borderRadius: entry.lightValue,
              opacity: 0.7,
            }}
          />
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontStyle: 'italic' }}>
            {entry.lightValue.slice(0, 18)}
          </span>
        )}
      </div>
      {/* Dark swatch */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {entry.darkValue && isColor ? (
          <ColorSwatch value={entry.darkValue} theme="dark" name={entry.name} />
        ) : entry.darkValue && isShadow ? (
          <div data-theme="dark" style={{ background: '#0f1117', padding: 4, borderRadius: 6 }}>
            <div
              style={{
                width: 36,
                height: 20,
                borderRadius: 6,
                background: 'var(--surface)',
                boxShadow: entry.darkValue,
              }}
            />
          </div>
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontStyle: 'italic' }}>
            {entry.darkValue ? 'see dark' : '—'}
          </span>
        )}
      </div>
    </div>
  );
};

const ColorTokensSection: React.FC<{ entries: TokenEntry[] }> = ({ entries }) => {
  const groups = useMemo(() => groupTokens(entries), [entries]);

  return (
    <SectionWrapper id={SECTION_IDS.colors} title={SECTION_LABELS.colors}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Auto-generated from <code>tokens.css</code> — light and dark values shown side-by-side.
        Swatches use CSS variables directly so they stay in sync with the source file.
      </p>
      {/* Column header */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '220px 1fr 80px 80px',
          gap: 8,
          padding: '4px 4px',
          marginBottom: 4,
          fontSize: '0.6875rem',
          fontWeight: 700,
          color: 'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
        }}
      >
        <span>Token</span>
        <span>Comment / Value</span>
        <span style={{ textAlign: 'center' }}>Light</span>
        <span style={{ textAlign: 'center' }}>Dark</span>
      </div>
      {Array.from(groups.entries()).map(([group, groupEntries]) => (
        <div key={group} style={{ marginBottom: '1.5rem' }}>
          <div
            style={{
              fontSize: '0.75rem',
              fontWeight: 700,
              color: 'var(--accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: 4,
              marginTop: 12,
            }}
          >
            {GROUP_LABELS[group] ?? group}
          </div>
          {groupEntries.map(entry => (
            <TokenRow key={entry.name} entry={entry} />
          ))}
        </div>
      ))}
    </SectionWrapper>
  );
};

// ---------------------------------------------------------------------------
// Section 2: Typography
// ---------------------------------------------------------------------------

/**
 * Metadata for the shipped 9-step type scale.
 * Weight token name is null when tokens.css ships no --type-weight-* for that step.
 */
const TYPE_SCALE_META: Array<{
  sizeToken: string;
  weightToken: string | null;
  label: string;
  usage: string;
}> = [
  { sizeToken: '--type-display',     weightToken: '--type-weight-display',  label: 'Display',     usage: 'Splash / large hero moments' },
  { sizeToken: '--type-large-title', weightToken: null,                      label: 'Large Title', usage: 'Page greeting, section heroes (no weight token)' },
  { sizeToken: '--type-title',       weightToken: '--type-weight-title',    label: 'Title',       usage: 'Page headings, modal titles' },
  { sizeToken: '--type-headline',    weightToken: '--type-weight-headline', label: 'Headline',    usage: 'Section headings, panel headers, chapter names' },
  { sizeToken: '--type-reading',     weightToken: null,                      label: 'Reading',     usage: 'Long-form manuscript / script body (no weight token)' },
  { sizeToken: '--type-body',        weightToken: '--type-weight-body',     label: 'Body',        usage: 'Primary readable text — descriptions, list items' },
  { sizeToken: '--type-callout',     weightToken: null,                      label: 'Callout',     usage: 'Secondary info, sub-labels, form hints (no weight token)' },
  { sizeToken: '--type-caption',     weightToken: '--type-weight-caption',  label: 'Caption',     usage: 'Timestamps, IDs, table cell text, badges' },
  { sizeToken: '--type-micro',       weightToken: '--type-weight-micro',    label: 'Micro',       usage: 'All-caps labels, status chips, keyboard shortcuts' },
];

const SPACE_SCALE_META: Array<{ token: string; px: string; label: string }> = [
  { token: '--space-1', px: '4px',  label: 'icon gaps, tight row padding' },
  { token: '--space-2', px: '8px',  label: 'within-component padding' },
  { token: '--space-3', px: '12px', label: 'button padding, card inner gap' },
  { token: '--space-4', px: '16px', label: 'standard section padding' },
  { token: '--space-5', px: '24px', label: 'panel padding, section gaps' },
  { token: '--space-6', px: '32px', label: 'major section gaps' },
  { token: '--space-7', px: '40px', label: 'large layout spacing' },
  { token: '--space-8', px: '48px', label: 'page-level gutters' },
];

const MOTION_SCALE_META: Array<{ token: string; usage: string }> = [
  { token: '--dur-fast',        usage: 'Hover state appearance, focus ring, simple color transitions (0.14s)' },
  { token: '--dur-med',         usage: 'Standard UI transitions — panels sliding, cards expanding (0.24s)' },
  { token: '--dur-slow',        usage: 'Page-level route transitions, overlay enter/exit (0.4s)' },
  { token: '--ease-standard',   usage: 'Default easing for most transitions' },
  { token: '--ease-emphasized', usage: 'Emphasized motion — important state changes' },
  { token: '--ease-spring',     usage: 'Springy entrance effects, delight moments' },
];

interface TypographySectionProps {
  allTokens: TokenEntry[];
}

const TypographySection: React.FC<TypographySectionProps> = ({ allTokens }) => {
  // Build a lookup map from token name → lightValue for live values
  const tokenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const entry of allTokens) {
      m.set(entry.name, entry.lightValue);
    }
    return m;
  }, [allTokens]);

  return (
    <SectionWrapper id={SECTION_IDS.typography} title={SECTION_LABELS.typography}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Auto-parsed from <code>tokens.css</code> — values shown are live from the shipped file.
        Body font: <strong>Inter</strong> (self-hosted).
      </p>

      {/* 2a. Type scale */}
      <SubSection title="Type scale (--type-*)">
        {/* Column header */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '160px 80px 80px 1fr',
            gap: 16,
            padding: '4px 0',
            marginBottom: 4,
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.07em',
          }}
        >
          <span>Token</span>
          <span>Size</span>
          <span>Weight</span>
          <span>Specimen</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {TYPE_SCALE_META.map(({ sizeToken, weightToken, label, usage }) => {
            const sizeVal  = tokenMap.get(sizeToken)  ?? sizeToken;
            const weightVal = weightToken ? (tokenMap.get(weightToken) ?? '') : '';
            const weightNum = weightVal ? parseInt(weightVal, 10) : undefined;
            return (
              <div
                key={sizeToken}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '160px 80px 80px 1fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <code style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontFamily: 'monospace' }}>
                  {sizeToken}
                </code>
                <code style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {sizeVal}
                </code>
                <code style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                  {weightToken
                    ? <>{weightVal}</>
                    : <span style={{ fontStyle: 'italic', color: 'var(--text-muted)', opacity: 0.7 }}>—</span>
                  }
                </code>
                <div>
                  <span
                    style={{
                      fontSize: `var(${sizeToken})`,
                      fontWeight: weightNum,
                      color: 'var(--text-primary)',
                      lineHeight: 1.2,
                    }}
                  >
                    {label}
                  </span>
                  <span style={{ marginLeft: 12, fontSize: '0.6875rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    {usage}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </SubSection>

      {/* 2b. Spacing scale */}
      <SubSection title="Spacing scale (--space-*)">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {SPACE_SCALE_META.map(({ token, px, label }) => {
            const liveVal = tokenMap.get(token) ?? px;
            return (
              <div key={token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: liveVal,
                    height: 32,
                    background: 'var(--accent)',
                    opacity: 0.7,
                    borderRadius: 3,
                    minWidth: 4,
                  }}
                />
                <code style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontFamily: 'monospace' }}>
                  {token}
                </code>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{liveVal}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', maxWidth: 80, textAlign: 'center' }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </SubSection>

      {/* 2c. Motion tokens */}
      <SubSection title="Motion tokens (--dur-* / --ease-*)">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MOTION_SCALE_META.map(({ token, usage }) => {
            const liveVal = tokenMap.get(token) ?? '';
            return (
              <div
                key={token}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '200px 1fr',
                  gap: 16,
                  alignItems: 'center',
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <code style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontFamily: 'monospace' }}>
                    {token}
                  </code>
                  <code style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                    {liveVal}
                  </code>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{usage}</span>
              </div>
            );
          })}
        </div>
      </SubSection>
    </SectionWrapper>
  );
};

// ---------------------------------------------------------------------------
// Section 3: Components
// ---------------------------------------------------------------------------

const ButtonSpecimens: React.FC = () => (
  <SubSection title="Buttons">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
      <SpecimenCard label=".btn-primary" caption="Rest state; hover darkens, :disabled dims">
        <button className="btn-primary" type="button" style={{ fontSize: '0.875rem' }}>
          Primary
        </button>
      </SpecimenCard>
      <SpecimenCard label=".btn-primary :disabled" caption="Reduced opacity">
        <button className="btn-primary" type="button" disabled style={{ fontSize: '0.875rem' }}>
          Disabled
        </button>
      </SpecimenCard>
      <SpecimenCard label=".btn-ghost" caption="Transparent bg, accent text on hover">
        <button className="btn-ghost" type="button" style={{ fontSize: '0.875rem' }}>
          Ghost
        </button>
      </SpecimenCard>
      <SpecimenCard label=".btn-ghost :disabled">
        <button className="btn-ghost" type="button" disabled style={{ fontSize: '0.875rem' }}>
          Ghost Disabled
        </button>
      </SpecimenCard>
      <SpecimenCard label=".btn-glass" caption="Glassmorphism surface">
        <button className="btn-glass" type="button" style={{ fontSize: '0.875rem' }}>
          Glass
        </button>
      </SpecimenCard>
      <SpecimenCard label=".btn-success" caption="Green fill">
        <button className="btn-success" type="button" style={{ fontSize: '0.875rem' }}>
          Success
        </button>
      </SpecimenCard>
      <SpecimenCard label=".btn-danger" caption="Red fill">
        <button className="btn-danger" type="button" style={{ fontSize: '0.875rem' }}>
          Danger
        </button>
      </SpecimenCard>
      <SpecimenCard label=".btn-home" caption="Hero CTA — uses !important (Q5 pending)">
        <button className="btn-home" type="button" style={{ fontSize: '0.875rem' }}>
          Home CTA
        </button>
      </SpecimenCard>
    </div>
  </SubSection>
);

const InputSpecimens: React.FC = () => (
  <SubSection title="GlassInput">
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
      <SpecimenCard label="Empty" caption="No value, placeholder visible">
        <GlassInput placeholder="Placeholder text…" />
      </SpecimenCard>
      <SpecimenCard label="Filled" caption="Has value">
        <GlassInput defaultValue="My audiobook project" />
      </SpecimenCard>
      <SpecimenCard label="Disabled" caption="opacity-dimmed, non-interactive">
        <GlassInput defaultValue="Can't edit this" disabled />
      </SpecimenCard>
    </div>
  </SubSection>
);

const ProgressSpecimens: React.FC = () => (
  <SubSection title="PredictiveProgressBar">
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <SpecimenCard label="Preparing — 0%" caption="Indeterminate preparing state">
        <div style={{ width: '100%' }}>
          <PredictiveProgressBar
            progress={0}
            status="preparing"
            showEta={false}
            showPercent
            showLabel
            label="Rendering chapter audio"
            allowBackwardProgress={false}
          />
        </div>
      </SpecimenCard>
      <SpecimenCard label="Running — 45% with ETA" caption="Live render in progress">
        <div style={{ width: '100%' }}>
          <PredictiveProgressBar
            progress={0.45}
            status="running"
            showEta
            showPercent
            showLabel
            label="Rendering chapter audio"
            etaSeconds={62}
            updatedAt={Date.now()}
            allowBackwardProgress={false}
          />
        </div>
      </SpecimenCard>
      <SpecimenCard label="Done — 100%" caption="Terminal success state">
        <div style={{ width: '100%' }}>
          <PredictiveProgressBar
            progress={1}
            status="done"
            showEta={false}
            showPercent
            showLabel
            label="Rendering chapter audio"
            allowBackwardProgress={false}
          />
        </div>
      </SpecimenCard>
    </div>
  </SubSection>
);

// ---------------------------------------------------------------------------
// StatusOrb specimen helpers — synthetic Chapter/Job mocks
// ---------------------------------------------------------------------------

/** Minimal Chapter stub — only the fields StatusOrb reads */
function makeChap(overrides: Partial<Chapter>): Chapter {
  return {
    id: 'sg-chap',
    project_id: 'sg-proj',
    title: 'Chapter 1',
    text_content: '',
    speaker_profile_name: null,
    sort_order: 0,
    audio_status: 'unprocessed',
    audio_file_path: null,
    has_wav: false,
    has_mp3: false,
    has_m4a: false,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 0,
    word_count: 0,
    sent_count: 0,
    predicted_audio_length: 0,
    audio_length_seconds: 0,
    ...overrides,
  };
}

/** Minimal Job stub — only the fields StatusOrb reads */
function makeJob(overrides: Partial<Job>): Job {
  return {
    id: 'sg-job',
    engine: 'xtts',
    chapter_file: '',
    status: 'running',
    created_at: Date.now(),
    safe_mode: false,
    make_mp3: false,
    progress: 0.45,
    ...overrides,
  } as unknown as Job;
}

const StatusOrbSpecimens: React.FC = () => {
  const NOW = Date.now();
  const PAST = NOW - 10000; // 10 s ago — audio_generated before text change

  const specimens: Array<{ label: string; caption: string; chap: Chapter; job?: Job; queuePending?: boolean; done?: number; total?: number }> = [
    {
      label: 'Unprocessed (empty)',
      caption: 'No audio, no cached M4A — blank orb',
      chap: makeChap({ audio_status: 'unprocessed' }),
    },
    {
      label: 'Queued',
      caption: 'queue_pending=true, no active job',
      chap: makeChap({ audio_status: 'unprocessed' }),
      queuePending: true,
    },
    {
      label: 'Running',
      caption: 'Active job present → spinner ring',
      chap: makeChap({ audio_status: 'processing' }),
      job: makeJob({ status: 'running' }),
    },
    {
      label: 'Partial (50%)',
      caption: '2 of 4 segments done',
      chap: makeChap({ audio_status: 'unprocessed' }),
      done: 2,
      total: 4,
    },
    {
      label: 'Done',
      caption: 'has_wav=true, in-sync',
      chap: makeChap({ audio_status: 'done', has_wav: true, audio_generated_at: NOW, text_last_modified: PAST }),
    },
    {
      label: 'Cached (M4A only)',
      caption: 'has_m4a=true, no WAV — Archive icon',
      chap: makeChap({ audio_status: 'unprocessed', has_m4a: true }),
    },
    {
      label: 'Stale (needs rebuild)',
      caption: 'text changed after last render',
      chap: makeChap({ audio_status: 'done', has_wav: true, audio_generated_at: PAST, text_last_modified: NOW }),
    },
    {
      label: 'Error',
      caption: 'audio_status=error → X icon',
      chap: makeChap({ audio_status: 'error' }),
    },
  ];

  return (
    <SubSection title="StatusOrb">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {specimens.map(({ label, caption, chap, job, queuePending, done, total }) => (
          <SpecimenCard key={label} label={label} caption={caption} style={{ minWidth: 110 }}>
            <StatusOrb
              chap={chap}
              activeJob={job}
              queuePending={queuePending}
              doneSegments={done}
              totalSegments={total}
              size={28}
            />
          </SpecimenCard>
        ))}
      </div>
    </SubSection>
  );
};

const ComponentsSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.components} title={SECTION_LABELS.components}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
      Live-mounted real components in static-prop states. Skipped (require heavy store context):
      NarratorCard (VoicesPage store), full Queue Drawer.
    </p>
    <ButtonSpecimens />
    <InputSpecimens />
    <ProgressSpecimens />
    <StatusOrbSpecimens />
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 4: Proposed directions
// ---------------------------------------------------------------------------

/** Thumbnail-scale layout mockup helper */
const LayoutThumb: React.FC<{
  label: string;
  children: React.ReactNode;
  caption?: string;
}> = ({ label, children, caption }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    <div
      style={{
        width: 280,
        height: 200,
        border: '1px solid var(--border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--bg)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {children}
    </div>
    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{label}</div>
    {caption && (
      <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', maxWidth: 280 }}>{caption}</div>
    )}
  </div>
);

/** U15 — Navigation mockup */
const U15Mock: React.FC = () => {
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [railHovered, setRailHovered] = useState(false);

  // In collapsed state: hovering temporarily expands the rail as overlay
  const railExpanded = !railCollapsed || railHovered;
  const railWidth = railExpanded ? 80 : 28;

  return (
    <Card>
      <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
        U15 — Navigation &amp; Information Architecture
        <DecidedChip label="Decided · Option B · Implemented" />
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
        The current top-bar nav puts all destinations at the same visual weight, creating
        competing attention across Library, Voices, Queue, Settings, and System. The proposed
        grouped left-rail separates "Create" workflows (Library, Voices, Queue) from "Manage"
        (Settings, System), giving each screen one obvious purpose. Decisions here shape where
        U1–U14 controls live, so this runs first in Stage 5.
      </p>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <LayoutThumb
          label="(A) Current — top-bar nav"
          caption="All destinations at equal weight; no grouping by purpose"
        >
          {/* Top bar */}
          <div style={{ height: 36, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8 }}>
            <div style={{ width: 70, height: 12, background: 'var(--accent)', borderRadius: 4, opacity: 0.8 }} />
            <div style={{ flex: 1 }} />
            {['Library', 'Voices', 'Queue', '⚙'].map(label => (
              <div key={label} style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', padding: '2px 6px', borderRadius: 4, background: 'var(--surface-alt)' }}>
                {label}
              </div>
            ))}
          </div>
          {/* Content */}
          <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[1,2,3].map(i => (
              <div key={i} style={{ height: 30, background: 'var(--surface-alt)', borderRadius: 6, border: '1px solid var(--border)' }} />
            ))}
          </div>
        </LayoutThumb>

        {/* Interactive proposed rail mock */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div
            style={{
              width: 280,
              height: 200,
              border: '1px solid var(--border)',
              borderRadius: 8,
              overflow: 'hidden',
              background: 'var(--bg)',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            {/* Top bar slim */}
            <div style={{ height: 28, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 10px' }}>
              <div style={{ width: 60, height: 10, background: 'var(--accent)', borderRadius: 4, opacity: 0.8 }} />
            </div>
            <div style={{ display: 'flex', height: 'calc(100% - 28px)', position: 'relative' }}>
              {/* Left rail — collapses to icon-only, hover expands as overlay */}
              <div
                onMouseEnter={() => setRailHovered(true)}
                onMouseLeave={() => setRailHovered(false)}
                style={{
                  width: railWidth,
                  minWidth: railWidth,
                  background: 'var(--surface)',
                  borderRight: '1px solid var(--border)',
                  padding: '8px 4px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  transition: 'width 0.22s ease, min-width 0.22s ease',
                  overflow: 'hidden',
                  // When collapsed + hovered, float over content
                  position: railCollapsed && railHovered ? 'absolute' : 'relative',
                  top: 0,
                  bottom: 0,
                  left: 0,
                  zIndex: railCollapsed && railHovered ? 10 : 'auto',
                  boxShadow: railCollapsed && railHovered ? '2px 0 8px rgba(0,0,0,0.18)' : 'none',
                }}
              >
                {railExpanded && (
                  <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', paddingLeft: 2 }}>Create</div>
                )}
                {[
                  { label: 'Library', icon: '📚' },
                  { label: 'Voices', icon: '🎙' },
                  { label: 'Queue', icon: '⏳' },
                ].map(({ label, icon }, i) => (
                  <div
                    key={label}
                    title={railCollapsed && !railHovered ? label : undefined}
                    style={{
                      fontSize: '0.55rem',
                      padding: '4px 4px',
                      borderRadius: 4,
                      background: i === 0 ? 'var(--accent-tint-bg)' : 'transparent',
                      color: i === 0 ? 'var(--accent)' : 'var(--text-secondary)',
                      fontWeight: i === 0 ? 600 : 400,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>{icon}</span>
                    {railExpanded && <span>{label}</span>}
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                {railExpanded && (
                  <div style={{ fontSize: '0.5rem', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap', paddingLeft: 2 }}>Manage</div>
                )}
                {[
                  { label: 'Settings', icon: '⚙️' },
                  { label: 'System', icon: '🖥' },
                ].map(({ label, icon }) => (
                  <div
                    key={label}
                    title={railCollapsed && !railHovered ? label : undefined}
                    style={{
                      fontSize: '0.55rem',
                      padding: '4px 4px',
                      borderRadius: 4,
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', flexShrink: 0 }}>{icon}</span>
                    {railExpanded && <span>{label}</span>}
                  </div>
                ))}
                {/* Collapse/pin toggle */}
                <button
                  type="button"
                  onClick={() => setRailCollapsed(c => !c)}
                  title={railCollapsed ? 'Pin rail open' : 'Collapse rail'}
                  style={{
                    marginTop: 4,
                    padding: '3px 4px',
                    borderRadius: 4,
                    background: 'none',
                    border: '1px solid var(--border)',
                    cursor: 'pointer',
                    fontSize: '0.6rem',
                    color: 'var(--text-muted)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '100%',
                    gap: 2,
                  }}
                >
                  <span>{railCollapsed ? '▶' : '◀'}</span>
                  {railExpanded && <span style={{ whiteSpace: 'nowrap' }}>{railCollapsed ? 'Pin' : 'Collapse'}</span>}
                </button>
              </div>
              {/* Content area — always fills remaining space */}
              <div style={{ flex: 1, padding: 8, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[1,2,3].map(i => (
                  <div key={i} style={{ height: 26, background: 'var(--surface-alt)', borderRadius: 5, border: '1px solid var(--border)' }} />
                ))}
              </div>
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              (B) Proposed — grouped left-rail (interactive)
            </div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', maxWidth: 280, marginTop: 2 }}>
              Full rail → icon rail (manual collapse or medium viewport) → mobile drawer.
            </div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        <strong>Tradeoffs:</strong> Left-rail requires ~80px horizontal space and changes muscle memory.
        Top-bar is familiar but cannot express hierarchy. Decision needed before any Stage 5 visual work.
        Click the collapse button in the mock rail to toggle icon-only mode; hover to temporarily expand.
      </div>
    </Card>
  );
};

/** Fake waveform SVG — varied bar heights; stretches to fill its box so it can
 *  serve as an inline scrub track (fixed pixel height, full container width). */
const WaveformSVG: React.FC<{ height?: number }> = ({ height = 32 }) => {
  const bars = [
    12, 28, 18, 40, 32, 20, 44, 36, 22, 50, 42, 30, 48, 38, 24, 46, 34, 20, 40, 28,
    16, 36, 50, 44, 26, 38, 18, 42, 30, 46, 22, 34, 50, 28, 40, 20, 44, 32, 18, 36,
    48, 24, 38, 50, 28, 16, 42, 30, 44, 22,
  ];
  const totalBars = bars.length;
  const barW = 4;
  const gap = 2;
  const svgW = totalBars * (barW + gap);
  const vbH = 56;
  const playheadX = svgW * 0.35;

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${svgW} ${vbH}`}
      preserveAspectRatio="none"
      style={{ display: 'block' }}
    >
      {bars.map((h, idx) => {
        const x = idx * (barW + gap);
        const isPlayed = x + barW / 2 < playheadX;
        return (
          <rect
            key={idx}
            x={x}
            y={(vbH - h) / 2}
            width={barW}
            height={h}
            rx={2}
            fill={isPlayed ? 'var(--accent)' : 'var(--border)'}
            opacity={isPlayed ? 0.9 : 0.6}
          />
        );
      })}
      {/* Playhead line */}
      <line
        x1={playheadX}
        y1={0}
        x2={playheadX}
        y2={vbH}
        stroke="var(--accent)"
        strokeWidth={2}
        opacity={0.9}
      />
    </svg>
  );
};

/** U16 — Unified player mockup.
 *  Representation follows scope (no separate waveform toggle):
 *   - Segment scope → waveform IS the inline scrub track (short segments have
 *     readable structure worth annotating).
 *   - Chapter scope → plain seek bar (an hour of speech is a featureless blur).
 *  Responsive exception: when the player is narrow there's no room for an inline
 *  waveform, so in Segment scope it moves ABOVE the controls at a reduced height
 *  (container query), and the row falls back to a thin seek line. */
const U16Mock: React.FC = () => {
  const [scope, setScope] = useState<'Segment' | 'Chapter'>('Segment');
  const isSegment = scope === 'Segment';

  // Representation defaults to the scope type (segment → waveform, chapter →
  // bar) but the far-right toggle lets the user flip it. Switching scope resets
  // the override so each scope starts at its default.
  const [forceWave, setForceWave] = useState<boolean | null>(null);
  const showWave = forceWave ?? isSegment;

  const trackStyle: React.CSSProperties = {
    height: 6,
    flex: 1,
    minWidth: 60,
    background: 'var(--surface-alt)',
    border: '1px solid var(--border)',
    borderRadius: 3,
    position: 'relative',
    overflow: 'hidden',
    cursor: 'pointer',
  };

  return (
    <Card>
      <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
        U16 — Unified Audio Player Surface
        <DecidedChip label="Affirmed" />
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Today the Chapter Editor has a VCR-style segment player and a separate chapter-level player —
        two separate surfaces that compete for space. The proposed design merges them into one persistent
        bottom player with a scope toggle (Segment ↔ Chapter). Depends on U15&apos;s layout conclusions.
      </p>
      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
        Click <strong>Segment</strong> / <strong>Chapter</strong> to see representation follow scope.
      </p>

      {/* Player mock — inline single row, matching the mockup + live PlayerBar.
          container-type makes the waveform reflow above the controls when narrow. */}
      <div className="u16-player" style={{ containerType: 'inline-size', maxWidth: 820 }}>
        <style>{`
          .u16-player .u16-wave-inline { display: block; }
          .u16-player .u16-wave-above  { display: none; }
          @container (max-width: 560px) {
            .u16-player .u16-wave-inline { display: none; }
            .u16-player .u16-wave-above  { display: block; }
          }
        `}</style>
        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 10,
            background: 'var(--surface)',
            overflow: 'hidden',
          }}
        >
          {/* Responsive-only: waveform above the controls (when shown + narrow). Shorter than inline. */}
          {showWave && (
            <div
              className="u16-wave-above"
              style={{
                padding: '5px 14px 1px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--surface-alt)',
                overflow: 'hidden',
              }}
            >
              <WaveformSVG height={24} />
            </div>
          )}

          {/* Inline control row — wraps when too narrow so nothing clips */}
          <div style={{ minHeight: 52, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '8px 14px' }}>
            {/* Transport */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              {[
                { Icon: SkipBack, label: 'Previous' },
                { Icon: Rewind, label: 'Back 10s' },
                { Icon: Play, label: 'Play' },
                { Icon: FastForward, label: 'Forward 10s' },
                { Icon: SkipForward, label: 'Next' },
              ].map(({ Icon, label }) => {
                const active = Icon === Play;
                return (
                  <div
                    key={label}
                    aria-label={label}
                    style={{
                      width: active ? 38 : 34,
                      height: active ? 38 : 34,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 'var(--radius-round, 50%)',
                      background: active ? 'var(--accent)' : 'var(--surface-alt)',
                      color: active ? 'var(--text-on-accent, #fff)' : 'var(--text-secondary)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={active ? 17 : 15} strokeWidth={2.2} style={{ transform: active ? 'translateX(1px)' : undefined }} />
                  </div>
                );
              })}
            </div>

            {/* Scrub track — Segment: inline waveform (hidden when narrow; the above
                strip becomes the scrub track) / Chapter: plain bar. */}
            {showWave ? (
              <div className="u16-wave-inline" style={{ flex: 1, minWidth: 60, cursor: 'pointer' }} title="Click to seek">
                <WaveformSVG height={32} />
              </div>
            ) : (
              <div style={trackStyle} title="Click to seek">
                <div style={{ width: '38%', height: '100%', background: 'var(--accent)', borderRadius: 3 }} />
              </div>
            )}

            {/* Scope toggle — drives representation (sits where the live bar shows title + chip) */}
            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
              {(['Segment', 'Chapter'] as const).map(label => {
                const selected = scope === label;
                return (
                  <button
                    type="button"
                    key={label}
                    onClick={() => { setScope(label); setForceWave(null); }}
                    style={{
                      padding: '4px 12px',
                      borderRadius: 999,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      background: selected ? 'var(--accent)' : 'var(--surface-alt)',
                      color: selected ? 'var(--text-on-accent, #fff)' : 'var(--text-secondary)',
                      border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Time — follows the audio (scope), not the scrub look */}
            <span style={{ fontSize: 'var(--type-micro, 0.65rem)', color: 'var(--text-secondary)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {isSegment ? '0:03 / 0:06' : '2:14 / 28:10'}
            </span>

            {/* Representation override (far right) — defaults to scope, flip on demand */}
            <button
              type="button"
              onClick={() => setForceWave(!showWave)}
              aria-pressed={showWave}
              aria-label={showWave ? 'Show progress bar' : 'Show waveform'}
              title={showWave ? 'Switch to progress bar' : 'Switch to waveform'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                flexShrink: 0,
                cursor: 'pointer',
                padding: 0,
                fontSize: '0.85rem',
                borderRadius: 6,
                border: `1px solid ${showWave ? 'var(--accent-tint-border, var(--accent))' : 'var(--border)'}`,
                color: showWave ? 'var(--accent)' : 'var(--text-muted)',
                background: showWave ? 'var(--accent-tint-bg)' : 'transparent',
              }}
            >
              <AudioLines size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 8, fontSize: '0.6875rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
        Representation <em>defaults</em> to scope — Segment shows the wavesurfer.js waveform as the inline scrub
        track, Chapter shows a plain bar — but the far-right toggle (audio-lines icon) flips waveform ↔ bar on demand.
        Switching scope resets to that scope&apos;s default. Narrow the window to see the waveform reflow above.
      </div>
      <div style={{ marginTop: 8, fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Replaces competing VCR segment transport + chapter player. Scope toggle swaps loaded audio.
        Segment scope plays one rendered segment (≤ engine char limit) then auto-advances; Chapter scope
        plays the assembled chapter and shows chapter-level ETA when no rendered audio yet.
      </div>
    </Card>
  );
};

const OVERFLOW_MENU_ITEMS = ['Rename', 'Duplicate', 'Export', 'Reset', 'Delete'];

// ---------------------------------------------------------------------------
// Category-tinted pill taxonomy (U8 v2 — 2026-06-12)
// ---------------------------------------------------------------------------

/**
 * Tint definitions for each pill category.
 * Low-alpha backgrounds read on both light and dark surfaces.
 * Text uses a medium-strength hue value that passes contrast on both themes.
 */
const CATEGORY_TINTS = {
  /** Voice class: narrator, character — violet/purple */
  class: {
    bg: 'rgba(124, 58, 237, 0.13)',
    text: 'rgb(109, 40, 217)',
    border: 'rgba(124, 58, 237, 0.28)',
  },
  /** Gender — blue */
  gender: {
    bg: 'rgba(37, 99, 235, 0.12)',
    text: 'rgb(37, 99, 235)',
    border: 'rgba(37, 99, 235, 0.26)',
  },
  /** Age group — amber/warm */
  age: {
    bg: 'rgba(217, 119, 6, 0.13)',
    text: 'rgb(180, 83, 9)',
    border: 'rgba(217, 119, 6, 0.28)',
  },
  /** Extended taxonomy: language, accent, style — teal/slate */
  extended: {
    bg: 'rgba(15, 118, 110, 0.11)',
    text: 'rgb(15, 118, 110)',
    border: 'rgba(15, 118, 110, 0.24)',
  },
  /** Free-form tags — neutral ghost */
  tag: {
    bg: 'transparent',
    text: 'var(--text-muted)',
    border: 'var(--border)',
  },
} as const;

type PillCategory = keyof typeof CATEGORY_TINTS;

/** Canonical class keywords (voice class attribute values) */
const CLASS_VALUES = new Set(['narrator', 'character', 'assistant', 'custom']);
/** Canonical gender keywords */
const GENDER_VALUES = new Set(['male', 'female', 'neutral', 'nonbinary']);
/** Canonical age keywords */
const AGE_VALUES = new Set(['child', 'teen', 'young', 'adult', 'middle', 'senior', 'elder']);
/** Extended taxonomy keywords */
const EXTENDED_KEYS = new Set(['english', 'british', 'american', 'australian', 'irish', 'scottish', 'narration', 'educational', 'conversational', 'dramatic', 'news', 'casual']);

function pillCategory(label: string): PillCategory {
  const l = label.toLowerCase();
  if (CLASS_VALUES.has(l)) return 'class';
  if (GENDER_VALUES.has(l)) return 'gender';
  if (AGE_VALUES.has(l)) return 'age';
  if (EXTENDED_KEYS.has(l)) return 'extended';
  return 'tag';
}

const CATEGORY_ORDER: PillCategory[] = ['class', 'gender', 'age', 'extended', 'tag'];

function sortedPills(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(pillCategory(a));
    const bi = CATEGORY_ORDER.indexOf(pillCategory(b));
    return ai - bi;
  });
}

/** Single category-tinted pill */
const AttrPill: React.FC<{ label: string; category?: PillCategory }> = ({ label, category }) => {
  const cat = category ?? pillCategory(label);
  const tint = CATEGORY_TINTS[cat];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 7px',
        borderRadius: 999,
        fontSize: '0.625rem',
        fontWeight: cat === 'tag' ? 400 : 500,
        background: tint.bg,
        color: tint.text,
        border: `1px solid ${tint.border}`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
};

/** Legacy alias — used by cards without extended taxonomy */
const AttrBadge: React.FC<{ label: string }> = ({ label }) => <AttrPill label={label} />;

// ---------------------------------------------------------------------------
// Pill legend row
// ---------------------------------------------------------------------------

const PillLegend: React.FC = () => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      flexWrap: 'wrap',
      padding: '6px 10px',
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      marginBottom: 12,
    }}
  >
    <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 4 }}>
      Pill key:
    </span>
    {(['class', 'gender', 'age', 'extended', 'tag'] as PillCategory[]).map(cat => (
      <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <AttrPill label={cat} category={cat} />
      </span>
    ))}
  </div>
);

// ---------------------------------------------------------------------------
// Overflow pill row (used by Elena Marsh extended-taxonomy card)
// ---------------------------------------------------------------------------

interface OverflowPillRowProps {
  /** All pills in display order (pre-sorted by category) */
  pills: string[];
  /** How many to show before collapsing (default: 5 = class+gender+age + 2 more) */
  alwaysShow?: number;
}

const OverflowPillRow: React.FC<OverflowPillRowProps> = ({ pills, alwaysShow = 5 }) => {
  const [expanded, setExpanded] = useState(false);

  const visible = pills.slice(0, alwaysShow);
  const hidden = pills.slice(alwaysShow);
  const overflowCount = hidden.length;

  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {visible.map(p => <AttrPill key={p} label={p} />)}
      {overflowCount > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 7px',
            borderRadius: 999,
            fontSize: '0.625rem',
            fontWeight: 600,
            background: 'rgba(15, 118, 110, 0.11)',
            color: 'rgb(15, 118, 110)',
            border: '1px solid rgba(15, 118, 110, 0.24)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          +{overflowCount}
        </button>
      )}
      {expanded && hidden.map(p => <AttrPill key={p} label={p} />)}
      {expanded && overflowCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '2px 7px',
            borderRadius: 999,
            fontSize: '0.625rem',
            fontWeight: 500,
            background: 'transparent',
            color: 'var(--text-muted)',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          less
        </button>
      )}
    </div>
  );
};

interface U8VoiceCardProps {
  phase: string;
  cta: string;
  ctaStyle: React.CSSProperties;
  /** Emoji or short initials displayed in the avatar circle */
  avatarEmoji: string;
  /** Background color for the avatar circle (raw CSS color or variable) */
  avatarBg: string;
  name: string;
  badges: string[];
  description: string;
  /** When true, pill row uses OverflowPillRow with sorted pills */
  useOverflow?: boolean;
}

/** Individual U8 voice card with functional overflow popover */
const U8VoiceCard: React.FC<U8VoiceCardProps> = ({
  phase, cta, ctaStyle, avatarEmoji, avatarBg, name, badges, description, useOverflow,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div
      style={{
        minWidth: 260,
        flex: '1 1 260px',
        maxWidth: 320,
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--surface)',
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      {/* Top row: avatar + name/phase + overflow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Voice icon — circular avatar ~40px, mocked with colored circle + emoji */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            background: avatarBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.2rem',
            flexShrink: 0,
            border: '1px solid var(--border)',
          }}
        >
          {avatarEmoji}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {name}
          </div>
          <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {phase}
          </div>
        </div>
        {/* Overflow button + popover */}
        <div ref={overflowRef} style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setMenuOpen(o => !o)}
            aria-label="More actions"
            style={{
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              background: menuOpen ? 'var(--accent-tint-bg)' : 'transparent',
              border: '1px solid',
              borderColor: menuOpen ? 'var(--accent-tint-border, var(--border))' : 'transparent',
              color: menuOpen ? 'var(--accent)' : 'var(--text-muted)',
              cursor: 'pointer',
              fontSize: '1rem',
              lineHeight: 1,
              transition: 'background 0.12s, color 0.12s',
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 4px)',
                right: 0,
                zIndex: 100,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                boxShadow: 'var(--shadow-md, 0 4px 16px rgba(0,0,0,0.18))',
                minWidth: 140,
                overflow: 'hidden',
              }}
            >
              {OVERFLOW_MENU_ITEMS.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '7px 14px',
                    fontSize: '0.8125rem',
                    color: item === 'Delete' ? 'var(--error, #dc2626)' : 'var(--text-primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: item === 'Delete' ? 600 : 400,
                    borderTop: item === 'Delete' ? '1px solid var(--border)' : 'none',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-alt)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Attribute badges row: class · gender · age [· extended · tags] */}
      {useOverflow ? (
        <OverflowPillRow pills={sortedPills(badges)} alwaysShow={5} />
      ) : (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {sortedPills(badges).map(b => <AttrBadge key={b} label={b} />)}
        </div>
      )}

      {/* One-line description — ellipsized */}
      <div
        style={{
          fontSize: '0.75rem',
          color: 'var(--text-secondary)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          lineHeight: 1.4,
        }}
        title={description}
      >
        {description}
      </div>

      {/* CTA row: preview button + phase primary CTA */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {/* ▶ Preview button */}
        <button
          type="button"
          aria-label="Preview voice"
          style={{
            flexShrink: 0,
            width: 32,
            height: 32,
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--surface-alt)',
            color: 'var(--text-secondary)',
            fontSize: '0.8rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ▶
        </button>
        {/* Phase primary CTA */}
        <button
          type="button"
          style={{
            borderRadius: 8,
            padding: '6px 12px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
            flex: 1,
            ...ctaStyle,
          }}
        >
          {cta}
        </button>
      </div>

      <div style={{ fontSize: '0.625rem', color: 'var(--text-muted)', textAlign: 'center' }}>
        ~{phase === 'empty' ? '6' : phase === 'has-samples' ? '5' : '4'} actions hidden in ⋯
      </div>
    </div>
  );
};

/** U8 — Voice card progressive disclosure */
const U8Mock: React.FC = () => {
  const phases: U8VoiceCardProps[] = [
    {
      phase: 'empty',
      cta: 'Add Samples',
      ctaStyle: { background: 'var(--surface-alt)', color: 'var(--text-secondary)', border: '1px dashed var(--border)' },
      avatarEmoji: '🎩',
      avatarBg: 'rgba(124, 58, 237, 0.12)',
      name: 'Professor Vale',
      badges: ['narrator', 'male', 'senior'],
      description: 'Deep, authoritative narrator with a dry wit and precise diction.',
    },
    {
      phase: 'has-samples',
      cta: 'Build Voice',
      ctaStyle: { background: 'var(--accent)', color: '#fff', border: 'none' },
      avatarEmoji: '👵',
      avatarBg: 'rgba(16, 185, 129, 0.12)',
      name: 'Agatha Wren',
      badges: ['character', 'female', 'elder'],
      description: 'Warm, weathered grandmother voice with a slight Scottish lilt.',
    },
    {
      phase: 'built',
      cta: 'Test Voice',
      ctaStyle: { background: 'var(--success)', color: '#fff', border: 'none' },
      avatarEmoji: 'EM',
      avatarBg: 'rgba(245, 158, 11, 0.12)',
      name: 'Elena Marsh',
      // Extended taxonomy: class · gender · age + language · accent · style×3
      badges: ['narrator', 'female', 'adult', 'english', 'british', 'narration', 'educational', 'conversational'],
      description: 'Warm, measured narrator with a British accent — narration, education, conversational.',
      useOverflow: true,
    },
    {
      phase: 'tested',
      cta: 'Use in Project',
      ctaStyle: { background: 'var(--accent)', color: '#fff', border: 'none' },
      avatarEmoji: '🎙',
      avatarBg: 'rgba(59, 130, 246, 0.12)',
      name: 'Studio Voice',
      badges: ['narrator', 'neutral', 'adult'],
      description: 'Clean, neutral studio voice suitable for any genre.',
    },
  ];
  return (
    <Card>
      <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
        U8 — Voice Card Progressive Disclosure
        <ProposedChip />
        <OwnerDecisionChip />
      </h3>
      <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
        Today each voice card shows 7–8 peer-level actions. The proposal derives a <code>voicePhase</code> from
        the voice&apos;s actual state and shows exactly one primary CTA for that phase, demoting other actions to
        an overflow (⋯) menu. This eliminates choice overload and surfaces the right next step.
        Each card now also shows a circular voice icon (user-uploaded image, mocked here with an emoji or initials),
        <strong> category-tinted attribute pills</strong> (class · gender · age — each category carries a distinct
        hue that works in both light and dark themes), a one-line description, and a ▶ Preview button beside the CTA.
        Pills are always ordered: <em>class · gender · age</em>, then extended attributes, then free-form tags.
        Attributes + description can generate a copyable image prompt to help users create a uniform voice icon
        (owner direction, 2026-06-12).{' '}
        <strong>Extended taxonomy (language, accent, style) re-opened into 2.0 scope — owner, 2026-06-12:</strong>{' '}
        style is multi-select (e.g. narration + educational + conversational); accent is single-value.
        When a card carries more pills than fit, identity pills (class/gender/age) plus 2 extended always show;
        the remainder collapse into a <em>+N</em> pill — tap/click to expand inline (tap-friendly, no hover-only).
        See Elena Marsh card for the live specimen.
        Click ⋯ to open the popover.
      </p>
      <div
        style={{
          fontSize: '0.8rem',
          lineHeight: 1.55,
          color: 'var(--warning-text, #92400e)',
          background: 'rgba(245, 158, 11, 0.1)',
          border: '1px solid rgba(245, 158, 11, 0.3)',
          borderRadius: 8,
          padding: '8px 12px',
          marginBottom: '1rem',
        }}
      >
        <strong>Open gap (owner, 2026-06-15):</strong> this proposal covers the voice <em>card</em> only.
        It does not yet account for the voice <strong>editor</strong> surface, which is a current problem
        on the live site. The editor needs its own design pass before U8 can be affirmed.
      </div>
      <PillLegend />
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {phases.map(props => (
          <U8VoiceCard key={props.phase} {...props} />
        ))}
      </div>
    </Card>
  );
};

/** U1 — Undo toast vs confirm modal */
const U1Mock: React.FC = () => (
  <Card>
    <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
      U1 — Undo Toast (replace most ConfirmModals)
      <DecidedChip label="Approved" />
    </h3>
    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '1rem', lineHeight: 1.6 }}>
      <code>ConfirmModal</code> is invoked from ~14 sites and defaults <code>isDestructive=true</code>,
      blocking the user with a modal for low-stakes reversible operations. The proposed rule: non-project
      deletes (chapter, sample, voice reset, chapter-audio reset) → immediate action + 5 s undo toast.
      Keep modal only for project delete and bulk audio reset.
    </p>
    <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {/* Undo toast mock */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--success)', marginBottom: 2 }}>
          PROPOSED — non-destructive ops
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '10px 16px',
            boxShadow: 'var(--shadow-md)',
            minWidth: 280,
          }}
        >
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
            Chapter deleted
          </span>
          <div style={{ flex: 1 }} />
          <button type="button" style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 6, textDecoration: 'underline' }}>
            Undo
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(5 s)</span>
        </div>
        {/* Progress sliver */}
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 99 }}>
          <div style={{ width: '60%', height: '100%', background: 'var(--accent)', borderRadius: 99, transition: 'width 0.2s linear' }} />
        </div>
      </div>

      {/* Struck-through modal mock */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, opacity: 0.55 }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--error)', marginBottom: 2, textDecoration: 'line-through' }}>
          REPLACED — non-destructive confirm modal
        </div>
        <div
          style={{
            border: '1px solid var(--error-tint-border)',
            borderRadius: 10,
            background: 'var(--surface)',
            padding: '12px 16px',
            minWidth: 240,
            boxShadow: 'var(--shadow-md)',
            textDecoration: 'line-through',
          }}
        >
          <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: 8, color: 'var(--text-primary)' }}>Delete chapter?</div>
          <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 12 }}>This cannot be undone.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1, padding: '5px', textAlign: 'center', background: 'var(--surface-alt)', borderRadius: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Cancel</div>
            <div style={{ flex: 1, padding: '5px', textAlign: 'center', background: 'var(--error)', borderRadius: 6, fontSize: '0.75rem', color: '#fff' }}>Delete</div>
          </div>
        </div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', maxWidth: 240 }}>
          Modal kept only for: project delete, bulk audio reset.
        </div>
      </div>
    </div>
  </Card>
);

/** U3 cross-link */
const U3Crosslink: React.FC = () => (
  <Card>
    <h3 style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)', marginBottom: 4 }}>
      U3 — Semantic Type Scale
      <DecidedChip label="Shipped" />
    </h3>
    <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '0.75rem', lineHeight: 1.6 }}>
      The 9-step type scale, 8-step spacing scale, and motion tokens are all shipped in <code>tokens.css</code>.
      Live specimens with real values auto-parsed from the source file live in Section 2.
    </p>
    <button
      type="button"
      onClick={() => document.getElementById(SECTION_IDS.typography)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      style={{
        display: 'inline-block',
        padding: '6px 14px',
        background: 'var(--accent-tint-bg)',
        color: 'var(--accent)',
        border: '1px solid var(--accent-tint-border)',
        borderRadius: 8,
        fontSize: '0.875rem',
        fontWeight: 600,
        textDecoration: 'none',
        cursor: 'pointer',
      }}
    >
      Go to Section 2 — Typography
    </button>
  </Card>
);

const ProposalsSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.proposals} title={SECTION_LABELS.proposals}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
      Static token-styled mockups for proposals from doc 10 UX Improvements. Each shows a rationale
      and a visual mock. <strong>No production code has been changed</strong> to build these — approve
      by reading, then implement in the separate phase.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <U15Mock />
      <U16Mock />
      <U8Mock />
      <U1Mock />
      <U3Crosslink />
    </div>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 5: Theme side-by-side
// ---------------------------------------------------------------------------

const CompositeSpecimen: React.FC = () => (
  <div
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card, 12px)',
      padding: '1.25rem',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      width: 280,
    }}
  >
    <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>
      Chapter 2 — The Awakening
    </div>
    <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
      The morning light filtered through the blinds, casting pale stripes across the wooden floor.
    </div>
    <GlassInput placeholder="Search within chapter…" />
    <div>
      <PredictiveProgressBar
        progress={0.62}
        status="running"
        showEta
        showPercent
        showLabel
        label="Rendering"
        etaSeconds={28}
        updatedAt={Date.now()}
        allowBackwardProgress={false}
      />
    </div>
    <div style={{ display: 'flex', gap: 8 }}>
      <button className="btn-primary" type="button" style={{ fontSize: '0.8rem', flex: 1 }}>Queue</button>
      <button className="btn-ghost" type="button" style={{ fontSize: '0.8rem', flex: 1 }}>Export</button>
    </div>
  </div>
);

const ThemeSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.theme} title={SECTION_LABELS.theme}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
      The same composite specimen rendered in both themes simultaneously — so any future token edit
      can be reviewed in both contexts on one screen.
    </p>
    <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Light
        </div>
        <div data-theme="light" style={{ background: '#f8fafc', padding: 16, borderRadius: 12, border: '1px solid #e6eaf2' }}>
          <CompositeSpecimen />
        </div>
      </div>
      <div>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
          Dark
        </div>
        <div data-theme="dark" style={{ background: '#0f1117', padding: 16, borderRadius: 12, border: '1px solid #2d3148' }}>
          <CompositeSpecimen />
        </div>
      </div>
    </div>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Sticky left sidebar nav
// ---------------------------------------------------------------------------

const NAV_GROUPS: Array<{ label: string; keys: (keyof typeof SECTION_IDS)[] }> = [
  { label: 'Foundations', keys: ['colors', 'typography'] },
  { label: 'Components',  keys: ['components'] },
  { label: 'Direction',   keys: ['proposals', 'theme'] },
];

const StyleguideSidebar: React.FC<{ active: string }> = ({ active }) => {
  const scrollTo = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <nav
      aria-label="Style guide sections"
      className="sg-sidebar"
      style={{
        position: 'sticky',
        top: 50,
        alignSelf: 'flex-start',
        height: 'calc(100vh - 50px)',
        overflowY: 'auto',
        width: 248,
        flexShrink: 0,
        background: 'var(--surface-alt)',
        borderRight: '1px solid var(--hairline, var(--border))',
        padding: '1.5rem 0',
      }}
    >
      {/* Branding block */}
      <div
        style={{
          padding: '0 1.25rem 1.25rem',
          borderBottom: '1px solid var(--hairline, var(--border))',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <AudioLines size={18} color="var(--action-primary, var(--accent))" aria-hidden="true" />
          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
            Audiobook Studio
          </span>
        </div>
        <div
          style={{
            fontSize: 'var(--type-micro, 0.65rem)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
            marginBottom: 2,
          }}
        >
          Visual Style Guide
        </div>
        <div
          style={{
            fontSize: 'var(--type-micro, 0.65rem)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-muted)',
          }}
        >
          design-system v1.12.0
        </div>
      </div>

      {/* Grouped nav links */}
      {NAV_GROUPS.map(({ label: groupLabel, keys }) => (
        <div key={groupLabel}>
          <div
            style={{
              padding: '0.9rem 1.25rem 0.25rem',
              fontSize: 'var(--type-micro, 0.65rem)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--text-muted)',
              fontWeight: 700,
            }}
          >
            {groupLabel}
          </div>
          {keys.map((key) => {
            const id = SECTION_IDS[key];
            const isActive = active === id;
            return (
              <NavItem
                key={key}
                label={SECTION_LABELS[key]}
                isActive={isActive}
                onClick={() => scrollTo(id)}
              />
            );
          })}
        </div>
      ))}
    </nav>
  );
};

/** Single nav button — extracted so hover state uses local useState (token-only, no global CSS). */
const NavItem: React.FC<{ label: string; isActive: boolean; onClick: () => void }> = ({
  label, isActive, onClick,
}) => {
  const [hovered, setHovered] = useState(false);

  const style: React.CSSProperties = {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '0.45rem 1.25rem',
    fontSize: '0.8rem',
    cursor: 'pointer',
    background: isActive
      ? 'var(--accent-tint-bg)'
      : hovered
        ? 'var(--surface)'
        : 'none',
    border: 'none',
    borderLeft: isActive
      ? '3px solid var(--action-primary, var(--accent))'
      : '3px solid transparent',
    color: isActive
      ? 'var(--action-primary, var(--accent))'
      : hovered
        ? 'var(--text-primary)'
        : 'var(--text-secondary)',
    fontWeight: isActive ? 600 : 400,
  };

  return (
    <button
      type="button"
      style={style}
      aria-current={isActive ? 'true' : undefined}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {label}
    </button>
  );
};

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

export const StyleguidePage: React.FC = () => {
  const entries = useMemo(() => parseTokens(tokensCss), []);
  const sectionIds = useMemo(() => Object.values(SECTION_IDS) as string[], []);
  const active = useActiveSection(sectionIds);

  // Responsive: hide sidebar below 768px via matchMedia.
  // Default to true (sidebar visible); jsdom / SSR envs lack matchMedia so guard it.
  const [sidebarVisible, setSidebarVisible] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setSidebarVisible(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'flex-start' }}>
      {sidebarVisible && <StyleguideSidebar active={active} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', padding: '2.5rem 48px' }}>
          <div style={{ marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>
              Design Spec Sheet
            </h1>
            <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 680 }}>
              Auto-generated token registry, live component specimens, and static mockups of proposed
              design directions from doc 10 (UX Improvements). Intended to make theming and redesign
              decisions cheap to evaluate — no production code changes needed to read and approve.
            </p>
          </div>

          <ColorTokensSection entries={entries} />
          <TypographySection allTokens={entries} />
          <ComponentsSection />
          <ProposalsSection />
          <ThemeSection />
        </div>
      </div>
    </div>
  );
};
