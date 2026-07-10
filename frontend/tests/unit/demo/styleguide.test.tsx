/**
 * styleguide.test.tsx — tests for parseTokens and StyleguidePage.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { parseTokens } from '@/demo/styleguide/parseTokens';

// ---------------------------------------------------------------------------
// Mock CSS module imports used by StyleguidePage
// ---------------------------------------------------------------------------

vi.mock('@/theme/tokens.css?raw', () => ({
  default: `:root {
  --bg: #f8fafc;
  --surface: #ffffff;
  --accent: #2b6eff; /* brand blue */
  --success: #10b981;
  --border: #e6eaf2;
  --shadow-md: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  --radius-card: 12px;
}

[data-theme="dark"] {
  --bg: #0f1117;
  --surface: #1a1d27;
  --accent: #2b6eff;
  --border: #2d3148;
}`,
}));

// Mock GlassInput so we don't pull in form styles that may not be loaded
vi.mock('@/components/forms/GlassInput', () => ({
  GlassInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input data-testid="glass-input" {...props} />
  ),
}));

// Mock SearchableSelect
vi.mock('@/components/forms/SearchableSelect', () => ({
  default: (props: { placeholder?: string; value?: string }) => (
    <div data-testid="searchable-select">{props.placeholder ?? props.value}</div>
  ),
}));

// Mock ColorSwatchPicker
vi.mock('@/components/forms/ColorSwatchPicker', () => ({
  ColorSwatchPicker: (props: { value?: string }) => (
    <div data-testid="color-swatch-picker">{props.value}</div>
  ),
}));

// Mock VoiceDropzone
vi.mock('@/components/forms/VoiceDropzone', () => ({
  VoiceDropzone: () => <div data-testid="voice-dropzone">VoiceDropzone</div>,
}));

// Mock VoicePills
vi.mock('@/pages/Voices/components/VoicePills', () => ({
  VoicePill: (props: { spec?: { label?: string } }) => (
    <span data-testid="voice-pill">{props.spec?.label}</span>
  ),
  VoicePillRow: (props: { pills?: Array<{ label: string }> }) => (
    <div data-testid="voice-pill-row">
      {props.pills?.map((p, i) => <span key={i}>{p.label}</span>)}
    </div>
  ),
  UntaggedBadge: () => <span data-testid="untagged-badge">missing attributes</span>,
}));

// Mock PredictiveProgressBar
vi.mock(
  '@/components/progress/PredictiveProgressBar/PredictiveProgressBar',
  () => ({
    PredictiveProgressBar: (props: { label?: string }) => (
      <div data-testid="progress-bar">{props.label ?? 'progress'}</div>
    ),
  }),
);

// Mock Switch (avoids CSS class dependency)
vi.mock('@/components/ui/Switch', () => ({
  Switch: (props: { label?: string; checked?: boolean }) => (
    <button type="button" role="switch" aria-checked={props.checked}>
      {props.label}
    </button>
  ),
}));

// Mock ActionMenu (avoids portal/framer-motion dependency)
vi.mock('@/components/ui/ActionMenu', () => ({
  ActionMenu: () => <button type="button" aria-label="More actions">⋯</button>,
}));

// Mock BrandLogo
vi.mock('@/components/layout/BrandLogo', () => ({
  BrandLogo: (props: { stacked?: boolean; showIcon?: boolean }) => (
    <div data-testid="brand-logo" data-stacked={props.stacked} data-show-icon={props.showIcon}>
      Audiobook Studio
    </div>
  ),
}));

// Mock StatusOrb
vi.mock('@/components/ui/StatusOrb', () => ({
  StatusOrb: () => <div data-testid="status-orb" />,
}));

// Dynamic import after mocks are registered
const { StyleguidePage } = await import('@/demo/styleguide/StyleguidePage');

// ---------------------------------------------------------------------------
// Test 1 — parseTokens: fixture string
// ---------------------------------------------------------------------------

const FIXTURE_CSS = `
:root {
  --bg: #f8fafc;
  --surface: #ffffff; /* main surface */
  --accent: #2b6eff;
  --shadow-md: 0 4px 6px rgba(0,0,0,0.1);
}

