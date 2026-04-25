import React from 'react';
import { NavLink } from 'react-router-dom';
import type { SettingsTab } from './settingsRouteConfig';
import type { RuntimeService } from '../../../types';
import { api } from '../../../api';

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
        background: active ? 'var(--accent)' : 'transparent',
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
          color: 'var(--accent)',
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
      gap: '1rem',
      padding: '1rem',
      borderRadius: '14px',
      border: '1px solid var(--border)',
      background: 'var(--surface-light)',
    }}
  >
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.85rem' }}>
      <div style={{ color: 'var(--accent)', marginTop: '0.1rem' }}>
        <Icon size={20} />
      </div>
      <div>
        <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)' }}>{title}</h3>
        <p style={{ margin: '0.2rem 0 0 0', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.5 }}>
          {description}
        </p>
      </div>
    </div>
    {action}
  </div>
);

export const ToggleButton: React.FC<{ enabled: boolean; busy: boolean; disabled?: boolean; title?: string; onClick: (e: React.MouseEvent) => void }> = ({ enabled, busy, disabled, title, onClick }) => (
  <button
    type="button"
    disabled={busy || disabled}
    onClick={onClick}
    title={title}
    className={enabled ? 'btn-primary' : 'btn-glass'}
    style={{ padding: '0.5rem 0.85rem', borderRadius: '10px', minWidth: 70, fontWeight: 900, border: enabled ? 'none' : '1px solid var(--border)' }}
  >
    {busy ? '...' : enabled ? 'ON' : 'OFF'}
  </button>
);

export const StatusCard: React.FC<{
  icon: React.ComponentType<{ size?: number }>;
  label: string;
  value: string;
  subvalue: string;
  tone?: 'blue' | 'yellow' | 'gray' | 'red';
  getBadgeStyles: (tone: 'blue' | 'yellow' | 'gray' | 'red') => React.CSSProperties;
}> = ({ icon: Icon, label, value, subvalue, tone = 'blue', getBadgeStyles }) => {
  const styles = getBadgeStyles(tone);
  return (
    <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
        <Icon size={16} />
        <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>{label}</span>
      </div>
      <div>
        <div style={{ fontSize: '1.4rem', fontWeight: 900, color: 'var(--text-primary)' }}>{value}</div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>{subvalue}</div>
      </div>
      <div style={{ height: '4px', width: '100%', background: styles.background, borderRadius: '999px', marginTop: '0.25rem' }} />
    </div>
  );
};

export const DiagnosticRow: React.FC<{ icon: React.ComponentType<{ size?: number }>; label: string; value: string; subvalue?: string }> = ({ icon: Icon, label, value, subvalue }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.8rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
      <div style={{ color: 'var(--accent)' }}><Icon size={18} /></div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
        <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{label}</span>
        {subvalue && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{subvalue}</span>}
      </div>
    </div>
    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', background: 'var(--background)', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
      {value}
    </span>
  </div>
);

export const RuntimeServiceRow: React.FC<{ service: RuntimeService; onRestart?: () => void | Promise<void> }> = ({ service, onRestart }) => {
  const statusLabel = service.status || (service.healthy ? 'healthy' : 'unhealthy');
  const canRestart = !!service.can_restart;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.8rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border)', background: 'var(--background)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
        <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)' }}>{service.label}</div>
        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          {service.url ? `${service.url}${service.port ? ` · port ${service.port}` : ''}` : 'not launched'}
          {service.message ? ` · ${service.message}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: service.healthy ? '#15803d' : '#b45309' }}>
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
            style={{ padding: '0.45rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, fontSize: '0.8rem' }}
          >
            Restart
          </button>
        )}
      </div>
    </div>
  );
};
