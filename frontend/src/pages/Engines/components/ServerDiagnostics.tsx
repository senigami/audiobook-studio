/**
 * ServerDiagnostics.tsx — R5-T9
 *
 * TTS Server diagnostics box: server status/port/uptime, last health check,
 * and Restart server button. Data sourced from api.fetchHome() runtime_services
 * (the same source AboutSettingsPanel uses for RuntimeServiceRow).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import type { RuntimeService } from '@/types';
import { api } from '@/api';

/** Format an uptime in seconds as "Xh Ym" or "Xm" or "Xs". */
const formatUptime = (seconds: number): string => {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return `${hours}h ${remMins}m`;
};

/** Format a last-checked timestamp (seconds) as "Xs ago" / "Xm ago". */
const formatLastChecked = (seconds: number): string => {
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
};

interface ServerDiagnosticsProps {
  onRefresh?: () => void | Promise<void>;
}

export const ServerDiagnostics: React.FC<ServerDiagnosticsProps> = ({ onRefresh }) => {
  const [ttsService, setTtsService] = useState<RuntimeService | null>(null);
  const [loading, setLoading] = useState(true);
  const [restarting, setRestarting] = useState(false);
  const [lastCheckedAgo, setLastCheckedAgo] = useState<number | null>(null);
  const [fetchTime, setFetchTime] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      const home = await api.fetchHome();
      const services: RuntimeService[] = home?.runtime_services ?? [];
      const svc = services.find((s) => s.kind === 'tts_server') ?? null;
      setTtsService(svc);
      setFetchTime(new Date());
    } catch {
      // silently ignore — show stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Update "last checked ago" counter every 5 seconds
  useEffect(() => {
    if (!fetchTime) return;
    const tick = () => {
      const elapsed = (Date.now() - fetchTime.getTime()) / 1000;
      setLastCheckedAgo(elapsed);
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [fetchTime]);

  const handleRestart = async () => {
    setRestarting(true);
    try {
      await api.restartTtsServer();
      await load();
      await Promise.resolve(onRefresh?.());
    } catch {
      // best-effort
    } finally {
      setRestarting(false);
    }
  };

  const isRunning = ttsService?.healthy === true;
  const statusColor = isRunning ? 'var(--success-text)' : 'var(--warning-text-strong)';
  const statusLabel = ttsService?.status ?? (isRunning ? 'running' : 'unknown');
  const port = ttsService?.port ?? null;
  const message = ttsService?.message ?? null;

  // Build uptime string from message if it contains uptime info, or from elapsed fetch time
  // The RuntimeService type doesn't carry a dedicated uptime field; show port + message
  const serverDetail = [
    port ? `port ${port}` : null,
    message ?? null,
  ].filter(Boolean).join(' · ');

  return (
    <section
      aria-labelledby="server-diagnostics-label"
      style={{
        background: 'var(--surface-light)',
        border: '1px solid var(--border)',
        borderRadius: '16px',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '0.65rem 1rem',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface)',
        }}
      >
        <span
          id="server-diagnostics-label"
          style={{
            fontSize: '0.68rem',
            fontWeight: 900,
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          TTS Server diagnostics
        </span>
      </div>

      {loading ? (
        <div style={{ padding: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <RefreshCw size={13} className="spin" />
          Checking server status…
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {/* Server row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.55rem 1rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-primary)',
                width: '130px',
                flexShrink: 0,
              }}
            >
              Server
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span
                aria-hidden="true"
                style={{ fontSize: '0.55rem', color: statusColor, lineHeight: 1 }}
              >
                ●
              </span>
              <span
                style={{ fontSize: '0.72rem', fontWeight: 700, color: statusColor }}
                data-testid="server-status-label"
              >
                {statusLabel}
              </span>
              {serverDetail && (
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  · {serverDetail}
                </span>
              )}
            </div>
          </div>

          {/* Last health check row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.55rem 1rem',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span
              style={{
                fontSize: '0.72rem',
                color: 'var(--text-primary)',
                width: '130px',
                flexShrink: 0,
              }}
            >
              Last health check
            </span>
            <span
              style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}
              data-testid="last-health-check"
            >
              {lastCheckedAgo !== null ? formatLastChecked(lastCheckedAgo) : '—'}
            </span>
          </div>

          {/* Restart row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              padding: '0.55rem 1rem',
            }}
          >
            <button
              type="button"
              className="btn-glass"
              disabled={restarting}
              onClick={handleRestart}
              data-testid="restart-server-btn"
              style={{
                padding: '0.4rem 0.75rem',
                borderRadius: '10px',
                border: '1px solid var(--border)',
                fontWeight: 800,
                fontSize: '0.78rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              {restarting ? (
                <RefreshCw size={13} className="spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {restarting ? 'Restarting…' : 'Restart server'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
