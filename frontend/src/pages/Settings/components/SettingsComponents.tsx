import React from 'react';
import { NavLink } from 'react-router-dom';
import { Minus, Plus } from 'lucide-react';
import type { SettingsTab } from '@/pages/Settings/settingsRouteConfig';
import type { RuntimeService } from '@/types';
import { api } from '@/api';
import './SettingsComponents.css';

export const SettingsTabLink: React.FC<{ tab: SettingsTab; active: boolean }> = ({ tab, active }) => {
  const Icon = tab.icon;
  return (
    <NavLink
      to={tab.path}
      end={tab.path === '/settings'}
      aria-current={active ? 'page' : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.85rem',
        borderRadius: '12px',
        textDecoration: 'none',
        color: active ? 'white' : 'var(--text-secondary)',
        background: active ? 'var(--action-primary)' : 'transparent',
        boxShadow: active ? 'var(--shadow-sm)' : 'none',
        fontWeight: 800,
      }}
    >
      <Icon size={17} strokeWidth={active ? 2.6 : 2} />
      <span>{tab.label}</span>
    </NavLink>
  );
};

export const TabHeading: React.FC<{ tab: SettingsTab }> = ({ tab }) => {
  const Icon = tab.icon;
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', marginBottom: '1.25rem' }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: '12px',
          display: 'grid',
          placeItems: 'center',
          color: 'var(--action-primary)',
          background: 'var(--accent-glow)',
        }}
      >
        <Icon size={20} />
      </div>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.25rem', color: 'var(--text-primary)' }}>{tab.label}</h2>
        <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
          {tab.description}
        </p>
      </div>
    </div>
  );
};

export const SettingCard: React.FC<{
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  description: string;
  action: React.ReactNode;
}> = ({ icon: Icon, title, description, action }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '0.85rem 1rem',
      padding: '1rem',
      borderRadius: '14px',
      border: '1px solid var(--border)',
      background: 'var(--surface-light)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem', minWidth: 0, flex: '1 1 220px' }}>
      <div style={{ color: 'var(--action-primary)', marginTop: '0.1rem', flexShrink: 0 }}>
        <Icon size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
    </div>
    {action}
  </div>
);

/**
 * Apple-style switch control (track + knob) for binary settings. Shared by
 * the Settings and Engines pages — a binary setting is a state, not an
 * action, so it renders as a switch rather than a pressable "ON"/"OFF" pill.
 * Accent color is rationed to the "on" position only (Quiet Studio direction).
 * `role="switch"` + `aria-checked` carry the accessible state; there is no
 * visible text label, so callers should keep a `title`/adjacent label for
 * sighted users and rely on aria-checked for tests/assistive tech.
 */
export const ToggleButton: React.FC<{ id?: string; enabled: boolean; busy: boolean; disabled?: boolean; title?: string; onClick: (e: React.MouseEvent) => void }> = ({ id, enabled, busy, disabled, title, onClick }) => (
  <button
    id={id}
    type="button"
    role="switch"
    aria-checked={enabled}
    disabled={busy || disabled}
    onClick={onClick}
    title={title}
    style={{
      position: 'relative',
      flexShrink: 0,
      width: 44,
      height: 26,
      padding: 0,
      borderRadius: 'var(--radius-round)',
      border: enabled ? 'none' : '1px solid var(--border)',
      background: enabled ? 'var(--action-primary)' : 'var(--surface)',
      cursor: busy || disabled ? 'not-allowed' : 'pointer',
      opacity: busy ? 0.6 : 1,
      transition: 'background 0.15s ease',
    }}
  >
    <span
      style={{
        position: 'absolute',
        top: 2,
        left: enabled ? 20 : 2,
        width: 20,
        height: 20,
        borderRadius: '50%',
        background: '#fff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        transition: 'left 0.15s ease',
      }}
    />
  </button>
);

/**
 * Apple-style "- [value] +" numeric stepper. The middle field stays a real,
 * editable text input (so a value can still be typed directly), flanked by
 * icon-only minus/plus buttons that step and clamp to [min, max].
 *
 * Commit semantics are caller-controlled: `onStep` fires immediately (with
 * an already-clamped value) for both button clicks; `onInputChange`/
 * `onInputBlur` mirror a plain <input>'s onChange/onBlur for the typed path,
 * so a caller can choose immediate-commit (only pass onInputChange) or
 * staged-commit-on-blur (pass onInputChange for local display state and
 * onInputBlur to actually persist) without this component knowing which.
 */
