/**
 * StyleguidePage — Audiobook Studio canonical design system reference.
 *
 * This is the authoritative visual source of truth for building UI in this app.
 * Every token, type rule, and component state shown here is the adopted standard.
 * Code that contradicts it is a bug. Tokens and type auto-derive from tokens.css
 * (zero drift) and this page aligns with docs/specs/design-system.md.
 *
 * Sections (13):
 *   1. Principles        — design tenets
 *   2. Brand & Identity  — BrandLogo, assets, naming rules
 *   3. Color             — auto-generated token table from tokens.css
 *   4. Typography        — type scale (auto-parsed)
 *   5. Spacing & Radius  — spacing scale, motion tokens, radius
 *   6. Buttons           — button variants + states
 *   7. Forms & Focus     — GlassInput, Switch, SearchableSelect, ColorSwatchPicker, VoiceDropzone
 *   8. Status & Progress — StatusOrb, PredictiveProgressBar
 *   9. Overlays          — modal preview, ActionMenu, toast note
 *  10. Voice Pills       — VoicePill taxonomy, VoicePillRow, UntaggedBadge
 *  11. Iconography       — lucide library, control→icon mapping
 *  12. Accessibility     — five UI states, focus, contrast, reduced motion
 *  13. Theme             — side-by-side light/dark composite
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import tokensCss from '@/theme/tokens.css?raw';
import { parseTokens, groupTokens, type TokenEntry } from './parseTokens';
import {
  AudioLines,
  Play, Pause, Check, X, AlertTriangle, Loader2, Settings, Trash2,
} from 'lucide-react';
import { GlassInput } from '@/components/forms/GlassInput';
import { PredictiveProgressBar } from '@/components/progress/PredictiveProgressBar/PredictiveProgressBar';
import { StatusOrb } from '@/components/ui/StatusOrb';
import { Switch } from '@/components/ui/Switch';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { BrandLogo } from '@/components/layout/BrandLogo';
import SearchableSelect from '@/components/forms/SearchableSelect';
import { ColorSwatchPicker } from '@/components/forms/ColorSwatchPicker';
import { VoiceDropzone } from '@/components/forms/VoiceDropzone';
import { VoicePill, VoicePillRow, UntaggedBadge } from '@/pages/Voices/components/VoicePills';
import type { PillSpec } from '@/pages/Voices/components/VoicePills';
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
// Shared section/id constants
// ---------------------------------------------------------------------------

const SECTION_IDS = {
  principles:   'sg-principles',
  brand:        'sg-brand',
  colors:       'sg-colors',
  typography:   'sg-typography',
  spacing:      'sg-spacing',
  buttons:      'sg-buttons',
  forms:        'sg-forms',
  status:       'sg-status',
  overlays:     'sg-overlays',
  pills:        'sg-pills',
  iconography:  'sg-iconography',
  accessibility:'sg-accessibility',
  theme:        'sg-theme',
} as const;

const SECTION_LABELS: Record<keyof typeof SECTION_IDS, string> = {
  principles:   '1. Principles',
  brand:        '2. Brand & Identity',
  colors:       '3. Color',
  typography:   '4. Typography',
  spacing:      '5. Spacing & Radius',
  buttons:      '6. Buttons',
  forms:        '7. Forms & Focus',
  status:       '8. Status & Progress',
  overlays:     '9. Overlays',
  pills:        '10. Voice Pills',
  iconography:  '11. Iconography',
  accessibility:'12. Accessibility',
  theme:        '13. Theme',
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
// Section 1: Principles
// ---------------------------------------------------------------------------

const PRINCIPLES = [
  {
    title: 'Rationed accent',
    body: 'One brand blue (#1e4fd8 / --action-primary). Used for the single most important interactive element per surface. Not repeated as decoration.',
  },
  {
    title: 'Calm over flashy',
    body: 'Flat surfaces, minimal gradient, restrained motion. Transitions inform rather than entertain. The interface steps back; the content leads.',
  },
  {
    title: 'State never by color alone',
    body: 'Every status is dual-encoded: icon + color, or icon + text. Never rely on hue as the sole signal — this is WCAG 1.4.1 and a usability baseline.',
  },
  {
    title: 'Token-only styling',
    body: 'No hardcoded hex or rgba literals in component code. Every color, surface, shadow, and radius references a CSS variable from tokens.css.',
  },
  {
    title: 'WCAG AA in both themes',
    body: 'Every text/surface pair must meet 4.5:1 AA contrast in both light and dark. Contrast is computed against the composited token value, not the raw rgba.',
  },
  {
    title: 'Reduced motion respected',
    body: 'A global prefers-reduced-motion guard freezes decorative animations. Essential busy indicators (spinners, calm-pulse running ring) are exempted at a slower cadence so users can distinguish "working" from "hung".',
  },
];

const PrinciplesSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.principles} title={SECTION_LABELS.principles}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
      Derived from <code>docs/specs/design-system.md §1</code> and the shipped Quiet Studio direction.
      These are the governing constraints — not aspirational guidelines.
    </p>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {PRINCIPLES.map(({ title, body }) => (
        <div
          key={title}
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start',
            padding: '0.875rem 1rem',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
          }}
        >
          <div style={{ minWidth: 8, height: 8, borderRadius: '50%', background: 'var(--action-primary, var(--accent))', marginTop: 6, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', color: 'var(--text-primary)', marginBottom: 2 }}>
              {title}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              {body}
            </div>
          </div>
        </div>
      ))}
    </div>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 2: Brand & Identity
// ---------------------------------------------------------------------------

const BrandSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.brand} title={SECTION_LABELS.brand}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
      From <code>docs/specs/design-system.md §10</code>. Always use the <code>BrandLogo</code> primitive — never
      hand-typeset the wordmark. Product name: <strong>Audiobook Studio</strong> (short: <strong>Studio</strong>).
      The repo name <code>audiobook-factory</code> is internal and never user-facing.
    </p>

    <SubSection title="Wordmark variants">
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {/* Light surface */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              background: 'var(--surface-white, #ffffff)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BrandLogo showIcon />
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Inline — light surface
          </div>
        </div>

        {/* Dark surface */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              background: '#0d0f14',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 'var(--radius-card)',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            data-theme="dark"
          >
            <BrandLogo showIcon />
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Inline — dark surface
          </div>
        </div>

        {/* Stacked variant */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              padding: '1.25rem 1.5rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <BrandLogo showIcon stacked scale={0.7} />
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Stacked — banner use
          </div>
        </div>
      </div>
    </SubSection>

    <SubSection title="Raw logo asset">
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center' }}>
          <img
            src={`${import.meta.env.BASE_URL}logo.png`}
            alt="Audiobook Studio logo"
            style={{ width: 48, height: 48, objectFit: 'contain' }}
          />
          <code style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>logo.png</code>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.55, maxWidth: 480 }}>
          Served from <code>frontend/public/logo.png</code> via <code>{'${import.meta.env.BASE_URL}logo.png'}</code>.
          Also registered as <code>favicon.ico</code> in <code>index.html</code>.
          Use <code>BrandLogo showIcon</code> rather than referencing this file directly.
        </div>
      </div>
    </SubSection>

    <SubSection title="Brand color tokens">
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        {[
          { name: '--as-blue', value: '#2b6eff', note: 'Brand identity blue (stable). Distinct from --accent (#1e4fd8) since Quiet Studio re-skin.' },
          { name: '--as-amber', value: '#f97316', note: 'Brand amber. Tint tokens: --as-amber-tint-bg, --as-amber-tint-border.' },
          { name: '--action-primary', value: '#1e4fd8', note: 'Action/accent blue (light). The interactive accent — rationed to one per surface.' },
        ].map(({ name, value, note }) => (
          <div
            key={name}
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              padding: '10px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-card)',
              maxWidth: 340,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: value,
                border: '1px solid rgba(0,0,0,0.12)',
                flexShrink: 0,
              }}
            />
            <div>
              <code style={{ fontSize: '0.75rem', color: 'var(--accent)', fontFamily: 'monospace' }}>{name}</code>
              <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: 1 }}>{value}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.45 }}>{note}</div>
            </div>
          </div>
        ))}
      </div>
    </SubSection>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 3: Color tokens (auto-generated)
