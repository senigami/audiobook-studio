import React, { useState, useEffect } from 'react';
import { RefreshCw, BadgeInfo, Server, Volume2, Globe, Cpu, Layers } from 'lucide-react';
import type { TtsEngine, RenderStats, RuntimeService } from '../../../types';
import { api } from '../../../api';
import { StatusCard, DiagnosticRow, RuntimeServiceRow } from './SettingsComponents';
import { getBadgeStyles } from './settingsRouteHelpers';

export const AboutSettingsPanel: React.FC<{ onRefresh?: () => void | Promise<void> }> = ({ onRefresh }) => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStatus = async () => {
      try {
        const home = await api.fetchHome();
        setData(home);
      } catch (err) {
        console.error('Failed to load about data', err);
      } finally {
        setLoading(false);
      }
    };
    loadStatus();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw size={24} className="spin" style={{ marginBottom: '1rem', opacity: 0.5 }} />
        <p>Gathering system info...</p>
      </div>
    );
  }

  const renderStats: RenderStats = data?.render_stats || {};
  const runtimeServices: RuntimeService[] = data?.runtime_services || [];
  const engineList: TtsEngine[] = data?.engines || [];
  const audioDurationSeconds = typeof renderStats.audio_duration_seconds === 'number' ? renderStats.audio_duration_seconds : 0;
  const renderWordCount = typeof renderStats.word_count === 'number' ? renderStats.word_count : 0;
  const renderChars = typeof renderStats.chars === 'number' ? renderStats.chars : 0;
  const engineLabels = engineList.map((engine) => engine.display_name).filter(Boolean);
  const enginePluginValue = engineList.length > 0 ? `${engineList.length} loaded` : 'No plugins loaded';
  const enginePluginSummary = engineLabels.length > 0 ? engineLabels.join(' · ') : 'Refresh plugins to discover available engines.';
  
  const formatDurationSmart = (seconds: number) => {
    const totalMinutes = Math.max(0, Math.round(seconds / 60));
    if (totalMinutes <= 0) return '0m';
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };
  
  const formatSinceDate = (timestamp?: number | null) => {
    if (!timestamp) return 'first render';
    return `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp * 1000))}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
        <StatusCard
          icon={BadgeInfo}
          label="Studio Version"
          value={data?.version || '2.0.0'}
          subvalue="Release Channel: Stable"
          getBadgeStyles={getBadgeStyles}
        />
        <StatusCard
          icon={Server}
          label="Engine Plugins"
          value={enginePluginValue}
          subvalue={enginePluginSummary}
          tone={engineList.length > 0 ? 'blue' : 'gray'}
          getBadgeStyles={getBadgeStyles}
        />
        <div style={{ padding: '1.25rem', borderRadius: '16px', border: '1px solid var(--border)', background: 'var(--surface-light)', display: 'flex', flexDirection: 'column', gap: '1rem', position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', color: 'var(--text-muted)' }}>
              <Volume2 size={16} />
              <span style={{ fontSize: '0.82rem', fontWeight: 800 }}>Production Tally</span>
            </div>
            <button
              type="button"
              className="btn-glass"
              onClick={async () => {
                try {
                  await api.resetRenderStats();
                  const home = await api.fetchHome();
                  setData(home);
                  await Promise.resolve(onRefresh?.());
                } catch (err) {
                  console.error('Failed to reset render stats', err);
                }
              }}
              style={{ padding: '0.35rem 0.6rem', borderRadius: '8px', border: '1px solid var(--border)', fontWeight: 800, fontSize: '0.72rem' }}
            >
              Reset
            </button>
          </div>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
               <span style={{ fontSize: '2.25rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{formatDurationSmart(audioDurationSeconds)}</span>
               <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Produced</span>
            </div>
            <div style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginTop: '0.2rem', fontWeight: 600 }}>
                {renderWordCount.toLocaleString()} words / {renderChars.toLocaleString()} characters rendered
            </div>
            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <RefreshCw size={12} />
                <span>Tally since {formatSinceDate(renderStats.since_timestamp)}</span>
            </div>
          </div>
          <div style={{ position: 'absolute', right: '-10%', bottom: '-20%', opacity: 0.04, color: 'var(--accent)', transform: 'rotate(-15deg)' }}>
             <Volume2 size={120} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', padding: '0 0.5rem' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', lineHeight: 1.6 }}>
          Resetting tally starts a new count from now without deleting historical render rows.
        </div>
      </div>

      <div style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.25rem' }}>
        <h3 style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', fontWeight: 900, color: 'var(--text-muted)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Runtime Diagnostics
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <DiagnosticRow
            icon={Globe}
            label="Frontend Client"
            value={typeof window !== 'undefined' ? window.location.origin : 'Browser session'}
            subvalue={typeof window !== 'undefined' && navigator.onLine ? 'online' : 'offline'}
          />
          <DiagnosticRow
            icon={Cpu}
            label="Backend Runtime"
            value={data?.system_info?.backend_mode || 'Single-Process (Legacy)'}
            subvalue="Service Bridge"
          />
          <DiagnosticRow
            icon={Layers}
            label="Orchestrator"
            value={data?.system_info?.orchestrator || 'Studio 2.0'}
          />
          {runtimeServices.map((service) => (
            <RuntimeServiceRow
              key={service.id}
              service={service}
              onRestart={async () => {
                const home = await api.fetchHome();
                setData(home);
                await Promise.resolve(onRefresh?.());
              }}
            />
          ))}
        </div>
      </div>

      <div style={{ padding: '1rem', borderRadius: '14px', border: '1px dashed var(--border)', background: 'var(--background)', color: 'var(--text-muted)', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0 }}>
          Audiobook Studio 2.0 is a modular platform powered by a decoupled TTS Server and plugin architecture. 
          The "About" tab provides diagnostic visibility into the service bridge, production efficiency, and runtime health.
          For detailed logs, refer to the global logs at the bottom of the TTS Engines tab or the <code>logs/</code> directory in your Studio root.
        </p>
      </div>
    </div>
  );
};
