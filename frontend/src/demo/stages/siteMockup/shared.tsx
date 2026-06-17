/**
 * siteMockup/shared.tsx — shared primitive components and data
 */
import React, { useRef, useEffect, useState } from 'react';
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
  Play,
  ArrowDown,
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
// PlayButton — the single, consistent ▶ affordance for STARTING playback.
// Playback is started by content-owned play controls that the global click
// delegator catches by `aria-label` and loads into the player bus (audio-player
// spec §4.1). The bottom bar is transport for the already-loaded source; it
// can't originate playback, so every surface that can play exposes one of these.

export const PlayButton: React.FC<{
  /** aria-label drives the global play delegator, e.g. "Play chapter 7", "Play book Iron Meridian". */
  label: string;
  size?: number;
  tone?: 'tint' | 'overlay' | 'ghost';
}> = ({ label, size = 14, tone = 'tint' }) => {
  const dim = size + 16;
  const toneStyle: React.CSSProperties =
    tone === 'overlay'
      ? { background: 'var(--accent)', border: 'none', color: 'var(--text-on-accent)', boxShadow: 'var(--shadow-md)' }
      : tone === 'ghost'
      ? { background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-secondary)' }
      : { background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)', color: 'var(--accent)' };
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      style={{
        width: dim,
        height: dim,
        borderRadius: 'var(--radius-round)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        flexShrink: 0,
        padding: 0,
        ...toneStyle,
      }}
    >
      <Play size={size} strokeWidth={2.4} aria-hidden="true" style={{ transform: 'translateX(1px)' }} />
    </button>
  );
};

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
// MockWaveTape — paged waveform tape with click-to-seek and drag-to-scrub

// Deterministic value-noise helpers (stable across renders — no Math.random).
const hash01 = (n: number): number => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const valueNoise = (t: number): number => {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f); // smoothstep interpolation
  return hash01(i) * (1 - u) + hash01(i + 1) * u;
};
const fbm = (t: number): number =>
  0.55 * valueNoise(t) + 0.3 * valueNoise(t * 2.3 + 11.7) + 0.15 * valueNoise(t * 5.1 + 3.2);
const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/**
 * Deterministic speech-waveform amplitude at a given time (seconds), in [0,1].
 * Replaces the old fixed peak array so the tape reads like real narration at
 * ANY zoom and any clip length: voiced phrases with syllable-rate modulation,
 * separated by quiet pauses, plus fine texture and a low breath/room floor.
 * Pure function of t → the shape is stable as you scroll, zoom, and replay.
 */
export const speechPeakAt = (timeSec: number): number => {
  const t = timeSec;
  const phrase = fbm(t * 0.3 + 1.3); // slow phrase structure
  const gate = smoothstep(0.4, 0.56, phrase); // soft voiced/pause gate
  const rate = 3.5 + 1.6 * fbm(t * 0.2 + 5); // syllable rate ~3.5-5 Hz
  const syll = 0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t);
  const sharpSyll = Math.pow(syll, 1.5); // sharper syllable attacks
  const loud = 0.45 + 0.55 * fbm(t * 0.45 + 7); // phrase-to-phrase loudness
  const micro = 0.85 + 0.15 * fbm(t * 17 + 3); // fine texture
  const floor = 0.012 + 0.03 * fbm(t * 11 + 40); // breath/room noise in pauses
  const voiced = gate * sharpSyll * loud * micro;
  return Math.max(floor, Math.min(1, voiced + floor * 0.4));
};

/** Format seconds as m:ss (minutes uncapped, e.g. 65:09). */
const fmtClock = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

export interface MockWaveTapeProps {
  /** Total clip duration in seconds (synthetic — drives paging math). */
  durationSec: number;
  /** Current playback position in seconds (drives playhead + page). */
  currentTimeSec: number;
  /** True while playing — drives playhead advance animation. */
  isPlaying: boolean;
  /** Zoom preset: seconds of audio visible across the tape viewport. */
  windowSec: number;
  /** Called when user clicks or drags to a new position (seconds). */
  onSeek: (newTimeSec: number) => void;
  /** Tape pixel height. Default 104. */
  height?: number;
  /**
   * 'paged' (default): playhead sweeps the window, the window pages at the edge.
   * 'scroll': playhead is fixed at center; the waveform moves past it.
   */
  mode?: 'paged' | 'scroll';
}