// ---------------------------------------------------------------------------

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
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
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
      <code style={{ fontFamily: 'monospace', color: 'var(--text-primary)', fontSize: '0.6875rem', wordBreak: 'break-all' }}>
        {entry.name}
      </code>
      <div style={{ color: 'var(--text-muted)', fontSize: '0.6875rem', wordBreak: 'break-word' }}>
        {entry.comment || (entry.lightValue.length > 40 ? entry.lightValue.slice(0, 40) + '…' : entry.lightValue)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {isColor ? (
          <ColorSwatch value={entry.lightValue} theme="light" name={entry.name} />
        ) : isShadow ? (
          <div style={{ width: 36, height: 20, borderRadius: 6, background: 'var(--surface)', boxShadow: entry.lightValue, border: '1px solid var(--border)' }} />
        ) : isRadius ? (
          <div style={{ width: 36, height: 36, background: 'var(--accent)', borderRadius: entry.lightValue, opacity: 0.7 }} />
        ) : (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontStyle: 'italic' }}>
            {entry.lightValue.slice(0, 18)}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        {entry.darkValue && isColor ? (
          <ColorSwatch value={entry.darkValue} theme="dark" name={entry.name} />
        ) : entry.darkValue && isShadow ? (
          <div data-theme="dark" style={{ background: '#0f1117', padding: 4, borderRadius: 6 }}>
            <div style={{ width: 36, height: 20, borderRadius: 6, background: 'var(--surface)', boxShadow: entry.darkValue }} />
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
        Components MUST reference <code>var(--token)</code> for every color, surface, border, shadow, and radius.
        No hardcoded hex/rgba in component code.
      </p>
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
// Section 4: Typography
// ---------------------------------------------------------------------------

const TYPE_SCALE_META: Array<{
  sizeToken: string;
  weightToken: string | null;
  label: string;
  usage: string;
}> = [
  { sizeToken: '--type-display',     weightToken: '--type-weight-display',  label: 'Display',     usage: 'Splash / large hero moments' },
  { sizeToken: '--type-large-title', weightToken: null,                     label: 'Large Title', usage: 'Page greeting, section heroes (no weight token)' },
  { sizeToken: '--type-title',       weightToken: '--type-weight-title',    label: 'Title',       usage: 'Page headings, modal titles' },
  { sizeToken: '--type-headline',    weightToken: '--type-weight-headline', label: 'Headline',    usage: 'Section headings, panel headers, chapter names' },
  { sizeToken: '--type-reading',     weightToken: null,                     label: 'Reading',     usage: 'Long-form manuscript / script body (no weight token)' },
  { sizeToken: '--type-body',        weightToken: '--type-weight-body',     label: 'Body',        usage: 'Primary readable text — descriptions, list items' },
  { sizeToken: '--type-callout',     weightToken: null,                     label: 'Callout',     usage: 'Secondary info, sub-labels, form hints (no weight token)' },
  { sizeToken: '--type-caption',     weightToken: '--type-weight-caption',  label: 'Caption',     usage: 'Timestamps, IDs, table cell text, badges' },
  { sizeToken: '--type-micro',       weightToken: '--type-weight-micro',    label: 'Micro',       usage: 'All-caps labels, status chips, keyboard shortcuts' },
];

interface TypographySectionProps {
  allTokens: TokenEntry[];
}

const TypographySection: React.FC<TypographySectionProps> = ({ allTokens }) => {
  const tokenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const entry of allTokens) m.set(entry.name, entry.lightValue);
    return m;
  }, [allTokens]);

  return (
    <SectionWrapper id={SECTION_IDS.typography} title={SECTION_LABELS.typography}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Auto-parsed from <code>tokens.css</code> — values are live from the shipped file.
        UI body: <strong>Geist Variable</strong>; display/headings: <strong>Space Grotesk</strong>;
        reading column: <strong>Source Serif 4</strong>; code/logs: <strong>Geist Mono</strong>.
        All four self-hosted via <code>@fontsource</code>.
      </p>

      <SubSection title="Type scale (--type-*)">
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
            const sizeVal   = tokenMap.get(sizeToken)  ?? sizeToken;
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
                    ? weightVal
                    : <span style={{ fontStyle: 'italic', opacity: 0.7 }}>—</span>
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
    </SectionWrapper>
  );
};

