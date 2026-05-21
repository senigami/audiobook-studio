import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  clearTtsCommunicationTimeline,
  getTtsCommunicationTimeline,
  subscribeTtsCommunicationTimeline,
  type TtsCommunicationTimelineEntry,
} from '@/utils/runtimeDebug';

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

const formatWeight = (entry: TtsCommunicationTimelineEntry) => {
  const completed = entry.completed_render_weight;
  const total = entry.total_render_weight;
  const active = entry.active_render_group_weight;
  if (typeof completed !== 'number' && typeof total !== 'number' && typeof active !== 'number') {
    return '-';
  }
  return `${completed ?? '-'}/${total ?? '-'} active ${active ?? '-'}`;
};

const formatGroup = (entry: TtsCommunicationTimelineEntry) => {
  if (typeof entry.active_render_group_index !== 'number' && typeof entry.render_group_count !== 'number') {
    return '-';
  }
  return `${entry.active_render_group_index ?? '-'}/${entry.render_group_count ?? '-'}`;
};

const formatCompletedGroups = (entry: TtsCommunicationTimelineEntry) => {
  if (typeof entry.completed_render_groups !== 'number' && typeof entry.render_group_count !== 'number') {
    return '-';
  }
  return `${entry.completed_render_groups ?? '-'}/${entry.render_group_count ?? '-'}`;
};

const rowText = (entry: TtsCommunicationTimelineEntry) => {
  if (entry.kind === 'tts_log') return entry.line ?? entry.raw;
  return entry.message ?? entry.line ?? entry.raw;
};

export const LiveOutputTab: React.FC<LiveOutputTabProps> = ({ chapterId, currentJobId }) => {
  const [entries, setEntries] = useState<TtsCommunicationTimelineEntry[]>(() => getTtsCommunicationTimeline());
  const [filter, setFilter] = useState<LiveOutputFilter>('all');

  const [paused, setPaused] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const refresh = () => setEntries(getTtsCommunicationTimeline());
    refresh();
    return subscribeTtsCommunicationTimeline(refresh);
  }, []);

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    if (filter === 'job' && currentJobId) {
      return entries.filter(entry => entry.job_id === currentJobId);
    }
    return entries.filter(entry => entry.chapter_id === chapterId || entry.job_id === currentJobId);
  }, [chapterId, currentJobId, entries, filter]);

  useEffect(() => {
    if (paused) return;
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'end' });
    }
  }, [filteredEntries.length, paused]);

  const handleClear = () => {
    clearTtsCommunicationTimeline();
    setEntries([]);
  };

  const handleCopy = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(JSON.stringify(filteredEntries, null, 2));
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
          {filteredEntries.length} / {entries.length} entries
        </span>
        <span
          data-testid="audience-legend"
          style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(96, 165, 250, 0.35)' }} />
            Queue
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(251, 191, 36, 0.35)' }} />
            Chapter
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: 'rgba(52, 211, 153, 0.35)' }} />
            Both
          </span>
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr>
              {['Time', 'Consumer', 'Kind', 'Event', 'Job', 'Segment', 'Progress', 'Seg %', 'Group', 'Done', 'Weight', 'Reason', 'Source', 'Line / message'].map((label) => (
                <th key={label} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 && (
              <tr>
                <td colSpan={14} style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                  No live output captured yet.
                </td>
              </tr>
            )}
            {filteredEntries.map((entry, index) => {
              const audienceBg: Record<string, string> = {
                queue: 'rgba(96, 165, 250, 0.08)',   // blue tint
                chapter: 'rgba(251, 191, 36, 0.08)', // yellow tint
                both: 'rgba(52, 211, 153, 0.08)',    // green tint
              };
              const rowBg = audienceBg[entry.audience] ?? undefined;
              return (
              <tr
                key={`${entry.receivedAt}-${entry.sequence ?? 'n'}-${entry.job_id ?? 'job'}-${entry.type ?? 'event'}-${index}`}
                data-audience={entry.audience}
                style={rowBg ? { background: rowBg } : undefined}
              >
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatTime(entry.receivedAt)}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', opacity: 0.75, fontSize: '0.72rem' }}>{entry.listener}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)' }}>{entry.kind}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{entry.marker ?? entry.type ?? '-'}</td>
                <td title={entry.job_id ?? ''} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{shortId(entry.job_id)}</td>
                <td title={entry.active_segment_id ?? ''} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{shortId(entry.active_segment_id)}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatProgress(entry.progress)}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatProgress(entry.active_segment_progress)}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatGroup(entry)}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatCompletedGroups(entry)}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{formatWeight(entry)}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{entry.reason_code ?? '-'}</td>
                <td title={entry.source ?? ''} style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.source ?? '-'}</td>
                <td style={{ padding: '0.45rem 0.5rem', borderBottom: '1px solid var(--border)', minWidth: 320, whiteSpace: 'pre-wrap' }}>{rowText(entry)}</td>
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
