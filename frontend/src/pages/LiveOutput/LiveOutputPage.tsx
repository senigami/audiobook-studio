import React from 'react';
import { ChevronDown, Terminal } from 'lucide-react';
import { LiveOutputTable } from '@/components/LiveOutputTable';
import { LIVE_EVENT_CONSUMERS } from '@/config/liveEventConsumers';

const consumerTopicLabel = (id: string) => {
  if (id === 'main-queue') return 'jobs.lifecycle';
  if (id === 'chapter-state') return 'jobs.lifecycle, chapters.lifecycle, chapters.progress, segments.progress';
  if (id === 'segment-state') return 'jobs.lifecycle, segments.lifecycle, segments.progress';
  if (id === 'tts-diagnostics') return 'tts.logs';
  if (id === 'voice-test-state') return 'voice.test';
  if (id === 'project-state') return 'projects.lifecycle';
  if (id === 'plugin-private') return 'plugins.*';
  if (id.startsWith('plugin:')) return id.replace(/^plugin:/, 'plugins.').replace(/:/g, '.');
  return id;
};

export const LiveOutputPage: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height, 72px) - 2rem)', gap: '1rem', minHeight: 0 }}>
      <section style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(246,248,252,0.92))',
        boxShadow: 'var(--shadow-md)',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.25rem' }}>
          <Terminal size={18} color="var(--accent)" />
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 800 }}>Live Output Stream</h1>
        </div>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Internal audit log of normalized websocket events received by the client.
        </p>
        <details style={{ marginTop: '0.9rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 600, listStyle: 'none' }}>
            <ChevronDown size={16} />
            Event map
          </summary>
          <div style={{ marginTop: '0.85rem', display: 'grid', gap: '0.5rem' }}>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
              `topic` is the routing key. `eventKind` is the event action, and `source` stays visible for provenance.
              The buttons below mirror the same listener map used by the page.
            </div>
            <div style={{ display: 'grid', gap: '0.35rem' }}>
              {LIVE_EVENT_CONSUMERS.map(consumer => (
                <div key={consumer.id} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.75rem', alignItems: 'start', fontSize: '0.82rem' }}>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{consumer.label}</div>
                  <div style={{ color: 'var(--text-secondary)' }}>{consumerTopicLabel(consumer.id)}</div>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.75rem', alignItems: 'start', fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>plugin:&lt;plugin_id&gt;:&lt;area&gt;</div>
                <div style={{ color: 'var(--text-secondary)' }}>exact match on `plugins.&lt;plugin_id&gt;.&lt;area&gt;`</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '0.75rem', alignItems: 'start', fontSize: '0.82rem' }}>
                <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>plugin-private</div>
                <div style={{ color: 'var(--text-secondary)' }}>any topic beginning with `plugins.`</div>
              </div>
            </div>
          </div>
        </details>
      </section>

      <div style={{ flex: 1, minHeight: 0 }}>
        <LiveOutputTable />
      </div>
    </div>
  );
};
