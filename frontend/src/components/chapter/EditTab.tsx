import React from 'react';
import { RefreshCw, Info, AlertTriangle } from 'lucide-react';
import type { Chapter } from '../../types';

interface EditTabProps {
  text: string;
  setText: (text: string) => void;
  analysis: any;
  setAnalysis: React.Dispatch<React.SetStateAction<any>>;
  analyzing: boolean;
  chapter: Chapter;
  segmentsCount: number;
  hasUnsavedChanges: boolean;
}

export const EditTab: React.FC<EditTabProps> = ({
  text,
  setText,
  analysis,
  setAnalysis,
  analyzing,
  chapter,
  segmentsCount,
  hasUnsavedChanges
}) => {
  const isTextChanged = (text || "").replace(/\r\n/g, '\n') !== (chapter.text_content || "").replace(/\r\n/g, '\n');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', minHeight: 0 }}>
      {hasUnsavedChanges && isTextChanged && (
          <div style={{ 
              display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', 
              background: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', 
              borderRadius: '10px', color: 'rgb(146, 64, 14)', fontSize: '0.88rem' 
          }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <div>
                  <strong>Unsaved changes detected.</strong> Saving raw text changes will resync production blocks and may cause loss of block-level character/voice assignments.
              </div>
          </div>
      )}
      <textarea 
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Start typing your chapter text here..."
          style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '12px',
              padding: '1.5rem',
              fontSize: '1.05rem',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              outline: 'none',
              resize: 'none',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              overflowY: 'auto'
          }}
      />
      {/* Analysis Stats Strip */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '10px', padding: '0.6rem 1rem', display: 'flex', gap: '1.25rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Spinner or icon */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, flexShrink: 0 }}>
              {analyzing
                  ? <RefreshCw size={12} className="animate-spin" color="var(--accent)" />
                  : <Info size={12} />}
              <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontSize: '0.65rem' }}>Analysis</span>
          </div>
          {/* Stat pills */}
          {([
              { label: 'Chars', value: analysis?.char_count?.toLocaleString() ?? (chapter.char_count ?? 0).toLocaleString() },
              { label: 'Words', value: analysis?.word_count?.toLocaleString() ?? (chapter.word_count ?? 0).toLocaleString() },
              { label: 'Sentences', value: analysis?.sent_count?.toLocaleString() ?? '—' },
              { label: 'Segments', value: segmentsCount.toLocaleString() },
          ] as { label: string; value: string | number }[]).map(({ label, value }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                  <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
              </div>
          ))}
          {/* Est. Gen. Time */}
          {analysis?.predicted_seconds != null && (
              <>
                  <div style={{ width: '1px', height: '16px', background: 'var(--border)', flexShrink: 0 }} />
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--accent)' }}>
                          {analysis.predicted_seconds >= 3600
                              ? `${Math.floor(analysis.predicted_seconds / 3600)}h ${Math.floor((analysis.predicted_seconds % 3600) / 60)}m`
                              : analysis.predicted_seconds >= 60
                                  ? `${Math.floor(analysis.predicted_seconds / 60)}m ${analysis.predicted_seconds % 60}s`
                                  : `${analysis.predicted_seconds}s`}
                      </span>
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Gen.</span>
                  </div>
              </>
          )}
          {/* Long sentence badges */}
          {analysis?.raw_long_sentences > 0 && (
              <>
                  <div style={{ width: '1px', height: '16px', background: 'var(--border)', flexShrink: 0 }} />
                  <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                      background: analysis.uncleanable === 0 ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                      border: `1px solid ${analysis.uncleanable === 0 ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
                      borderRadius: '6px', padding: '0.2rem 0.5rem'
                  }}>
                      <AlertTriangle size={11} color={analysis.uncleanable === 0 ? 'var(--success-text)' : 'var(--warning)'} />
                      <span style={{ fontSize: '0.7rem', fontWeight: 600, color: analysis.uncleanable === 0 ? 'var(--success-text)' : 'var(--warning)' }}>
                          {analysis.auto_fixed}/{analysis.raw_long_sentences} long sentences auto-fixed
                      </span>
                  </div>
                  {analysis.uncleanable > 0 && (
                      <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: '6px', padding: '0.2rem 0.5rem', cursor: 'pointer'
                      }}
                          onClick={() => setAnalysis((prev: any) => ({ ...prev, _showUncleanable: !prev?._showUncleanable }))}
                      >
                          <AlertTriangle size={11} color="var(--error)" />
                          <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--error)' }}>
                              ⚠ ACTION REQUIRED: {analysis.uncleanable} unresolvable {analysis._showUncleanable ? '▲' : '▼'}
                          </span>
                      </div>
                  )}
              </>
          )}
      </div>
      {/* Unresolvable sentence detail panel */}
      {analysis?.uncleanable > 0 && analysis?._showUncleanable && (
          <div style={{
              flexShrink: 0,
              background: 'rgba(239,68,68,0.05)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
          }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--error)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  !!! Action Required — These sentences are still too long after auto-split:
              </div>
              {(analysis.uncleanable_sentences || []).map((s: any, i: number) => (
                  <div key={i} style={{
                      background: 'var(--surface)',
                      borderRadius: '6px',
                      padding: '0.5rem 0.75rem',
                      borderLeft: '3px solid var(--error)'
                  }}>
                      <div style={{ fontSize: '0.65rem', color: 'var(--error)', fontWeight: 600, marginBottom: '0.25rem' }}>
                          {s.length} characters — manually shorten or split this sentence:
                      </div>
                      <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, fontFamily: 'serif' }}>
                          {s.text}
                      </div>
                  </div>
              ))}
          </div>
      )}
    </div>
  );
};
