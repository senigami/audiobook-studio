/**
 * siteMockup/shared.tsx — shared primitive components and data
 */
import React from 'react';

export const Row: React.FC<{ gap?: number; children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }> = ({
  gap = 8,
  children,
  style,
  onClick,
}) => (
  <div onClick={onClick} style={{ display: 'flex', gap, alignItems: 'stretch', ...style }}>
    {children}
  </div>
);

export const Col: React.FC<{ gap?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  gap = 8,
  children,
  style,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
    {children}
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; muted?: boolean; style?: React.CSSProperties }> = ({ children, muted, style }) => (
  <div
    style={{
      fontSize: '0.6rem',
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase',
      color: muted ? 'var(--text-muted)' : 'var(--text-secondary)',
      padding: '4px 0 2px',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Chip: React.FC<{ children: React.ReactNode; active?: boolean; color?: string; onClick?: () => void }> = ({
  children,
  active,
  color,
  onClick,
}) => (
  <span
    onClick={onClick}
    style={{
      cursor: onClick ? 'pointer' : 'default',
      fontSize: '0.6rem',
      padding: '2px 7px',
      borderRadius: 20,
      border: `1px solid ${color ? color + '55' : active ? 'var(--accent)' : 'var(--border)'}`,
      background: color ? color + '22' : active ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
      color: color ?? (active ? 'var(--accent)' : 'var(--text-secondary)'),
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
    }}
  >
    {children}
  </span>
);

export const Btn: React.FC<{
  children: React.ReactNode;
  primary?: boolean;
  small?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  disabled?: boolean;
}> = ({ children, primary, small, onClick, style, disabled }) => (
  <div
    onClick={disabled ? undefined : onClick}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: small ? '0.6rem' : '0.72rem',
      fontWeight: 600,
      padding: small ? '2px 7px' : '5px 14px',
      borderRadius: 6,
      border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
      background: primary ? 'var(--accent)' : 'var(--surface-alt)',
      color: primary ? '#fff' : 'var(--text-primary)',
      cursor: (onClick && !disabled) ? 'pointer' : 'default',
      whiteSpace: 'nowrap',
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}
  >
    {children}
  </div>
);

// Small dashed-border muted pill for future/planned features
export const PlannedChip: React.FC = () => (
  <span
    style={{
      fontSize: '0.55rem',
      padding: '1px 6px',
      borderRadius: 20,
      border: '1px dashed var(--text-muted)',
      background: 'transparent',
      color: 'var(--text-muted)',
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      fontStyle: 'italic',
      flexShrink: 0,
    }}
  >
    planned
  </span>
);

export const ProgressBar: React.FC<{ pct: number; height?: number; shimmer?: boolean }> = ({
  pct,
  height = 4,
  shimmer,
}) => (
  <div
    style={{
      height,
      borderRadius: 2,
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)',
      overflow: 'hidden',
      flex: 1,
    }}
  >
    <div
      style={{
        width: `${pct}%`,
        height: '100%',
        background: shimmer
          ? 'linear-gradient(90deg, var(--accent) 60%, #a78bfa 100%)'
          : 'var(--accent)',
        borderRadius: 2,
        opacity: shimmer ? 0.85 : 1,
      }}
    />
  </div>
);

// Pill for status
export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    Drafting: '#6366f1',
    Rendering: '#f59e0b',
    Published: '#22c55e',
    Review: '#ec4899',
    Casting: '#8b5cf6',
    Studio: '#0ea5e9',
  };
  const c = colors[status] ?? '#6b7280';
  return <Chip color={c}>{status}</Chip>;
};

// Fake waveform SVG (bar-style)
export const WaveformSvg: React.FC<{ height?: number }> = ({ height = 40 }) => {
  const bars = [4,8,14,20,28,18,24,30,22,16,26,32,24,18,12,20,28,22,16,10,18,26,30,20,14,8,16,24,18,10];
  const total = bars.length;
  const w = 6;
  const gap = 2;
  const svgW = total * (w + gap);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${svgW} ${height}`} preserveAspectRatio="xMidYMid meet">
      {bars.map((h, i) => (
        <rect
          key={i}
          x={i * (w + gap)}
          y={(height - h) / 2}
          width={w}
          height={h}
          rx={2}
          fill={i > 8 && i < 18 ? 'var(--accent)' : 'var(--border)'}
          opacity={i > 8 && i < 18 ? 0.9 : 0.5}
        />
      ))}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Shared data

export const IN_FLIGHT_JOBS = [
  { title: 'The Whispering Vale — Ch 7', engine: 'XTTS', pct: 64, eta: '~12m left', segs: '3/7' },
  { title: 'Iron Meridian — Ch 3', engine: 'Voxtral', pct: 18, eta: '~34m left', segs: '1/9' },
];
export const QUEUED_JOBS = [
  { title: 'Echoes of Ember — Ch 5', engine: 'XTTS' },
  { title: 'The Whispering Vale — Ch 8', engine: 'XTTS' },
];

// Chapter render progress percentages (indexed by ch.n - 1) — shared with rail
export const CHAPTER_RENDER_PCT = [100, 100, 80, 60, 30, 0, 0];

export const CHAPTERS = [
  { n: 1, title: 'The Hollow Road', words: 2814, status: 'Published' },
  { n: 2, title: 'Ember in the Dark', words: 3102, status: 'Published' },
  { n: 3, title: 'Voices Underground', words: 2650, status: 'Review' },
  { n: 4, title: 'A Vale at Dusk', words: 3440, status: 'Studio' },
  { n: 5, title: 'Silver and Stone', words: 2980, status: 'Studio' },
  { n: 6, title: "The Warden's Keep", words: 3210, status: 'Drafting' },
  { n: 7, title: 'Whispers at Threshold', words: 2775, status: 'Drafting' },
];

export type BookTab = 'Manuscript' | 'Casting' | 'Studio' | 'Review' | 'Publish';
export const BOOK_TABS: BookTab[] = ['Manuscript', 'Casting', 'Studio', 'Review', 'Publish'];
export const BOOK_STAGE_LINKS: BookTab[] = ['Manuscript', 'Casting', 'Studio', 'Review', 'Publish'];

export type RailDest = 'Library' | 'Voices' | 'Activity' | 'Engines' | 'Integrations' | 'Settings';

// Shared header chip styles used in EnginesPane
export const statusChip = (color: string) => ({
  fontSize: '0.52rem', fontWeight: 700, padding: '1px 6px', borderRadius: 4,
  border: `1px solid ${color}`, color, background: 'transparent',
  display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' as const,
});

export const onPill = {
  fontSize: '0.52rem', fontWeight: 700, padding: '1px 7px', borderRadius: 10,
  background: 'var(--accent)', color: '#fff', display: 'inline-flex', alignItems: 'center',
  whiteSpace: 'nowrap' as const,
};
