import React from 'react';
import { ChevronDown, Terminal } from 'lucide-react';
import { LiveOutputTable } from '@/components/LiveOutputTable';
import { LIVE_EVENT_CONSUMERS, LIVE_EVENT_CONSUMER_TOPIC_IDS } from '@/config/liveEventConsumers';
import { ALL_TOPIC_FILTER_IDS, type TopicFilterId } from '@/config/liveEventTopics';
import { useStudioSocketConnection } from '@/hooks/useStudioSocketConnection';
import { getWebsocketRecentMessages } from '@/utils/runtimeDebug';
import { subscribeLiveEventAudit } from '@/store/liveEventAuditStore';
import '@/pages/LiveOutput/LiveOutputPage.css';

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
    <div className="live-output-page">
      <section className="live-output-page__intro">
        <div className="live-output-page__title-row">
          <Terminal size={18} color="var(--action-primary)" />
          <h1 className="live-output-page__title">Live Output Stream</h1>
        </div>
        <p className="live-output-page__subtitle">
          Internal audit log of normalized websocket events received by the client.
        </p>
        <details className="live-output-page__section">
          <summary className="live-output-page__section-summary">
            <ChevronDown size={16} />
            Event map
          </summary>
        <div className="live-output-page__event-map">
          <div className="live-output-page__event-map-intro">
            `topic` is the routing key. `eventKind` is the event action, and `source` stays visible for provenance.
            The buttons below mirror the same listener map used by the page.
          </div>
            <div className="live-output-page__consumer-list">
              {LIVE_EVENT_CONSUMERS.map(consumer => (
                <div key={consumer.id} className="live-output-page__topic-row">
                  <button
                    type="button"
                    className="btn-ghost live-output-page__consumer-btn"
                    onClick={() => showConsumerTopics(consumer.id)}
                    style={{
                      cursor: consumerTopicIds(consumer.id).length > 0 ? 'pointer' : 'default',
                    }}
                  >
                    {consumer.label}
                  </button>
                  <div className="live-output-page__topic-value">{consumerTopicLabel(consumer.id)}</div>
                </div>
              ))}
              <div className="live-output-page__topic-row">
                <div className="live-output-page__topic-label">plugin:&lt;plugin_id&gt;:&lt;area&gt;</div>
                <div className="live-output-page__topic-value">exact match on `plugins.&lt;plugin_id&gt;.&lt;area&gt;`</div>
              </div>
              <div className="live-output-page__topic-row">
                <div className="live-output-page__topic-label">plugin-private</div>
                <div className="live-output-page__topic-value">any topic beginning with `plugins.`</div>
              </div>
            </div>
          </div>
        </details>

        <details className="live-output-page__section">
          <summary className="live-output-page__section-summary">
            <ChevronDown size={16} />
            Socket trace
          </summary>
          <div className="live-output-page__trace">
            <div>
              Connection: <strong className="live-output-page__trace-value">{connected ? 'connected' : 'disconnected'}</strong>
            </div>
            <div>
              Traced frames: <strong className="live-output-page__trace-value">{socketTrace.length}</strong>
            </div>
            <pre className="live-output-page__trace-pre">
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
