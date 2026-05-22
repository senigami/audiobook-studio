import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { LiveEvent, LiveEventRecord, JobProgressPayload } from '@/api/contracts/liveEvents';
import {
  clearLiveEventAudit,
  getLiveEventAuditSnapshot,
  subscribeLiveEventAudit,
} from '@/store/liveEventAuditStore';

type LiveOutputFilter = 'chapter' | 'job' | 'all';

interface LiveOutputTabProps {
  chapterId: string;
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

const formatGroup = (payload: JobProgressPayload | undefined) => {
  if (!payload) return '-';
  if (typeof payload.active_render_group_index !== 'number' && typeof payload.render_group_count !== 'number') {
    return '-';
  }
  return `${payload.active_render_group_index ?? '-'}/${payload.render_group_count ?? '-'}`;
};

const jobProgressPayloadFor = (event: LiveEvent): JobProgressPayload | undefined =>
  event.topic === 'jobs.progress' ? event.payload : undefined;

const messageFor = (event: LiveEvent): string => {
  if (event.topic === 'tts.logs') return event.payload.line ?? '';
  if (event.topic === 'jobs.progress') {
    const message = event.payload.message ?? '';
    const status = event.payload.status ?? '';
    if (message && status) return `[${status}] ${message}`;
    return message || status;
  }
  if (
    event.topic === 'queue.lifecycle'
    || event.topic === 'chapter.invalidate'
    || event.topic === 'segments.invalidate'
  ) {
    return event.payload.reason ?? '';
  }
  if (event.topic === 'system.unknown') {
    try {
      return JSON.stringify(event.payload);
    } catch {
      return String(event.payload);
    }
  }
  return '';
};

const reasonFor = (event: LiveEvent): string => {
  if (event.topic === 'jobs.progress') return event.payload.reason_code ?? '-';
  if (
    event.topic === 'queue.lifecycle'
    || event.topic === 'chapter.invalidate'
    || event.topic === 'segments.invalidate'
  ) {
    return event.payload.reason ?? '-';
  }
  return '-';
};

const COLUMNS = [
  'Time',
  'Topic',
  'Category',
  'Event',
  'Subscribers',
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

export const LiveOutputTab: React.FC<LiveOutputTabProps> = ({ chapterId, currentJobId }) => {
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
    if (filter === 'job' && currentJobId) {
      return records.filter(record => record.event.jobId === currentJobId);
    }
    return records.filter(
      record => record.event.chapterId === chapterId || record.event.jobId === currentJobId,
    );
  }, [chapterId, currentJobId, filter, records]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <select
          aria-label="Live output filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as LiveOutputFilter)}
          style={{ height: 36, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-primary)', padding: '0 0.5rem' }}
        >
          <option value="chapter">Current chapter</option>
          <option value="job">Current job</option>
          <option value="all">All output</option>
        </select>
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
              const subscribers = record.subscribers.map(s => s.subscriber).join(', ');
              return (
                <tr
                  key={event.frameId}
                  data-frame-id={event.frameId}
                  data-topic={event.topic}
                  data-category={event.category}
                >
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatTime(event.receivedAt)}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{event.topic}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{event.category}</td>
                  <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{event.eventKind}</td>
                  <td
                    data-testid="subscribers-cell"
                    style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', opacity: 0.85, fontSize: '0.72rem' }}
                  >
                    {subscribers || '-'}
                  </td>
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