export const MockWaveTape: React.FC<MockWaveTapeProps> = ({
  durationSec,
  currentTimeSec,
  isPlaying: _isPlaying,
  windowSec,
  onSeek,
  height = 104,
  mode = 'paged',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const isDragging = useRef(false);

  // --- Window math (the visible [viewStart, viewEnd] span) -----------------
  // Paged: window snaps to windowSec-sized pages; playhead sweeps across it.
  // Scroll: window is centered on the playhead, which stays fixed at center.
  const viewStart =
    mode === 'scroll'
      ? currentTimeSec - windowSec / 2
      : Math.floor(currentTimeSec / windowSec) * windowSec;
  const viewEnd = viewStart + windowSec;

  // --- Peaks for this window ----------------------------------------------
  // Sample on a FIXED absolute-time grid (gridSec), NOT relative to the moving
  // window — otherwise every bar re-samples a shifting point each tick and the
  // shape "crawls". Grid-aligned samples are stable per time bucket; the row is
  // then translated by a sub-bar offset so scroll mode glides seamlessly.
  // Bars before the start or past the clip end render flat (silence).
  const barW = 5;
  const gap = 2;
  const slot = barW + gap;
  const BAR_COUNT = 180;
  const svgW = BAR_COUNT * slot;
  const rulerH = 18;
  const svgH = Math.max(24, height - rulerH);

  const gridSec = windowSec / BAR_COUNT; // seconds per bar (depends on zoom only)
  const alignedStart = Math.floor(viewStart / gridSec) * gridSec; // snap to the grid
  const scrollOffset = ((alignedStart - viewStart) / windowSec) * svgW; // (-slot, 0]
  // One extra bar to cover the partial bar revealed at the right edge.
  const visiblePeaks = Array.from({ length: BAR_COUNT + 1 }, (_, i) => {
    const t = alignedStart + (i + 0.5) * gridSec; // FIXED grid time → stable value
    return t >= 0 && t <= durationSec ? speechPeakAt(t) : 0;
  });

  // Playhead X in SVG coords (fixed at center in scroll mode)
  const playheadFrac =
    mode === 'scroll' ? 0.5 : windowSec > 0 ? (currentTimeSec - viewStart) / windowSec : 0;
  const playheadX = Math.max(0, Math.min(svgW, playheadFrac * svgW));

  // Smart time ruler: pick a "nice" interval so ~3 ticks fall in the viewport,
  // labelled with the m:ss of where the user is currently viewing.
  const NICE_INTERVALS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
  const tickInterval = NICE_INTERVALS.find((n) => n >= windowSec / 4) ?? 600;
  const ticks: number[] = [];
  const firstTick = Math.ceil((viewStart + 0.001) / tickInterval) * tickInterval;
  for (let t = firstTick; t < viewEnd - 0.001; t += tickInterval) {
    if (t >= 0 && t <= durationSec) ticks.push(t);
  }

  // --- Pointer → time helper ----------------------------------------------
  const pointerToTime = (clientX: number): number => {
    const el = svgRef.current;
    if (!el) return currentTimeSec;
    const rect = el.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const newTime = viewStart + frac * windowSec;
    return Math.max(0, Math.min(durationSec, newTime));
  };

  // --- Drag-to-scrub -------------------------------------------------------
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    isDragging.current = true;
    onSeek(pointerToTime(e.clientX));
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      onSeek(pointerToTime(e.clientX));
    };
    const onUp = () => {
      isDragging.current = false;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    // pointerToTime reads refs/props but doesn't need to be in deps since
    // it closes over current viewStart/windowSec/durationSec via the closure
    // that is recreated each render. The effect only needs to re-register when
    // onSeek identity changes (stable in this mock).
     
  }, [onSeek]);

  return (
    <div className="nsp-tape" style={{ width: '100%' }}>
    <svg
      ref={svgRef}
      className="nsp-tape-canvas"
      width="100%"
      height={svgH}
      viewBox={`0 0 ${svgW} ${svgH}`}
      preserveAspectRatio="none"
      onMouseDown={handleMouseDown}
      aria-label="Waveform tape — click or drag to seek"
      role="slider"
      aria-valuemin={0}
      aria-valuemax={durationSec}
      aria-valuenow={Math.round(currentTimeSec)}
    >
      {visiblePeaks.map((amp, i) => {
        const x = i * slot + scrollOffset;
        const barH = Math.max(2, amp * (svgH - 8));
        const y = (svgH - barH) / 2;
        const isPlayed = x + barW < playheadX;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={barW}
            height={barH}
            rx={2}
            fill={isPlayed ? 'var(--color-wave-progress)' : 'var(--color-wave)'}
            opacity={isPlayed ? 0.9 : 0.55}
          />
        );
      })}
      {/* Playhead */}
      <line
        x1={playheadX}
        y1={0}
        x2={playheadX}
        y2={svgH}
        stroke="var(--accent)"
        strokeWidth={2}
        opacity={0.9}
      />
    </svg>
      <div className="nsp-tape-ruler" aria-hidden="true">
        {ticks.map((t) => (
          <span
            key={t}
            className="nsp-tape-tick"
            style={{ left: `${((t - viewStart) / windowSec) * 100}%` }}
          >
            {fmtClock(t)}
          </span>
        ))}
      </div>
    </div>
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

