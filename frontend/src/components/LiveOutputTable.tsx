import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LiveEvent, LiveEventRecord } from '@/api/contracts/liveEvents';
import {
  clearLiveEventAudit,
  getLiveEventAuditSnapshot,
  subscribeLiveEventAudit,
} from '@/store/liveEventAuditStore';
import { LIVE_EVENT_CONSUMERS, getLiveEventConsumer } from '@/config/liveEventConsumers';


type LiveOutputFilter = 'all' | 'main-queue' | 'chapter-state' | 'segment-state' | 'tts-diagnostics' | 'voice-test-state' | string;

interface LiveOutputTableProps {
  chapterId?: string | null;
  currentJobId?: string | null;
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
  if (typeof payload.active_render_group_index !== 'number' && typeof payload.render_group_count !== 'number') {
    return '-';
  }
  return `${payload.active_render_group_index ?? '-'}/${payload.render_group_count ?? '-'}`;
};

const jobProgressPayloadFor = (event: LiveEvent): any => {
  if (
    event.topic === 'queue.items' ||
    event.topic === 'chapters.progress' ||
    event.topic === 'segments.progress'
  ) {
    const payload = event.payload as any;
    const hasActiveSegmentProgress = payload.activeSegmentProgress !== undefined || payload.active_segment_progress !== undefined;
    return {
      progress: event.topic === 'segments.progress' ? (hasActiveSegmentProgress ? payload.progress : null) : payload.progress,
      active_segment_progress: event.topic === 'segments.progress' ? (payload.activeSegmentProgress ?? payload.active_segment_progress ?? payload.progress) : null,
      active_render_group_index: payload.segmentIndex ?? payload.completedRenderGroups ?? payload.active_render_group_index ?? payload.completed_render_groups,
      render_group_count: payload.segmentCount ?? payload.renderGroupCount ?? payload.render_group_count,
      reason_code: payload.reasonCode ?? payload.reason_code,
      message: payload.message,
      status: payload.status,
    };
  }
  return undefined;
};

const messageFor = (event: LiveEvent): string => {
  if (event.topic === 'tts.logs') return (event.payload as any).line ?? '';
  if (
    event.topic === 'queue.items' ||
    event.topic === 'chapters.progress' ||
    event.topic === 'segments.progress'
  ) {
    const payload = event.payload as any;
    const message = payload.message ?? '';
    const status = payload.status ?? '';
    if (message && status) return `[${status}] ${message}`;
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
  'Segment %',
  'Group',
  'Reason',
  'Source',
  'Message',
];

export const LiveOutputTable: React.FC<LiveOutputTableProps> = (_props) => {
  const records = useSyncExternalStore(
    subscribeLiveEventAudit,
    getLiveEventAuditSnapshot,
    getLiveEventAuditSnapshot,
  );

  const [filter, setFilter] = useState<LiveOutputFilter>('all');
  const [paused, setPaused] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const filteredRecords = useMemo(() => {
    if (filter === 'all') return records;
    const consumer = getLiveEventConsumer(filter);
    if (!consumer) return records;
    return records.filter(record => consumer.listensTo(record.event));
  }, [filter, records]);

  useEffect(() => {
    if (paused) return;
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' });
    }
  }, [filteredRecords.length, paused]);

  const handleClear = () => {
    clearLiveEventAudit();
  };

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(JSON.stringify(filteredRecords, null, 2));
  };

  const filters = useMemo<{ value: LiveOutputFilter; label: string }[]>(() => [
    { value: 'all', label: 'All' },
    ...LIVE_EVENT_CONSUMERS.map(c => ({ value: c.id as LiveOutputFilter, label: c.label })),
  ], []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--border)', padding: '3px', borderRadius: 8 }}>
          {filters.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              className={filter === value ? 'btn-primary' : 'btn-ghost'}
              onClick={() => setFilter(value)}
              style={{
                padding: '4px 12px',
                fontSize: '0.85rem',
                borderRadius: '6px',
                height: '30px',
                border: 'none',
                background: filter === value ? 'var(--accent)' : 'transparent',
                color: filter === value ? '#fff' : 'var(--text-primary)',
                fontWeight: filter === value ? 600 : 400,
                cursor: 'pointer',
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

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
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
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatProgress(jobPayload?.active_segment_progress)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatGroup(jobPayload)}</td>
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
