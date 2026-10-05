import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LiveEvent, LiveEventRecord } from '@/api/contracts/liveEvents';
import {
  clearLiveEventAudit,
  getLiveEventAuditSnapshot,
  subscribeThrottled,
} from '@/store/liveEventAuditStore';
import { TOPIC_FILTERS, type TopicFilterId } from '@/config/liveEventTopics';

export interface LiveOutputTableProps {
  chapterId?: string | null;
  currentJobId?: string | null;
  hiddenTopics?: TopicFilterId[];
  onHiddenTopicsChange?: React.Dispatch<React.SetStateAction<TopicFilterId[]>>;
}

const shortId = (value?: string | null) => {
  if (!value) return '-';
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });
};

const formatProgress = (value?: number | null) => {
  if (typeof value !== 'number') return '-';
  return `${Math.round(value * 1000) / 10}%`;
};

const formatGroup = (payload: any | undefined) => {
  if (!payload) return '-';
  const count = payload.render_group_count;
  if (typeof count !== 'number' || count <= 0) return '-';
  // One convention for every frame type: the 1-based ordinal of the group
  // currently being worked ("group N of M"). Segment frames carry the 0-based
  // active index; chapter frames carry only the completed count, so the
  // in-flight group is completed + 1 (capped at M once everything is done).
  const idx = payload.active_render_group_index;
  if (typeof idx === 'number') {
    return `${Math.min(idx + 1, count)}/${count}`;
  }
  const completed = payload.completed_render_groups;
  if (typeof completed === 'number') {
    return `${Math.min(completed + 1, count)}/${count}`;
  }
  return `-/${count}`;
};

const formatEta = (value?: number | null) => {
  if (typeof value !== 'number') return '-';
  return `${value}s`;
};

const jobProgressPayloadFor = (event: LiveEvent): any => {
  if (
    event.topic === 'jobs.lifecycle' ||
    event.topic === 'queue.items' ||
    event.topic === 'chapters.lifecycle' ||
    event.topic === 'chapters.progress' ||
    event.topic === 'voice.test' ||
    event.topic === 'segments.progress'
  ) {
    const payload = event.payload as any;
    return {
      progress: payload.progress,
      // Keep index and completed-count separate: they have different semantics
      // (0-based position vs how many groups are finished). formatGroup decides
      // how to derive the displayed ordinal from whichever is present.
      active_render_group_index: payload.segmentIndex ?? payload.activeRenderGroupIndex ?? payload.active_render_group_index,
      completed_render_groups: payload.completedRenderGroups ?? payload.completed_render_groups,
      render_group_count: payload.segmentCount ?? payload.renderGroupCount ?? payload.render_group_count,
      reason_code: payload.reasonCode ?? payload.reason_code,
      message: payload.message,
      status: payload.status,
      eta_seconds: payload.etaSeconds ?? payload.eta_seconds,
      confidence: payload.confidence ?? null,
    };
  }
  return undefined;
};

const formatConfidence = (value?: number | null) => {
  if (typeof value !== 'number') return '-';
  const pct = Math.round(value * 100);
  if (pct < 50) {
    return (
      <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>
        ⚠️ {pct}%
      </span>
    );
  }
  return `${pct}%`;
};

const messageFor = (event: LiveEvent): string => {
  if (event.topic === 'tts.logs') return (event.payload as any).line ?? '';
  if (
    event.topic === 'jobs.lifecycle' ||
    event.topic === 'queue.items' ||
    event.topic === 'chapters.lifecycle' ||
    event.topic === 'chapters.progress' ||
    event.topic === 'voice.test' ||
    event.topic === 'segments.progress'
  ) {
    const payload = event.payload as any;
    const message = payload.message ?? '';
    const status = payload.status ?? '';
    if (message && status) return `[${status}] ${message}`;
    if (event.topic === 'voice.test') return message || status || payload.voiceName || '';
    return message || status;
  }
  if (
    event.topic === 'chapters.lifecycle' ||
    event.topic === 'segments.lifecycle' ||
    event.topic === 'projects.lifecycle'
  ) {
    const payload = event.payload as any;
    return payload.message ?? '';
  }
  if (event.topic === 'system.events' || event.topic === 'system.unknown') {
    try {
      return JSON.stringify(event.payload);
    } catch {
      return String(event.payload);
    }
  }
  return '';
};

const reasonFor = (event: LiveEvent): string => {
  const payload = event.payload as any;
  return payload?.reasonCode ?? payload?.reason_code ?? '-';
};

const COLUMNS = [
  'Time',
  'Topic',
  'Event',
  'Job',
  'Chapter',
  'Segment',
  'Job %',
  'Confidence',
  'Group',
  'ETA',
  'Reason',
  'Source',
  'Message',
];