// ---------------------------------------------------------------------------
// Player-piano follow-playback (shared by Studio + Review panes)
//
// A "follow" surface maps a chapter's segments to a time window and auto-scrolls
// to keep the segment under the playhead parked in the upper third, while letting
// a manual scroll take over indefinitely (with a Resume pill to re-engage).

/** Speaker → design-token color family (no raw hex). Shared by Studio + Review so
 *  the active-segment highlight is colored identically on both surfaces. */
export const SPEAKER_TOKEN: Record<string, { text: string; tintBg: string; tintBorder: string }> = {
  Narrator:   { text: 'var(--success-text)',      tintBg: 'var(--success-tint-bg)',  tintBorder: 'var(--success)' },
  Maren:      { text: 'var(--pill-class-text)',    tintBg: 'var(--pill-class-bg)',    tintBorder: 'var(--pill-class-border)' },
  Dov:        { text: 'var(--pill-age-text)',      tintBg: 'var(--pill-age-bg)',      tintBorder: 'var(--pill-age-border)' },
  ElderRowan: { text: 'var(--pill-extended-text)', tintBg: 'var(--pill-extended-bg)', tintBorder: 'var(--pill-extended-border)' },
};

/** Demo follow-track length. Must stay > FIT_WAVE_MAX_SEC (30) so the chapter
 *  scrubber renders as a bar, yet short enough to demo in under a minute. */
export const FOLLOW_DURATION_SEC = 48;

export interface SegmentWindow {
  id: string;
  /** Playback window (seconds) — proportional to character share of the chapter. */
  start: number;
  end: number;
  /** Character-domain position of the segment within the chapter (the source of
   *  truth a real rendered chapter would persist: each segment = start + length). */
  startChar: number;
  charLen: number;
}

/**
 * Model the chapter as a character stream and assign each content segment a window
 * proportional to its character count: a segment covering chars [startChar, +charLen)
 * of a chapter of N chars plays over [startChar/N, (startChar+charLen)/N] × duration.
 * Whitespace spacers and items flagged isRendering are excluded.
 *
 * Because playback advances linearly in time, char-fraction === time-fraction, so
 * "percent of characters read" maps directly to the playhead — the segment under the
 * playhead is exact to the character model (not guesswork per visual line).
 */
export function buildSegmentTimeline(
  segments: { id: string; text: string; isRendering?: boolean }[],
  totalSec: number,
): SegmentWindow[] {
  const content = segments.filter(s => s.text.trim().length > 0 && !s.isRendering);
  const totalChars = content.reduce((n, s) => n + s.text.trim().length, 0) || 1;
  let accTime = 0;
  let accChar = 0;
  return content.map(s => {
    const len = s.text.trim().length;
    const dur = (len / totalChars) * totalSec;
    const win: SegmentWindow = {
      id: s.id, start: accTime, end: accTime + dur, startChar: accChar, charLen: len,
    };
    accTime += dur;
    accChar += len;
    return win;
  });
}

/** Which segment id is active at time t (start inclusive, end exclusive). */
export function activeChunkIdAt(timeline: SegmentWindow[], t: number): string | null {
  for (const s of timeline) if (t >= s.start && t < s.end) return s.id;
  return null;
}

/** Minimal shape of the playback track this hook reads. */
export interface FollowTrackLike {
  trackName: string;
  currentTime: number;
  scope: string;
}