export const NumberStepper: React.FC<{
  id?: string;
  ariaLabel: string;
  value: number;
  displayValue?: string;
  min: number;
  max: number;
  step?: number;
  disabled?: boolean;
  onStep: (next: number) => void;
  onInputChange?: (raw: string) => void;
  onInputBlur?: (raw: string) => void;
}> = ({ id, ariaLabel, value, displayValue, min, max, step = 1, disabled, onStep, onInputChange, onInputBlur }) => {
  const [pressed, setPressed] = React.useState<'dec' | 'inc' | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, n));
  const canDecrement = !disabled && value > min;
  const canIncrement = !disabled && value < max;

  // A single fused capsule — one continuous control split by hairlines, not
  // three separate floating buttons. Matches Apple's numeric stepper pattern
  // (e.g. the border-width / line-spacing pickers in Pages/Numbers, or
  // Shortcuts' "Repeat" count): one shape, minimal chrome, segments share the
  // outer border instead of each drawing its own.
  const segmentStyle = (enabled: boolean, isPressed: boolean): React.CSSProperties => ({
    display: 'grid',
    placeItems: 'center',
    width: 32,
    height: 32,
    border: 'none',
    background: isPressed ? 'var(--surface-pressed)' : 'transparent',
    color: enabled ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: enabled ? 'pointer' : 'not-allowed',
  });

  return (
    <div
      style={{
        display: 'inline-flex',
        flexShrink: 0,
        alignItems: 'stretch',
        borderRadius: 'var(--radius-round)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <button
        type="button"
        className="number-stepper-segment"
        aria-label={`Decrease ${ariaLabel}`}
        disabled={!canDecrement}
        onClick={() => onStep(clamp(value - step))}
        onMouseDown={() => setPressed('dec')}
        onMouseUp={() => setPressed(null)}
        onMouseLeave={() => setPressed(null)}
        style={{ ...segmentStyle(canDecrement, pressed === 'dec'), borderRight: '1px solid var(--border)' }}
      >
        <Minus size={14} strokeWidth={2.5} />
      </button>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        className="number-stepper-input"
        aria-label={ariaLabel}
        disabled={disabled}
        value={displayValue ?? String(value)}
        onChange={(e) => onInputChange?.(e.target.value)}
        onBlur={(e) => onInputBlur?.(e.target.value)}
        style={{
          width: '2.25rem',
          height: 32,
          minHeight: 32,
          textAlign: 'center',
          border: 'none',
          background: 'transparent',
          color: 'var(--text-primary)',
          fontSize: '0.9rem',
          fontWeight: 800,
        }}
      />
      <button
        type="button"
        className="number-stepper-segment"
        aria-label={`Increase ${ariaLabel}`}
        disabled={!canIncrement}
        onClick={() => onStep(clamp(value + step))}
        onMouseDown={() => setPressed('inc')}
        onMouseUp={() => setPressed(null)}
        onMouseLeave={() => setPressed(null)}
        style={{ ...segmentStyle(canIncrement, pressed === 'inc'), borderLeft: '1px solid var(--border)' }}
      >
        <Plus size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
};

export const StatusCard: React.FC<{
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  subvalue: string;
  tone?: 'blue' | 'yellow' | 'gray' | 'red';
  getBadgeStyles: (tone: 'blue' | 'yellow' | 'gray' | 'red') => React.CSSProperties;
}> = ({ icon: Icon, label, value, subvalue }) => {
  // Note: `tone`/`getBadgeStyles` are accepted for backward-compat with
  // callers but no longer drive a rendered element — the bottom accent bar
  // they used to color was purely decorative (no semantic meaning to a
  // user) and has been removed per design-critique P3.
  return (
    <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
        <Icon size={16} />
        <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>{label}</span>
      </div>
      <div>
        <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{subvalue}</div>
      </div>
    </div>
  );
};

export const DiagnosticRow: React.FC<{ icon: React.ComponentType<{ size?: number }>; label: string; value: string; subvalue?: string }> = ({ icon: Icon, label, value, subvalue }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem 1rem', padding: '0.8rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0, flex: '1 1 160px' }}>
      <div style={{ color: 'var(--action-primary)', flexShrink: 0 }}><Icon size={18} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem', minWidth: 0 }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
        {subvalue && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{subvalue}</span>}
      </div>
    </div>
    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', background: 'var(--background)', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border)', maxWidth: '100%', overflowWrap: 'anywhere', flexShrink: 1 }}>
      {value}
    </span>
  </div>
);

export const RuntimeServiceRow: React.FC<{ service: RuntimeService; onRestart?: () => void | Promise<void> }> = ({ service, onRestart }) => {
  const statusLabel = service.status || (service.healthy ? 'healthy' : 'unhealthy');
  const canRestart = !!service.can_restart;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6rem 1rem', padding: '0.8rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', minWidth: 0, flex: '1 1 160px' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>{service.label}</div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>
          {service.url ? `${service.url}${service.port ? ` · port ${service.port}` : ''}` : 'not launched'}
          {service.message ? ` · ${service.message}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: service.healthy ? 'var(--success-text)' : 'var(--warning-text-strong)' }}>
          {statusLabel}
        </span>
        {canRestart && (
          <button
            type="button"
            className="btn-glass"
            onClick={async () => {
              try {
                await api.restartTtsServer();
                await Promise.resolve(onRestart?.());
              } catch (err) {
                console.error('Failed to restart TTS Server', err);
              }
            }}
            style={{ padding: '0.6rem 0.85rem', minHeight: 44, borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, fontSize: '0.8rem' }}
          >
            Restart
          </button>
        )}
      </div>
    </div>
  );
};
