import React from 'react';
import { ChevronDown, Terminal } from 'lucide-react';
import { LiveOutputTable } from '@/components/LiveOutputTable';
import { LIVE_EVENT_CONSUMERS, LIVE_EVENT_CONSUMER_TOPIC_IDS } from '@/config/liveEventConsumers';
import { ALL_TOPIC_FILTER_IDS, type TopicFilterId } from '@/config/liveEventTopics';
import { useStudioSocketConnection } from '@/hooks/useStudioSocketConnection';
import { getWebsocketRecentMessages } from '@/utils/runtimeDebug';
import { subscribeLiveEventAudit } from '@/store/liveEventAuditStore';

const consumerTopicIds = (id: string): TopicFilterId[] => {
  const topicIds = LIVE_EVENT_CONSUMER_TOPIC_IDS[id];
  if (topicIds) return topicIds;
  if (id === 'plugin-private') return ['plugins.*'];
  return [];
};

const consumerTopicLabel = (id: string) => {
  const topicIds = consumerTopicIds(id);
  if (topicIds.length > 0) return topicIds.join(', ');
  if (id.startsWith('plugin:')) return id.replace(/^plugin:/, 'plugins.').replace(/:/g, '.');
  return id;
};

export const LiveOutputPage: React.FC = () => {
  const [hiddenTopics, setHiddenTopics] = React.useState<TopicFilterId[]>([]);
  const connected = useStudioSocketConnection();
  const [socketTrace, setSocketTrace] = React.useState(() => getWebsocketRecentMessages());

  // P5: subscribe to the audit store instead of polling every 250 ms.
  // Socket-trace updates are gated on page visibility so background tabs skip work.
  React.useEffect(() => {
    const syncTrace = () => {
      if (document.visibilityState === 'hidden') return;
      setSocketTrace(getWebsocketRecentMessages());
    };
    const unsubscribe = subscribeLiveEventAudit(syncTrace);
    document.addEventListener('visibilitychange', syncTrace);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', syncTrace);
    };
  }, []);

  const showConsumerTopics = (consumerId: string) => {
    const visibleTopicIds = consumerTopicIds(consumerId);
    if (visibleTopicIds.length === 0) return;
    setHiddenTopics(ALL_TOPIC_FILTER_IDS.filter(id => !visibleTopicIds.includes(id)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - var(--header-height, 56px) - 2rem)', gap: '1rem', minHeight: 0 }}>
      <section style={{
        padding: '1.25rem 1.5rem',
        borderRadius: '20px',
        border: '1px solid var(--border)',
        background: 'linear-gradient(180deg, var(--surface-white), var(--surface))',
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
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => showConsumerTopics(consumer.id)}
                    style={{
                      justifySelf: 'start',
                      padding: 0,
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                      font: 'inherit',
                      cursor: consumerTopicIds(consumer.id).length > 0 ? 'pointer' : 'default',
                    }}
                  >
                    {consumer.label}
                  </button>
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

        <details style={{ marginTop: '0.9rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
          <summary style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: 'pointer', color: 'var(--text-primary)', fontSize: '0.92rem', fontWeight: 600, listStyle: 'none' }}>
            <ChevronDown size={16} />
            Socket trace
          </summary>
          <div style={{ marginTop: '0.75rem', display: 'grid', gap: '0.5rem', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <div>
              Connection: <strong style={{ color: 'var(--text-primary)' }}>{connected ? 'connected' : 'disconnected'}</strong>
            </div>
            <div>
              Traced frames: <strong style={{ color: 'var(--text-primary)' }}>{socketTrace.length}</strong>
            </div>
            <pre style={{
              margin: 0,
              padding: '0.75rem',
              borderRadius: '8px',
              border: '1px solid var(--border)',
              background: 'var(--surface-dim)',
              maxHeight: '18rem',
              overflow: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'var(--text-primary)',
              fontSize: '0.78rem',
              lineHeight: 1.45,
            }}>
              {JSON.stringify(socketTrace.slice(-10), null, 2)}
            </pre>
          </div>
        </details>
      </section>

      <div style={{ flex: 1, minHeight: 0 }}>
        <LiveOutputTable
          hiddenTopics={hiddenTopics}
          onHiddenTopicsChange={setHiddenTopics}
        />
      </div>
    </div>
  );
};
