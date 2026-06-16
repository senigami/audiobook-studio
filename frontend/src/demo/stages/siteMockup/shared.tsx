/**
 * siteMockup/shared.tsx — shared primitive components and data
 */
import React from 'react';
import {
  BookOpen,
  Mic,
  Volume2,
  User,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Clock,
  Cloud,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Layout primitives

type DivPrimitiveProps = React.HTMLAttributes<HTMLDivElement> & {
  gap?: number;
  children: React.ReactNode;
};

export const Row: React.FC<DivPrimitiveProps> = ({
  gap = 8,
  children,
  style,
  onClick,
  ...rest
}) => (
  <div {...rest} onClick={onClick} style={{ display: 'flex', gap, alignItems: 'stretch', ...style }}>
    {children}
  </div>
);

export const Col: React.FC<DivPrimitiveProps> = ({
  gap = 8,
  children,
  style,
  onClick,
  ...rest
}) => (
  <div {...rest} onClick={onClick} style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
    {children}
  </div>
);

export const Label: React.FC<{ children: React.ReactNode; muted?: boolean; style?: React.CSSProperties }> = ({ children, muted, style }) => (
  <div
    style={{
      fontSize: 'var(--type-micro)',
      fontWeight: 'var(--type-weight-micro)' as unknown as number,
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

export const PaneHeader: React.FC<{
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}> = ({ eyebrow, title, subtitle, actions, meta }) => (
  <div className="ns-pane-header">
    <Col gap={4} style={{ minWidth: 0, flex: 1 }}>
      {eyebrow && (
        <div
          style={{
            fontSize: 'var(--type-micro)',
            fontWeight: 800,
            letterSpacing: 'var(--tracking-wide)',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
          }}
        >
          {eyebrow}
        </div>
      )}
      <Row gap={8} style={{ alignItems: 'center', minWidth: 0, flexWrap: 'wrap' }}>
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--type-title)',
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: 'var(--tracking-tight)',
            lineHeight: 'var(--leading-tight)',
          }}
        >
          {title}
        </h2>
        {meta}
      </Row>
      {subtitle && (
        <p
          style={{
            margin: 0,
            fontSize: 'var(--type-caption)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--leading-normal)',
            maxWidth: 640,
          }}
        >
          {subtitle}
        </p>
      )}
    </Col>
    {actions && (
      <Row className="ns-pane-header-actions" gap={6} style={{ alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        {actions}
      </Row>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Card / Panel elevation wrappers

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement> & { interactive?: boolean }> = ({
  children,
  style,
  className,
  interactive,
  ...rest
}) => (
  <div
    {...rest}
    className={['ns-card', interactive ? 'ns-interactive' : '', className].filter(Boolean).join(' ')}
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-sm)',
      ...style,
    }}
  >
    {children}
  </div>
);

export const Panel: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ children, style, ...rest }) => (
  <div
    {...rest}
    style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-panel)',
      boxShadow: 'var(--shadow-md)',
      ...style,
    }}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Chip / pill family

/**
 * Generic chip — active or neutral variant.
 * The `color` prop is a legacy escape hatch (hex string); prefer SemanticChip or VoiceAttrPill.
 * When `color` is supplied the chip uses token-driven tints derived from the hex fallback pattern.
 */
export const Chip: React.FC<{
  children: React.ReactNode;
  active?: boolean;
  /** @deprecated prefer SemanticChip with a variant */
  color?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}> = ({
  children,
  active,
  color,
  onClick,
  style,
}) => {
  const chipStyle: React.CSSProperties = {
    cursor: onClick ? 'pointer' : 'default',
    fontSize: 'var(--type-micro)',
    padding: '2px 7px',
    borderRadius: 'var(--radius-round)',
    border: `1px solid ${color ? color + '55' : active ? 'var(--accent-tint-border)' : 'var(--border)'}`,
    background: color ? color + '22' : active ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
    color: color ?? (active ? 'var(--accent)' : 'var(--text-secondary)'),
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: 'inherit',
    ...style,
  };

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={chipStyle}>
        {children}
      </button>
    );
  }

  return <span style={chipStyle}>{children}</span>;
};

/** Semantic status chip — maps a variant to design-system tint tokens. */
export type ChipVariant = 'success' | 'warning' | 'error' | 'cloud' | 'accent' | 'neutral';