// ---------------------------------------------------------------------------
// Section 5: Spacing & Radius
// ---------------------------------------------------------------------------

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

const RADIUS_META: Array<{ token: string; label: string }> = [
  { token: '--radius-compact', label: 'compact controls, badges (6px)' },
  { token: '--radius-button',  label: 'buttons, inputs (8px)' },
  { token: '--radius-card',    label: 'cards, panels (10px)' },
  { token: '--radius-panel',   label: 'large panels, drawers (18px)' },
  { token: '--radius-round',   label: 'pills, full-round (9999px)' },
];

interface SpacingSectionProps {
  allTokens: TokenEntry[];
}

const SpacingSection: React.FC<SpacingSectionProps> = ({ allTokens }) => {
  const tokenMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const entry of allTokens) m.set(entry.name, entry.lightValue);
    return m;
  }, [allTokens]);

  return (
    <SectionWrapper id={SECTION_IDS.spacing} title={SECTION_LABELS.spacing}>

      <SubSection title="Spacing scale (--space-*)">
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {SPACE_SCALE_META.map(({ token, px, label }) => {
            const liveVal = tokenMap.get(token) ?? px;
            return (
              <div key={token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ width: liveVal, height: 32, background: 'var(--accent)', opacity: 0.7, borderRadius: 3, minWidth: 4 }} />
                <code style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontFamily: 'monospace' }}>{token}</code>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{liveVal}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', maxWidth: 80, textAlign: 'center' }}>{label}</span>
              </div>
            );
          })}
        </div>
      </SubSection>

      <SubSection title="Radius tokens (--radius-*)">
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {RADIUS_META.map(({ token, label }) => {
            const liveVal = tokenMap.get(token) ?? '8px';
            return (
              <div key={token} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 52,
                    height: 52,
                    background: 'var(--accent)',
                    opacity: 0.75,
                    borderRadius: liveVal,
                  }}
                />
                <code style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontFamily: 'monospace' }}>{token}</code>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{liveVal}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', maxWidth: 90, textAlign: 'center' }}>{label}</span>
              </div>
            );
          })}
        </div>
      </SubSection>

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
                  <code style={{ fontSize: '0.6875rem', color: 'var(--accent)', fontFamily: 'monospace' }}>{token}</code>
                  <code style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{liveVal}</code>
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
// Section 6: Buttons
// ---------------------------------------------------------------------------

const ButtonsSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.buttons} title={SECTION_LABELS.buttons}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
      Flat buttons — no gradient, no glow, no translateY lift. Classes live in <code>components.css</code>.
      Minimum touch target for form controls is 44px (enforced in <code>base.css</code>); standard
      button padding achieves ~40px natural height.
    </p>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 16 }}>
      <SpecimenCard label=".btn-primary" caption="Rest; hover darkens; :disabled dims">
        <button className="btn-primary" type="button" style={{ fontSize: '0.875rem' }}>Primary</button>
      </SpecimenCard>
      <SpecimenCard label=".btn-primary :disabled" caption="Reduced opacity">
        <button className="btn-primary" type="button" disabled style={{ fontSize: '0.875rem' }}>Disabled</button>
      </SpecimenCard>
      <SpecimenCard label=".btn-ghost" caption="Transparent bg, accent text on hover">
        <button className="btn-ghost" type="button" style={{ fontSize: '0.875rem' }}>Ghost</button>
      </SpecimenCard>
      <SpecimenCard label=".btn-ghost :disabled">
        <button className="btn-ghost" type="button" disabled style={{ fontSize: '0.875rem' }}>Ghost Disabled</button>
      </SpecimenCard>
      <SpecimenCard label=".btn-glass" caption="Glassmorphism surface">
        <button className="btn-glass" type="button" style={{ fontSize: '0.875rem' }}>Glass</button>
      </SpecimenCard>
      <SpecimenCard label=".btn-success" caption="Green fill">
        <button className="btn-success" type="button" style={{ fontSize: '0.875rem' }}>Success</button>
      </SpecimenCard>
      <SpecimenCard label=".btn-danger" caption="Red fill">
        <button className="btn-danger" type="button" style={{ fontSize: '0.875rem' }}>Danger</button>
      </SpecimenCard>
      <SpecimenCard label=".btn-home" caption="Hero CTA">
        <button className="btn-home" type="button" style={{ fontSize: '0.875rem' }}>Home CTA</button>
      </SpecimenCard>
    </div>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 7: Forms & Focus
// ---------------------------------------------------------------------------

const FormsSection: React.FC = () => {
  const [switchOn, setSwitchOn] = useState(true);
  const [switchOff, setSwitchOff] = useState(false);
  const [selectVal, setSelectVal] = useState('opt-2');
  const [swatch, setSwatch] = useState('#3b82f6');

  return (
    <SectionWrapper id={SECTION_IDS.forms} title={SECTION_LABELS.forms}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.6 }}>
        Form controls have <code>min-height: 44px</code> enforced in <code>base.css</code> (WCAG 2.5.5).
        Focus ring is a <strong>double-ring</strong>: <code>3px solid var(--action-primary)</code> outline
        plus a 5px halo via <code>box-shadow</code> — keyboard-only, applied via <code>:focus-visible</code>.
      </p>

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

      <SubSection title="Switch (role=&quot;switch&quot;)">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <SpecimenCard label="On" caption="checked=true, --action-primary fill">
            <Switch checked={switchOn} onChange={setSwitchOn} label="Enable feature" />
          </SpecimenCard>
          <SpecimenCard label="Off" caption="checked=false, neutral fill">
            <Switch checked={switchOff} onChange={setSwitchOff} label="Enable feature" />
          </SpecimenCard>
          <SpecimenCard label="Disabled (on)" caption="pointer-events none">
            <Switch checked={true} onChange={() => {}} label="Locked on" disabled />
          </SpecimenCard>
        </div>
        <div style={{ marginTop: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          <code>Switch</code> is the canonical boolean toggle — dual-encoded by position + color.
          Under <code>prefers-reduced-motion</code> the knob translate snaps (no animation).
          44px min-height interactive target. Always pair with a visible <code>label</code>.
        </div>
      </SubSection>

      <SubSection title="SearchableSelect">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          <SpecimenCard label="SearchableSelect" caption="Filterable dropdown; selected option highlighted">
            <div style={{ width: '100%' }}>
              <SearchableSelect
                options={[
                  { id: 'opt-1', name: 'Studio Voice' },
                  { id: 'opt-2', name: 'Narrator — David' },
                  { id: 'opt-3', name: 'Character — Maren' },
                  { id: 'opt-4', name: 'XTTS Default' },
                ]}
                value={selectVal}
                onChange={setSelectVal}
                placeholder="Select a voice…"
              />
            </div>
          </SpecimenCard>
        </div>
      </SubSection>

      <SubSection title="ColorSwatchPicker">
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <SpecimenCard label="ColorSwatchPicker" caption="64-color palette + native color picker (pipette)">
            <ColorSwatchPicker value={swatch} onChange={setSwatch} />
          </SpecimenCard>
        </div>
      </SubSection>

      <SubSection title="VoiceDropzone">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
          <SpecimenCard label="VoiceDropzone" caption="Drag-and-drop voice sample upload">
            <div style={{ width: '100%' }}>
              <VoiceDropzone files={[]} onFilesChange={() => {}} />
            </div>
          </SpecimenCard>
        </div>
      </SubSection>
    </SectionWrapper>
  );
};

