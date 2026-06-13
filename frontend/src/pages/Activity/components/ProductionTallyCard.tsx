import React from 'react';
import { Volume2, RefreshCw } from 'lucide-react';
import { api } from '@/api';
import type { RenderStats } from '@/types';

type HomePayload = {
  render_stats?: RenderStats;
};

const formatDurationSmart = (seconds: number): string => {
  const totalMinutes = Math.max(0, Math.round(seconds / 60));
  if (totalMinutes <= 0) return '0m';
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

const formatSinceDate = (timestamp?: number | null): string => {
  if (!timestamp) return 'first render';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(timestamp * 1000));
};

export const ProductionTallyCard: React.FC = () => {
  const [data, setData] = React.useState<HomePayload | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;

    const loadTally = async (): Promise<void> => {
      try {
        const home = await api.fetchHome() as HomePayload;
        if (!cancelled) {
          setData(home);
        }
      } catch (error) {
        console.error('Failed to load production tally', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadTally();

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <section
        aria-label="Production tally"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          padding: '1rem',
          borderRadius: 'var(--radius-panel)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-sm)',
          color: 'var(--text-muted)',
        }}
      >
        <RefreshCw size={16} className="spin" />
        <span style={{ fontSize: '0.85rem', fontWeight: 700 }}>Gathering production tally...</span>
      </section>
    );
  }

  const renderStats: RenderStats = data?.render_stats || {
    sample_count: 0,
    word_count: 0,
    chars: 0,
    audio_duration_seconds: 0,
    render_duration_seconds: 0,
    audio_hours_rendered: 0,
    render_hours_spent: 0,
    by_engine: [],
  };

  const audioDurationSeconds = typeof renderStats.audio_duration_seconds === 'number' ? renderStats.audio_duration_seconds : 0;
  const wordCount = typeof renderStats.word_count === 'number' ? renderStats.word_count : 0;
  const chars = typeof renderStats.chars === 'number' ? renderStats.chars : 0;

  return (
    <section
      aria-label="Production tally"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
        padding: '1rem',
        borderRadius: 'var(--radius-panel)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)' }}>
          <Volume2 size={16} />
          <span style={{ fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Production
          </span>
        </div>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            {formatDurationSmart(audioDurationSeconds)}
          </span>
          <span style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Audio
          </span>
        </div>
        <div style={{ marginTop: '0.3rem', fontSize: '0.92rem', color: 'var(--text-secondary)', fontWeight: 600, lineHeight: 1.4 }}>
          {wordCount.toLocaleString()} words<br />
          {chars.toLocaleString()} characters
        </div>
        <div style={{ marginTop: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          <RefreshCw size={12} />
          <span>Tally since {formatSinceDate(renderStats.since_timestamp)}</span>
        </div>
      </div>

      <div style={{ position: 'absolute', right: '-10%', bottom: '-20%', opacity: 0.04, color: 'var(--accent)', transform: 'rotate(-15deg)' }}>
        <Volume2 size={120} />
      </div>
    </section>
  );
};