/**
 * Drives follow-the-playback for a scrollable transcript. Returns a ref to put on
 * the scroll container, the active segment id, whether following is engaged/active,
 * and a `resume()` to re-engage after a manual scroll. Segments in the container
 * must carry `data-chunk-id={id}` matching the timeline ids.
 */
export function useChapterFollow(opts: {
  activeTrack: FollowTrackLike | null | undefined;
  matchTrackName: string;
  timeline: SegmentWindow[];
}) {
  const { activeTrack, matchTrackName, timeline } = opts;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isFollowing, setIsFollowing] = useState(true);
  const lastActiveIdRef = useRef<string | null>(null);

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const followEngaged =
    !!activeTrack && activeTrack.scope === 'chapter' && activeTrack.trackName === matchTrackName;
  const activeChunkId = followEngaged ? activeChunkIdAt(timeline, activeTrack!.currentTime) : null;

  // Scroll the active segment into the upper third — only when it CHANGES, so the
  // 10Hz playback tick doesn't restart the smooth animation every frame.
  useEffect(() => {
    if (!followEngaged || !isFollowing || !activeChunkId) return;
    if (activeChunkId === lastActiveIdRef.current) return;
    lastActiveIdRef.current = activeChunkId;
    const container = scrollRef.current;
    const el = container?.querySelector<HTMLElement>(`[data-chunk-id="${activeChunkId}"]`);
    if (!container || !el) return;
    // Rect-based geometry (not el.offsetTop): segment spans may sit inside a
    // position:relative wrapper that would otherwise be the offsetParent and
    // yield ≈0. getBoundingClientRect is immune to wrapper nesting and gives the
    // full box of a segment that wraps multiple lines.
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const elTop = elRect.top - cRect.top + container.scrollTop;
    // Encapsulate the segment: center its box in the viewport so the reading
    // center tracks the segment exactly, whatever its length. Tall segments clamp.
    const target = Math.max(0, elTop + elRect.height / 2 - container.clientHeight / 2);
    container.scrollTo({ top: target, behavior: reduceMotion ? 'auto' : 'smooth' });
  }, [activeChunkId, followEngaged, isFollowing, reduceMotion]);

  // A genuine user gesture pauses following indefinitely. We listen for intent
  // (wheel/touch/keys) NOT the scroll event, which our own auto-scroll fires.
  useEffect(() => {
    const c = scrollRef.current;
    if (!c) return;
    const pause = () => setIsFollowing(false);
    c.addEventListener('wheel', pause, { passive: true });
    c.addEventListener('touchmove', pause, { passive: true });
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(e.key)) pause();
    };
    c.addEventListener('keydown', onKey);
    return () => {
      c.removeEventListener('wheel', pause);
      c.removeEventListener('touchmove', pause);
      c.removeEventListener('keydown', onKey);
    };
  }, []);

  // Re-engage on a fresh play-through (currentTime resets to 0); reset on teardown.
  useEffect(() => {
    if (followEngaged) {
      if (activeTrack && activeTrack.currentTime === 0) {
        setIsFollowing(true);
        lastActiveIdRef.current = null;
      }
    } else {
      lastActiveIdRef.current = null;
    }
  }, [activeTrack?.trackName, activeTrack?.currentTime, followEngaged]);

  const resume = () => {
    setIsFollowing(true);
    lastActiveIdRef.current = null;
  };

  return { scrollRef, activeChunkId, followEngaged, isFollowing, resume };
}

/** Floating "↓ Resume following" pill. Render inside a position:relative ancestor;
 *  show only when `followEngaged && !isFollowing`. ≥44pt tap target (HIG). */
export const ResumeFollowingPill: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    aria-label="Resume following playback"
    onClick={onClick}
    style={{
      position: 'absolute', left: '50%', bottom: 'var(--space-3)',
      transform: 'translateX(-50%)', zIndex: 20,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      minHeight: 44, padding: '0 var(--space-3)',
      borderRadius: 'var(--radius-round)',
      background: 'var(--surface)', color: 'var(--accent)',
      border: '1px solid var(--accent-tint-border)',
      boxShadow: 'var(--shadow-md)', cursor: 'pointer',
      fontSize: 'var(--type-caption)', fontWeight: 600,
    }}
  >
    <ArrowDown size={14} aria-hidden="true" /> Resume following
  </button>
);