// ---------------------------------------------------------------------------
// Section 8: Status & Progress
// ---------------------------------------------------------------------------

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
  const PAST = NOW - 10000;

  const specimens: Array<{
    label: string;
    caption: string;
    chap: Chapter;
    job?: Job;
    queuePending?: boolean;
    done?: number;
    total?: number;
  }> = [
    { label: 'Unprocessed', caption: 'No audio — blank orb', chap: makeChap({ audio_status: 'unprocessed' }) },
    { label: 'Queued', caption: 'queue_pending=true, no active job', chap: makeChap({ audio_status: 'unprocessed' }), queuePending: true },
    { label: 'Running', caption: 'Active job → Loader2 + calm-pulse ring', chap: makeChap({ audio_status: 'processing' }), job: makeJob({ status: 'running' }) },
    { label: 'Partial (50%)', caption: '2 of 4 segments done', chap: makeChap({ audio_status: 'unprocessed' }), done: 2, total: 4 },
    { label: 'Done', caption: 'has_wav=true, in-sync', chap: makeChap({ audio_status: 'done', has_wav: true, audio_generated_at: NOW, text_last_modified: PAST }) },
    { label: 'Cached (M4A)', caption: 'has_m4a=true, no WAV — Archive icon', chap: makeChap({ audio_status: 'unprocessed', has_m4a: true }) },
    { label: 'Stale', caption: 'text changed after last render', chap: makeChap({ audio_status: 'done', has_wav: true, audio_generated_at: PAST, text_last_modified: NOW }) },
    { label: 'Error', caption: 'audio_status=error → X icon', chap: makeChap({ audio_status: 'error' }) },
  ];

  return (
    <SubSection title="StatusOrb">
      <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
        The canonical chapter status indicator. State is <strong>dual-encoded</strong> (icon + color).
        Never substitute a plain colored dot — <code>StatusOrb</code> is binding everywhere chapter status appears.
      </div>
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

const ProgressSpecimens: React.FC = () => (
  <SubSection title="PredictiveProgressBar">
    <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
      State is conveyed by label + right-side status/ETA text + fill — satisfying WCAG 1.4.1 without color alone.
      The fill receives <code>.is-running</code> when live-animated, wiring <code>@keyframes calm-pulse</code>.
      Terminus icon and status pill were removed (v1.12.0) as redundant.
    </div>
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

const StatusSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.status} title={SECTION_LABELS.status}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
      Live-mounted real components in static-prop states. See <code>progress-presentation.md</code> for
      the full <code>PredictiveProgressBar</code> contract.
    </p>
    <StatusOrbSpecimens />
    <ProgressSpecimens />
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 9: Overlays
// ---------------------------------------------------------------------------

const OverlaysSection: React.FC = () => {
  const [menuOpenState, setMenuOpenState] = useState(false);

  return (
    <SectionWrapper id={SECTION_IDS.overlays} title={SECTION_LABELS.overlays}>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.6 }}>
        Static, in-page previews of overlay patterns. The real floating layers (portaled modals, ActionMenu popovers)
        use <code>backdrop-filter: var(--blur-glass-strong)</code> only on floating layers — never on pinned chrome.
      </p>

      <SubSection title="Modal panel">
        <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
          <code>ConfirmModal</code> is the canonical destructive-confirm/alert dialog: <code>role="dialog"</code>,
          <code> aria-modal</code>, focus-trapped via <code>useFocusTrap</code>, Escape-to-cancel.
          Rendered here as a static in-page preview (not floating).
        </div>
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-lg)',
            padding: '1.5rem',
            maxWidth: 380,
          }}
          role="img"
          aria-label="Modal panel preview"
        >
          <div style={{ fontWeight: 700, fontSize: 'var(--type-title)', color: 'var(--text-primary)', marginBottom: 8 }}>
            Delete chapter?
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.55, marginBottom: '1.25rem' }}>
            This will permanently remove the chapter and its rendered audio. You cannot undo this action.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" type="button" style={{ fontSize: '0.875rem' }}>Cancel</button>
            <button className="btn-danger" type="button" style={{ fontSize: '0.875rem' }}>Delete</button>
          </div>
        </div>
      </SubSection>

      <SubSection title="ActionMenu (kebab / overflow)">
        <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          <code>ActionMenu</code> is the canonical overflow / "⋯" affordance. Portal-rendered, viewport-flip-aware,
          closes on outside-click and Escape. MUST be used for row/card action menus. Click the trigger below:
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ActionMenu
            onOpenChange={setMenuOpenState}
            items={[
              { label: 'Rename' },
              { label: 'Duplicate' },
              { label: 'Export' },
              { isDivider: true },
              { label: 'Delete', isDestructive: true },
            ]}
          />
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            {menuOpenState ? 'Menu open' : 'Click ⋯ to open menu'}
          </span>
        </div>
      </SubSection>

      <SubSection title="Toast (not yet a primitive)">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: '10px 16px',
            boxShadow: 'var(--shadow-md)',
            maxWidth: 360,
          }}
          role="img"
          aria-label="Toast preview"
        >
          <span style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>Chapter deleted</span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            style={{
              fontSize: '0.875rem',
              fontWeight: 600,
              color: 'var(--accent)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '2px 8px',
              borderRadius: 6,
            }}
          >
            Undo
          </button>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(5 s)</span>
        </div>
        <div style={{ marginTop: 6, fontSize: '0.8125rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Note: Toast is not yet a shared primitive — current inline <code>useState + setTimeout</code> in
          <code> App.tsx</code>. Until extracted, do not hand-roll bespoke toast implementations per page.
        </div>
      </SubSection>
    </SectionWrapper>
  );
};

