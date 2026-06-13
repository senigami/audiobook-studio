import { useMemo, useState } from 'react';
import { AlertTriangle, Info, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Chapter } from '@/types';

export interface StudioAnalysis {
  char_count?: number | null;
  word_count?: number | null;
  sent_count?: number | null;
  predicted_seconds?: number | null;
  raw_long_sentences?: number | null;
  auto_fixed?: number | null;
  uncleanable?: number | null;
  uncleanable_sentences?: Array<{ text: string; length: number }>;
}

interface AnalysisStripProps {
  bookId: string;
  chapterId: string;
  chapter: (Pick<Chapter, 'char_count' | 'word_count' | 'sent_count'> & { predicted_audio_length?: number | null }) | null | undefined;
  analysis: StudioAnalysis | null | undefined;
  analyzing?: boolean;
  segmentsCount: number;
}

function formatDuration(seconds?: number | null): string {
  if (seconds == null || Number.isNaN(seconds)) return '—';
  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}m ${remainder}s`;
  }
  return `${Math.floor(seconds)}s`;
}

export function AnalysisStrip({
  bookId,
  chapterId,
  chapter,
  analysis,
  analyzing = false,
  segmentsCount,
}: AnalysisStripProps) {
  const [showLongSentenceDetails, setShowLongSentenceDetails] = useState(false);

  const stats = useMemo(() => ({
    chars: analysis?.char_count ?? chapter?.char_count ?? 0,
    words: analysis?.word_count ?? chapter?.word_count ?? 0,
    sentences: analysis?.sent_count ?? chapter?.sent_count ?? 0,
    segments: segmentsCount,
    estimatedSeconds: analysis?.predicted_seconds ?? chapter?.predicted_audio_length ?? null,
  }), [analysis, chapter, segmentsCount]);

  const rawLongSentenceCount = analysis?.raw_long_sentences ?? 0;
  const autoFixedCount = analysis?.auto_fixed ?? 0;
  const uncleanableCount = analysis?.uncleanable ?? 0;
  const uncleanableSentences = analysis?.uncleanable_sentences ?? [];
  const hasLongSentenceData = rawLongSentenceCount > 0;
  const hasActionRequired = uncleanableCount > 0;

  const toggleDetails = () => {
    if (!hasActionRequired) return;
    setShowLongSentenceDetails((current) => !current);
  };

  return (
    <section className="studio-analysis-strip" aria-label="Chapter analysis">
      <div className="studio-analysis-strip__summary">
        <div className="studio-analysis-strip__eyebrow">
          {analyzing ? <RefreshCw size={12} className="animate-spin" /> : <Info size={12} />}
          <span>Analysis</span>
        </div>

        <div className="studio-analysis-strip__stats">
          {[
            { label: 'Chars', value: stats.chars.toLocaleString() },
            { label: 'Words', value: stats.words.toLocaleString() },
            { label: 'Sentences', value: stats.sentences.toLocaleString() },
            { label: 'Segments', value: stats.segments.toLocaleString() },
          ].map(({ label, value }) => (
            <div key={label} className="studio-analysis-strip__stat">
              <span className="studio-analysis-strip__value">{value}</span>
              <span className="studio-analysis-strip__label">{label}</span>
            </div>
          ))}

          {stats.estimatedSeconds != null && (
            <>
              <div className="studio-analysis-strip__divider" />
              <div className="studio-analysis-strip__stat">
                <span className="studio-analysis-strip__value studio-analysis-strip__value--accent">
                  {formatDuration(stats.estimatedSeconds)}
                </span>
                <span className="studio-analysis-strip__label">Est. Gen.</span>
              </div>
            </>
          )}
        </div>

        {hasLongSentenceData && (
          <div className="studio-analysis-strip__badges">
            <div className="studio-analysis-strip__badge studio-analysis-strip__badge--success" aria-label={`${autoFixedCount} of ${rawLongSentenceCount} long sentences auto-fixed`}>
              <AlertTriangle size={11} />
              <span>{autoFixedCount}/{rawLongSentenceCount} auto-fixed</span>
            </div>

            {hasActionRequired && (
              <button
                type="button"
                className="studio-analysis-strip__badge studio-analysis-strip__badge--warning"
                onClick={toggleDetails}
                aria-expanded={showLongSentenceDetails}
                aria-controls="studio-analysis-strip-details"
              >
                <AlertTriangle size={11} />
                <span>⚠ ACTION REQUIRED: {uncleanableCount} unresolvable {showLongSentenceDetails ? '▲' : '▼'}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {hasActionRequired && showLongSentenceDetails && (
        <div className="studio-analysis-strip__details" id="studio-analysis-strip-details">
          <div className="studio-analysis-strip__details-head">
            These sentences are still too long after auto-split:
          </div>

          <div className="studio-analysis-strip__detail-list">
            {uncleanableSentences.map((sentence) => (
              <div key={`${sentence.length}-${sentence.text}`} className="studio-analysis-strip__detail">
                <div className="studio-analysis-strip__detail-meta">
                  {sentence.length} characters
                </div>
                <div className="studio-analysis-strip__detail-text">
                  {sentence.text}
                </div>
              </div>
            ))}
          </div>

          <Link
            to={`/book/${bookId}/manuscript?chapter=${chapterId}`}
            className="studio-analysis-strip__edit-link"
          >
            Edit in Manuscript
          </Link>
        </div>
      )}
    </section>
  );
}