export const LiveOutputTable: React.FC<LiveOutputTableProps> = ({
  hiddenTopics: controlledHiddenTopics,
  onHiddenTopicsChange,
}) => {
  // P1: subscribeThrottled coalesces a burst of frames to one render per rAF.
  const records = useSyncExternalStore(
    subscribeThrottled,
    getLiveEventAuditSnapshot,
    getLiveEventAuditSnapshot,
  );

  const [localHiddenTopics, setLocalHiddenTopics] = useState<TopicFilterId[]>([]);
  const hiddenTopics = controlledHiddenTopics ?? localHiddenTopics;
  const setHiddenTopics = onHiddenTopicsChange ?? setLocalHiddenTopics;
  const [paused, setPaused] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const filteredRecords = useMemo(() => {
    if (hiddenTopics.length === 0) return records;
    const hidden = new Set(hiddenTopics);
    return records.filter(record => !TOPIC_FILTERS.some(filter => hidden.has(filter.id) && filter.matches(record.event.topic)));
  }, [hiddenTopics, records]);

  useEffect(() => {
    if (paused) return;
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' });
    }
  }, [filteredRecords.length, paused]);

  const handleClear = () => {
    clearLiveEventAudit();
  };

  const toggleTopic = (topicId: TopicFilterId) => {
    setHiddenTopics(prev => (
      prev.includes(topicId)
        ? prev.filter(id => id !== topicId)
        : [...prev, topicId]
    ));
  };

  const showAllTopics = () => setHiddenTopics([]);

  const isTopicHidden = (topicId: TopicFilterId) => hiddenTopics.includes(topicId);

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(JSON.stringify(filteredRecords, null, 2));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.35rem', background: 'var(--border)', padding: '3px', borderRadius: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn-ghost"
            onClick={showAllTopics}
            aria-pressed={hiddenTopics.length === 0}
            style={{
              padding: '4px 12px',
              fontSize: '0.85rem',
              borderRadius: '6px',
              height: '30px',
              border: 'none',
              background: hiddenTopics.length === 0 ? 'var(--action-primary)' : 'transparent',
              color: hiddenTopics.length === 0 ? 'var(--text-on-accent)' : 'var(--text-primary)',
              fontWeight: hiddenTopics.length === 0 ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            All
          </button>
          {TOPIC_FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              className="btn-ghost"
              onClick={() => toggleTopic(id)}
              aria-pressed={!isTopicHidden(id)}
              style={{
                padding: '4px 12px',
                fontSize: '0.85rem',
                borderRadius: '6px',
                height: '30px',
                border: 'none',
                background: isTopicHidden(id) ? 'transparent' : 'var(--action-primary)',
                color: isTopicHidden(id) ? 'var(--text-primary)' : 'var(--text-on-accent)',
                fontWeight: isTopicHidden(id) ? 400 : 600,
                cursor: 'pointer',
                opacity: isTopicHidden(id) ? 0.65 : 1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn-ghost" onClick={() => setPaused(value => !value)}>
          {paused ? 'Resume autoscroll' : 'Pause autoscroll'}
        </button>
        <button type="button" className="btn-ghost" onClick={handleClear}>Clear</button>
        <button type="button" className="btn-ghost" onClick={() => void handleCopy()}>Copy JSON</button>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
          {filteredRecords.length} / {records.length} entries
        </span>
      </div>

      <div className="live-output-table-wrapper" style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr>
              {COLUMNS.map(label => (
                <th key={label} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                  No live output captured yet.
                </td>
              </tr>
            )}
            {filteredRecords.map((record: LiveEventRecord) => {
              const event = record.event;
              const jobPayload = jobProgressPayloadFor(event);
              return (
                <tr
                  key={event.frameId}
                  data-frame-id={event.frameId}
                  data-topic={event.topic}
                >
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatTime(event.receivedAt)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{event.topic}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{event.eventKind}</td>
                  <td title={event.jobId ?? ''} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{shortId(event.jobId)}</td>
                  <td title={event.chapterId ?? ''} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{shortId(event.chapterId)}</td>
                  <td title={event.segmentId ?? ''} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{shortId(event.segmentId)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatProgress(jobPayload?.progress)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatConfidence(jobPayload?.confidence)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatGroup(jobPayload)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatEta(jobPayload?.eta_seconds)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{reasonFor(event)}</td>
                  <td title={event.source ?? ''} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{event.source ?? '-'}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', minWidth: 320, whiteSpace: 'pre-wrap' }}>{messageFor(event)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div ref={endRef} />
      </div>
    </div>
  );
};