// ---------------------------------------------------------------------------
// Section 10: Voice Pills
// ---------------------------------------------------------------------------

const ALL_CATEGORIES_ROW: PillSpec[] = [
  { label: 'Narration',  category: 'class',    key: 'class' },
  { label: 'Female',     category: 'gender',   key: 'gender' },
  { label: 'Adult',      category: 'age',      key: 'age' },
  { label: 'Warm',       category: 'extended', key: 'tone' },
  { label: 'audiobook',  category: 'tag',      key: 'tags' },
];

const OVERFLOW_ROW: PillSpec[] = [
  { label: 'Narration',  category: 'class',    key: 'class' },
  { label: 'Male',       category: 'gender',   key: 'gender' },
  { label: 'Senior',     category: 'age',      key: 'age' },
  { label: 'Gravelly',   category: 'extended', key: 'tone' },
  { label: 'Rich',       category: 'extended', key: 'timbre' },
  { label: 'podcast',    category: 'tag',      key: 'tags' },
];

const VoicePillsSection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.pills} title={SECTION_LABELS.pills}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
      Canonical voice-attribute pills (§5 Voice Attribute Pill Taxonomy). Each category maps to a fixed
      hue via <code>--pill-*</code> tokens; shape is always <code>--radius-round</code>. This is the
      sole place voice metadata renders as chips — never use plain text or custom badges.
    </p>

    <SubSection title="All five category tints">
      <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        One pill per category so all five <code>--pill-*</code> tint groups are visible simultaneously.
      </div>
      <div
        style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          display: 'inline-flex',
        }}
      >
        <VoicePillRow pills={ALL_CATEGORIES_ROW} />
      </div>
    </SubSection>

    <SubSection title="Overflow +N chip (max={3})">
      <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        When <code>max</code> is set and the pill count exceeds it, hidden pills collapse into a ghost
        "+N" chip. Clicking expands the full row.
      </div>
      <div
        style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          display: 'inline-flex',
        }}
      >
        <VoicePillRow pills={OVERFLOW_ROW} max={3} />
      </div>
    </SubSection>

    <SubSection title="UntaggedBadge">
      <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Shown in place of pills when a voice has no metadata. Warning-tinted, icon-dual-encoded.
      </div>
      <div
        style={{
          background: 'var(--surface-alt)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '1rem',
          display: 'inline-flex',
        }}
      >
        <UntaggedBadge />
      </div>
    </SubSection>

    <SubSection title="Individual pill variants">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {ALL_CATEGORIES_ROW.map((spec) => (
          <SpecimenCard key={spec.category} label={`category="${spec.category}"`} caption={`--pill-${spec.category}-*`} style={{ minWidth: 130 }}>
            <VoicePill spec={spec} />
          </SpecimenCard>
        ))}
      </div>
    </SubSection>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 11: Iconography
// ---------------------------------------------------------------------------

const ICON_GRID: Array<{ Icon: React.FC<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false' }>; name: string }> = [
  { Icon: Play,          name: 'Play' },
  { Icon: Pause,         name: 'Pause' },
  { Icon: Check,         name: 'Check' },
  { Icon: X,             name: 'X' },
  { Icon: AlertTriangle, name: 'AlertTriangle' },
  { Icon: Loader2,       name: 'Loader2' },
  { Icon: Settings,      name: 'Settings' },
  { Icon: Trash2,        name: 'Trash2' },
];