const SEMANTIC_CHIP_STYLES: Record<ChipVariant, React.CSSProperties> = {
  success: {
    background: 'var(--success-tint-bg)',
    border: '1px solid var(--success)',
    color: 'var(--success-text)',
  },
  warning: {
    background: 'var(--warning-tint-bg)',
    border: '1px solid var(--warning-tint-border)',
    color: 'var(--warning-text)',
  },
  error: {
    background: 'var(--error-tint-bg)',
    border: '1px solid var(--error-tint-border)',
    color: 'var(--error-text-strong)',
  },
  cloud: {
    background: 'var(--cloud-tint-bg)',
    border: '1px solid var(--cloud-color)',
    color: 'var(--cloud-color)',
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

export const SemanticChip: React.FC<{ children: React.ReactNode; variant?: ChipVariant; onClick?: () => void }> = ({
  children,
  variant = 'neutral',
  onClick,
}) => {
  const chipStyle: React.CSSProperties = {
    cursor: onClick ? 'pointer' : 'default',
    fontSize: 'var(--type-micro)',
    fontWeight: 'var(--type-weight-micro)' as unknown as number,
    padding: '2px 7px',
    borderRadius: 'var(--radius-round)',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    fontFamily: 'inherit',
    ...SEMANTIC_CHIP_STYLES[variant],
  };

  if (onClick) {
    return (
      <button type="button" onClick={onClick} style={chipStyle}>
        {children}
      </button>
    );
  }

  return <span style={chipStyle}>{children}</span>;
};

/** Voice attribute pill — maps a category to pill token family. */
export type VoiceAttrCategory = 'class' | 'gender' | 'age' | 'extended' | 'tag';

export const VoiceAttrPill: React.FC<{ children: React.ReactNode; category?: VoiceAttrCategory }> = ({
  children,
  category = 'tag',
}) => (
  <span
    style={{
      fontSize: 'var(--type-micro)',
      padding: '2px 7px',
      borderRadius: 'var(--radius-round)',
      background: `var(--pill-${category}-bg)`,
      border: `1px solid var(--pill-${category}-border)`,
      color: `var(--pill-${category}-text)`,
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
    }}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// StatusPill — status → semantic variant mapping (no hex)

const STATUS_VARIANT: Record<string, ChipVariant> = {
  Drafting: 'neutral',
  Rendering: 'warning',
  Published: 'success',
  Review: 'cloud',    // pink-like closest is cloud (sky-blue); acceptable demo approximation
  Casting: 'accent',
  Studio: 'accent',
};

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const variant: ChipVariant = STATUS_VARIANT[status] ?? 'neutral';
  return <SemanticChip variant={variant}>{status}</SemanticChip>;
};

// ---------------------------------------------------------------------------
// StatusOrb — SVG circumferential progress ring (design-system §6)

export type OrbStatus = 'queued' | 'preparing' | 'running' | 'done' | 'failed' | 'idle';

interface StatusOrbProps {
  status?: OrbStatus;
  /** Render progress 0–1 */
  progress?: number;
  size?: number;
}

const ORB_TOKEN: Record<OrbStatus, { fill: string; ring: string }> = {
  idle:      { fill: 'var(--surface-alt)',    ring: 'var(--border)' },
  queued:    { fill: 'var(--warning-tint-bg)', ring: 'var(--warning-tint-border)' },
  preparing: { fill: 'var(--warning-tint-bg)', ring: 'var(--warning-tint-border)' },
  running:   { fill: 'var(--accent-tint-bg)', ring: 'var(--accent)' },
  done:      { fill: 'var(--success-tint-bg)', ring: 'var(--success)' },
  failed:    { fill: 'var(--error-tint-bg)',  ring: 'var(--error)' },
};

export const StatusOrb: React.FC<StatusOrbProps> = ({ status = 'idle', progress = 0, size = 16 }) => {
  const { fill, ring } = ORB_TOKEN[status];
  const cx = size / 2;
  const cy = size / 2;
  const orbR = size * 0.3;
  const ringR = size * 0.42;
  const circumference = 2 * Math.PI * ringR;
  const dashoffset = circumference - progress * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Track ring */}
      <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="var(--border)" strokeWidth={1.5} opacity={0.4} />
      {/* Progress arc */}
      {progress > 0 && (
        <circle
          cx={cx} cy={cy} r={ringR}
          fill="none"
          stroke={ring}
          strokeWidth={1.5}
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.4s ease' }}
        />
      )}
      {/* Orb fill */}
      <circle cx={cx} cy={cy} r={orbR} fill={fill} stroke={ring} strokeWidth={1} />
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Button

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  primary?: boolean;
  small?: boolean;
};

export const Btn: React.FC<ButtonProps> = ({
  children,
  primary,
  small,
  onClick,
  style,
  className,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    className={['ns-btn', primary ? 'ns-btn-primary' : '', className].filter(Boolean).join(' ')}
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 0,
      fontFamily: 'inherit',
      fontSize: small ? 'var(--type-micro)' : 'var(--type-caption)',
      fontWeight: 600,
      padding: small ? '2px 7px' : '5px 14px',
      borderRadius: 'var(--radius-button)',
      border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
      background: primary ? 'var(--accent)' : 'var(--surface-alt)',
      color: primary ? 'var(--text-on-accent)' : 'var(--text-primary)',
      cursor: (onClick && !disabled) ? 'pointer' : 'default',
      whiteSpace: 'nowrap',
      opacity: disabled ? 0.5 : 1,
      appearance: 'none',
      ...style,
    }}
    {...rest}
  >
    {children}
  </button>
);