[data-theme="dark"] {
  --bg: #0f1117;
  --surface: #1a1d27;
  --dark-only: #ff0000;
}
`;

describe('parseTokens', () => {
  it('parses light tokens from :root block', () => {
    const entries = parseTokens(FIXTURE_CSS);
    const bg = entries.find(e => e.name === '--bg');
    expect(bg).toBeDefined();
    expect(bg!.lightValue).toBe('#f8fafc');
  });

  it('attaches dark values from [data-theme="dark"] to matching tokens', () => {
    const entries = parseTokens(FIXTURE_CSS);
    const surface = entries.find(e => e.name === '--surface');
    expect(surface).toBeDefined();
    expect(surface!.lightValue).toBe('#ffffff');
    expect(surface!.darkValue).toBe('#1a1d27');
  });

  it('captures inline comments', () => {
    const entries = parseTokens(FIXTURE_CSS);
    const surface = entries.find(e => e.name === '--surface');
    expect(surface!.comment).toBe('main surface');
  });

  it('includes dark-only tokens with empty lightValue', () => {
    const entries = parseTokens(FIXTURE_CSS);
    const darkOnly = entries.find(e => e.name === '--dark-only');
    expect(darkOnly).toBeDefined();
    expect(darkOnly!.lightValue).toBe('');
    expect(darkOnly!.darkValue).toBe('#ff0000');
  });
});

// ---------------------------------------------------------------------------
// Test 2 — StyleguidePage renders the 12 canonical section headings
// ---------------------------------------------------------------------------

describe('StyleguidePage section headings', () => {
  it('renders all 13 canonical section headings', () => {
    render(<StyleguidePage />);

    // Each label appears in both the sticky nav and the section h2 — use getAllByText
    expect(screen.getAllByText(/1\. Principles/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/2\. Brand & Identity/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/3\. Color/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/4\. Typography/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/5\. Spacing & Radius/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/6\. Buttons/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/7\. Forms & Focus/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/8\. Status & Progress/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/9\. Overlays/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/10\. Voice Pills/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/11\. Iconography/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/12\. Accessibility/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/13\. Theme/i).length).toBeGreaterThanOrEqual(1);

    // Confirm h2 headings are present by role
    const headings = screen.getAllByRole('heading', { level: 2 });
    const headingTexts = headings.map(h => h.textContent ?? '');
    expect(headingTexts.some(t => /Principles/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Brand.*Identity/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Color/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Typography/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Spacing.*Radius/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Buttons/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Forms.*Focus/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Status.*Progress/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Overlays/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Voice Pills/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Iconography/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Accessibility/i.test(t))).toBe(true);
    expect(headingTexts.some(t => /Theme/i.test(t))).toBe(true);
  });

  it('does NOT render removed meta sections', () => {
    render(<StyleguidePage />);
    // Old title "Design Spec Sheet" should be gone
    expect(screen.queryByText(/Design Spec Sheet/i)).toBeNull();
    // Old "Proposed Directions" section heading should be gone
    expect(screen.queryByRole('heading', { level: 2, name: /Proposed Directions/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Typography section renders the type scale
// ---------------------------------------------------------------------------

describe('StyleguidePage typography shows shipped token scale', () => {
  it('renders the type scale without stale "proposed" framing', () => {
    render(<StyleguidePage />);

    // Type scale header is present
    expect(screen.getAllByText(/Type scale/i).length).toBeGreaterThan(0);

    // Stale framing that claimed tokens did not exist is gone
    expect(screen.queryByText(/do not exist yet/i)).toBeNull();
    expect(screen.queryByText(/zero type tokens/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 5 — Proposals / chips are fully removed
// ---------------------------------------------------------------------------

describe('StyleguidePage proposals removed', () => {
  it('renders no PROPOSED chips', () => {
    render(<StyleguidePage />);
    // The ProposedChip text "PROPOSED" (exact all-caps) should be absent
    expect(screen.queryByText('PROPOSED')).toBeNull();
  });

  it('renders no OWNER DECISION NEEDED chips', () => {
    render(<StyleguidePage />);
    expect(screen.queryByText(/OWNER DECISION NEEDED/i)).toBeNull();
  });

  it('renders no U15/U16/U8/U1 proposal cards', () => {
    render(<StyleguidePage />);
    expect(screen.queryByText(/U15.*Navigation/i)).toBeNull();
    expect(screen.queryByText(/U16.*Unified Audio Player/i)).toBeNull();
    expect(screen.queryByText(/U8.*Voice Card/i)).toBeNull();
    expect(screen.queryByText(/U1.*Undo Toast/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test 6 — Theme side-by-side renders both data-theme wrappers
// ---------------------------------------------------------------------------

describe('StyleguidePage theme side-by-side', () => {
  it('renders both data-theme="light" and data-theme="dark" wrappers', () => {
    const { container } = render(<StyleguidePage />);
    const lightWrapper = container.querySelector('[data-theme="light"]');
    const darkWrapper = container.querySelector('[data-theme="dark"]');
    expect(lightWrapper).not.toBeNull();
    expect(darkWrapper).not.toBeNull();
  });
});