const CONTROL_ICON_MAP: Array<{ control: string; icon: string }> = [
  { control: 'Play / Resume',        icon: 'Play' },
  { control: 'Pause',                icon: 'Pause' },
  { control: 'Previous / jump start', icon: 'SkipBack' },
  { control: 'Next / jump end',      icon: 'SkipForward' },
  { control: 'Skip back N seconds',  icon: 'Rewind' },
  { control: 'Skip forward N seconds', icon: 'FastForward' },
  { control: 'Stop',                 icon: 'Square' },
  { control: 'Breadcrumb separator / drill-in', icon: 'ChevronRight' },
  { control: 'Dropdown / expander caret', icon: 'ChevronDown' },
  { control: 'Affirmative / completed', icon: 'Check' },
  { control: 'Dismiss / failed / close', icon: 'X' },
  { control: 'Theme: switch to dark', icon: 'Moon' },
  { control: 'Theme: switch to light', icon: 'Sun' },
  { control: 'Waveform ↔ bar toggle', icon: 'AudioLines' },
];

const IconographySection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.iconography} title={SECTION_LABELS.iconography}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: 1.6 }}>
      From <code>docs/specs/design-system.md §9</code>. <strong>Binding:</strong> every functional or decorative
      icon MUST be a <code>lucide-react</code> component. Unicode glyphs (<code>▶ ⏸ ▾ ✓ ›</code>) and emoji
      MUST NOT be used as icons — they do not inherit <code>currentColor</code>, stroke weight, or optical sizing.
    </p>

    <SubSection title="Representative icons (lucide-react)">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 12 }}>
        {ICON_GRID.map(({ Icon, name }) => (
          <div
            key={name}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 6,
              padding: '10px 8px',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-button)',
            }}
          >
            <Icon size={22} aria-hidden="true" />
            <code style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textAlign: 'center' }}>{name}</code>
          </div>
        ))}
      </div>
    </SubSection>

    <SubSection title="Control → icon mapping (binding)">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: 0,
          fontSize: '0.75rem',
          maxWidth: 560,
        }}
      >
        <div
          style={{
            display: 'contents',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)' }}>Control / meaning</div>
          <div style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', fontWeight: 700, color: 'var(--text-muted)' }}>lucide icon</div>
        </div>
        {CONTROL_ICON_MAP.map(({ control, icon }) => (
          <React.Fragment key={control}>
            <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
              {control}
            </div>
            <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--border)' }}>
              <code style={{ color: 'var(--accent)', fontFamily: 'monospace' }}>{icon}</code>
            </div>
          </React.Fragment>
        ))}
      </div>
    </SubSection>

    <SubSection title="Accessibility rules">
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        <strong>Icon-only controls</strong> MUST carry <code>aria-label</code>.
        A decorative icon paired with a visible text label SHOULD be <code>aria-hidden="true"</code>.
        Status dots (connection indicator, character-color markers) are intentionally NOT lucide — they are
        colored <strong>fills</strong>, not icons. Chapter status is always <code>StatusOrb</code>; a plain dot
        is never acceptable.
      </div>
    </SubSection>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 11: Accessibility
// ---------------------------------------------------------------------------

const UI_STATES: Array<{ state: string; guidance: string }> = [
  {
    state: 'loading',
    guidance: 'Show a spinner (lucide Loader2 + .animate-spin) with a brief explanation — "Loading chapters…" not a bare spinner. Spinning is exempt from reduced-motion guard.',
  },
  {
    state: 'empty',
    guidance: 'Explain what is empty and what the user can do next. "No chapters yet — add your first chapter to get started." Never leave a blank container.',
  },
  {
    state: 'error',
    guidance: 'State what failed and offer a recovery action. Use --error-text on --error-tint-bg, dual-encoded with AlertTriangle icon + text. Never color alone.',
  },
  {
    state: 'reconnecting',
    guidance: 'Signal that the WebSocket is attempting to reconnect. Show a spinner + "Reconnecting…" message. Do not block the UI; show inline near the affected area.',
  },
  {
    state: 'recovered',
    guidance: 'Briefly confirm the connection was restored ("Reconnected"). Auto-dismiss after a few seconds. Also covers stale/queued/rendering/rendered/failed markers.',
  },
];