// ---------------------------------------------------------------------------
// ProgressBar

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
          ? 'linear-gradient(90deg, var(--accent) 60%, var(--accent-tint-border) 100%)'
          : 'var(--accent)',
        borderRadius: 2,
        opacity: shimmer ? 0.85 : 1,
      }}
    />
  </div>
);

// ---------------------------------------------------------------------------
// WaveformSvg — uses token colors, not hardcoded fills

export const WaveformSvg: React.FC<{ height?: number; isPlaying?: boolean; fill?: boolean }> = ({ height = 40, isPlaying, fill }) => {
  const bars = [4,8,14,20,28,18,24,30,22,16,26,32,24,18,12,20,28,22,16,10,18,26,30,20,14,8,16,24,18,10];
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTick(t => (t + 1) % 100);
    }, 80);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const total = bars.length;
  const w = 6;
  const gap = 2;
  const svgW = total * (w + gap);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${svgW} ${height}`} preserveAspectRatio={fill ? 'none' : 'xMidYMid meet'}>
      {bars.map((h, i) => {
        const currentHeight = isPlaying
          ? Math.max(3, h * (0.5 + 0.5 * Math.sin((i + tick) * 0.4)))
          : h;
        return (
          <rect
            key={i}
            x={i * (w + gap)}
            y={(height - currentHeight) / 2}
            width={w}
            height={currentHeight}
            rx={2}
            fill={i > 8 && i < 18 ? 'var(--color-wave-progress)' : 'var(--color-wave)'}
            opacity={i > 8 && i < 18 ? 0.9 : 0.5}
            style={{ transition: isPlaying ? 'height 0.08s ease, y 0.08s ease' : 'none' }}
          />
        );
      })}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// BookCover — audiobook artwork with deterministic fallback

export const BookCover: React.FC<{
  title: string;
  src?: string;
  aspect?: 'square' | 'book';
  size?: number;
  style?: React.CSSProperties;
}> = ({ title, src, aspect = 'square', size = 48, style }) => {
  const initial = (title ?? '?')[0].toUpperCase();
  const builtInSrc = src ?? (aspect === 'book' ? DEMO_BOOK_COVER_BOOK_SRC[title] : DEMO_BOOK_COVER_SRC[title]);
  // Deterministic per-title hue so each book reads as distinct cover art.
  let hash = 0;
  for (let i = 0; i < (title ?? '').length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return (
    <div
      className={`ns-book-cover ns-book-cover--${aspect}${builtInSrc ? ' ns-book-cover--art' : ''}`}
      style={{
        position: 'relative',
        width: size,
        height: aspect === 'book' ? size * 1.32 : size,
        borderRadius: aspect === 'book' ? 5 : 'var(--radius-card)',
        overflow: 'hidden',
        flexShrink: 0,
        boxShadow: builtInSrc ? '0 10px 26px rgba(15, 23, 42, 0.16)' : 'var(--shadow-md)',
        background: `linear-gradient(150deg, hsl(${hue} 55% 42%) 0%, hsl(${(hue + 28) % 360} 50% 30%) 100%)`,
        border: builtInSrc ? '1px solid rgba(15, 23, 42, 0.08)' : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {builtInSrc ? (
        <img src={builtInSrc} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      ) : (
        <>
          {/* spine highlight */}
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: Math.max(2, size * 0.06), background: 'rgba(255,255,255,0.22)' }} />
          <span
            style={{
              fontSize: `${size * 0.46}px`,
              fontWeight: 800,
              color: 'rgba(255,255,255,0.95)',
              lineHeight: 1,
              userSelect: 'none',
              textShadow: '0 1px 2px rgba(0,0,0,0.35)',
            }}
          >
            {initial}
          </span>
        </>
      )}
    </div>
  );
};

const DEMO_BOOK_COVER_SRC: Record<string, string> = {
  'The Whispering Vale': '/demo-covers/whispering-vale-square.jpg',
  'Echoes of Ember': '/demo-covers/echoes-of-ember-square.jpg',
  'Iron Meridian': '/demo-covers/iron-meridian-square.jpg',
  'The Silver Thread': '/demo-covers/silver-thread-square.jpg',
  'Starfall Compact': '/demo-covers/starfall-compact-square.jpg',
  'Hollow Crown': '/demo-covers/hollow-crown-square.jpg',
};

const DEMO_BOOK_COVER_BOOK_SRC: Record<string, string> = {
  'The Whispering Vale': '/demo-covers/whispering-vale.jpg',
  'Echoes of Ember': '/demo-covers/echoes-of-ember.jpg',
  'Iron Meridian': '/demo-covers/iron-meridian.jpg',
  'The Silver Thread': '/demo-covers/silver-thread.jpg',
  'Starfall Compact': '/demo-covers/starfall-compact.jpg',
  'Hollow Crown': '/demo-covers/hollow-crown.jpg',
};

// ---------------------------------------------------------------------------
// Avatar — lucide User or initials in a tinted circle

export const Avatar: React.FC<{
  name?: string;
  size?: number;
  style?: React.CSSProperties;
}> = ({ name, size = 28, style }) => {
  const initials = name
    ? name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('')
    : null;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 'var(--radius-round)',
        background: 'var(--accent-tint-bg)',
        border: '1px solid var(--accent-tint-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        ...style,
      }}
    >
      {initials ? (
        <span
          style={{
            fontSize: `${size * 0.36}px`,
            fontWeight: 600,
            color: 'var(--accent)',
            lineHeight: 1,
            userSelect: 'none',
          }}
        >
          {initials}
        </span>
      ) : (
        <User size={size * 0.55} color="var(--accent)" strokeWidth={1.5} />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Icon convenience re-exports (lucide) — panes can import from here

export { BookOpen, Mic, Volume2, User, CheckCircle, XCircle, AlertTriangle, Loader2, Clock, Cloud };

// ---------------------------------------------------------------------------
// Shared header chip style helpers used in EnginesPane (token-driven)

/**
 * Inline style object for a small monospace status badge.
 * Accepts a semantic variant OR a legacy hex color string (for pane back-compat).
 */
export const statusChip = (variantOrHex: ChipVariant | string): React.CSSProperties => {
  const isHex = variantOrHex.startsWith('#') || variantOrHex.startsWith('rgb');
  if (isHex) {
    // Legacy hex path — panes that haven't migrated to SemanticChip yet
    return {
      fontSize: 'var(--type-micro)',
      fontWeight: 700,
      padding: '1px 6px',
      borderRadius: 4,
      border: `1px solid ${variantOrHex}`,
      color: variantOrHex,
      background: 'transparent',
      display: 'inline-flex',
      alignItems: 'center',
      whiteSpace: 'nowrap' as const,
    };
  }
  const base = SEMANTIC_CHIP_STYLES[variantOrHex as ChipVariant] ?? SEMANTIC_CHIP_STYLES.neutral;
  return {
    fontSize: 'var(--type-micro)',
    fontWeight: 700,
    padding: '1px 6px',
    borderRadius: 4,
    display: 'inline-flex',
    alignItems: 'center',
    whiteSpace: 'nowrap' as const,
    ...base,
  };
};

export const onPill: React.CSSProperties = {
  fontSize: 'var(--type-micro)',
  fontWeight: 700,
  padding: '1px 7px',
  borderRadius: 'var(--radius-round)',
  background: 'var(--accent)',
  color: 'var(--text-on-accent)',
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap' as const,
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