const AccessibilitySection: React.FC = () => (
  <SectionWrapper id={SECTION_IDS.accessibility} title={SECTION_LABELS.accessibility}>
    <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1.25rem', lineHeight: 1.6 }}>
      Target: <strong>WCAG 2.2 AA</strong> in both themes. Binding rules from
      <code> docs/specs/design-system.md §8</code>.
    </p>

    <SubSection title="The five UI states (§8.4 — binding)">
      <div style={{ marginBottom: 8, fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        Every meaningful screen change MUST account for all five states. Each must be user-meaningful and
        testable by role/label/visible behavior — not a bare spinner.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {UI_STATES.map((item) => {
          const guidance = (item as { state: string; guidance?: string; body?: string }).guidance
            ?? (item as { state: string; body?: string }).body
            ?? '';
          return (
            <div
              key={item.state}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr',
                gap: 12,
                padding: '8px 12px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-button)',
                alignItems: 'flex-start',
              }}
            >
              <code
                style={{
                  fontWeight: 700,
                  fontSize: '0.8125rem',
                  color: 'var(--action-primary, var(--accent))',
                  fontFamily: 'monospace',
                }}
              >
                {item.state}
              </code>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {guidance}
              </span>
            </div>
          );
        })}
      </div>
    </SubSection>

    <SubSection title="Focus ring (§8.1)">
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>
        <strong>Double-ring</strong> on <code>:focus-visible</code>: <code>outline: 3px solid var(--action-primary)</code>
        plus a 5px <code>box-shadow</code> halo (light/dark variant). Pointer interactions suppress it;
        keyboard-only shows it. New interactive elements MUST keep a visible focus ring — never apply a
        blanket <code>outline: none</code>.
      </div>
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          padding: '10px 14px',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-button)',
          maxWidth: 360,
        }}
      >
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Tab to see the ring:</span>
        <button
          className="btn-primary"
          type="button"
          style={{ fontSize: '0.875rem' }}
        >
          Focus me
        </button>
        <GlassInput placeholder="Or focus here" style={{ width: 120 } as React.CSSProperties} />
      </div>
    </SubSection>

    <SubSection title="Contrast (§8.3)">
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        All key text/surface/state/pill pairs are computed in <code>docs/specs/design-system.md §2.4</code>.
        All pass AA (most AAA). Exceptions: <code>--text-subtle</code> is chrome/large-only in both themes —
        MUST NOT carry body text. New colors MUST be added as tokens with composited contrast meeting AA in
        both light and dark.
      </div>
    </SubSection>

    <SubSection title="Reduced motion (§8.5)">
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        A global <code>prefers-reduced-motion</code> guard is the <strong>first rule in base.css</strong> —
        zeroes all animation/transition durations globally. <strong>Essential busy indicators</strong> are
        re-enabled inside the guard at a calm cadence:
        <code> .is-running</code> (calm-pulse via <code>--pulse-duration: 3s</code>),
        <code> .animate-spin</code> (1.6 s), <code>.animate-spin-slow</code> (3 s), and the indeterminate
        progress barber-pole (1.2 s). Freezing these would leave a reduced-motion user unable to distinguish
        "working" from "hung". All other decorative CSS transitions are suppressed.
      </div>
    </SubSection>

    <SubSection title="44px touch targets (§8.4)">
      <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Form controls (<code>input</code>, <code>select</code>, <code>textarea</code>) have
        <code> min-height: 44px</code> enforced in <code>base.css</code>. The blanket button
        <code> min-height</code> was removed (it deformed compact icon buttons); standard button
        padding achieves ~40px natural height. New form controls MUST NOT undercut 44px.
        Icon-only compact buttons remain a tracked follow-up for explicit 44px hit-area expansion.
      </div>
    </SubSection>
  </SectionWrapper>
);

// ---------------------------------------------------------------------------
// Section 12: Theme side-by-side
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
  { label: 'Foundations', keys: ['principles', 'brand', 'colors', 'typography', 'spacing'] },
  { label: 'Components',  keys: ['buttons', 'forms', 'status', 'overlays', 'pills', 'iconography'] },
  { label: 'Standards',   keys: ['accessibility', 'theme'] },
];

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
          Design System
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

// ---------------------------------------------------------------------------
// Root page
// ---------------------------------------------------------------------------

export const StyleguidePage: React.FC = () => {
  const entries = useMemo(() => parseTokens(tokensCss), []);
  const sectionIds = useMemo(() => Object.values(SECTION_IDS) as string[], []);
  const active = useActiveSection(sectionIds);

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
              Audiobook Studio — Design System
            </h1>
            <p style={{ fontSize: '0.9375rem', color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 680 }}>
              This is the authoritative visual source of truth for building UI in this app.
              Every token, type rule, and component state shown here is the adopted standard.
              Code that contradicts it is a bug. Tokens and type auto-derive from{' '}
              <code>tokens.css</code> (zero drift) and this page aligns with{' '}
              <code>docs/specs/design-system.md</code>.
            </p>
          </div>

          <PrinciplesSection />
          <BrandSection />
          <ColorTokensSection entries={entries} />
          <TypographySection allTokens={entries} />
          <SpacingSection allTokens={entries} />
          <ButtonsSection />
          <FormsSection />
          <StatusSection />
          <OverlaysSection />
          <VoicePillsSection />
          <IconographySection />
          <AccessibilitySection />
          <ThemeSection />
        </div>
      </div>
    </div>
  );
};
