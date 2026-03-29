import React from 'react';
import { ArrowLeft, RefreshCw, Zap, CheckCircle, AlertTriangle } from 'lucide-react';
import type { Chapter, Job } from '../../types';

interface ChapterHeaderProps {
  chapter: Chapter;
  title: string;
  setTitle: (title: string) => void;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onBack: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  availableVoices: { id: string; name: string; value: string; is_speaker: boolean }[];
  submitting: boolean;
  queueLocked?: boolean;
  queuePending?: boolean;
  job?: Job;
  generatingSegmentIdsCount: number;
  queueLabel?: string;
  queueTitle?: string;
  onQueue: () => void;
  onStopAll: () => void;
}

export const ChapterHeader: React.FC<ChapterHeaderProps> = ({
  chapter,
  title,
  setTitle,
  saving,
  hasUnsavedChanges,
  onBack,
  onPrev,
  onNext,
  selectedVoice,
  onVoiceChange,
  availableVoices,
  submitting,
  queueLocked = false,
  queuePending = false,
  job,
  generatingSegmentIdsCount,
  queueLabel = 'Queue',
  queueTitle = 'Queue Chapter',
  onQueue,
  onStopAll
}) => {
  const hasChapterAudio = !!(chapter.has_wav || chapter.has_mp3 || chapter.has_m4a);
  const queueStatus = queuePending
    ? 'Queued'
    : job?.status === 'queued'
      ? 'Queued'
      : job?.status === 'preparing'
        ? 'Preparing'
        : job?.status === 'running'
          ? 'Rendering'
          : job?.status === 'finalizing'
            ? 'Finalizing'
          : chapter?.audio_status === 'processing'
              ? 'Processing'
              : null;
  const isQueued = queueStatus === 'Queued';

  return (
    <header style={{ 
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 1.5rem', 
      borderBottom: '1px solid var(--border)', background: 'var(--surface)',
      flexShrink: 0
    }}>
      <button onClick={onBack} className="btn-ghost" style={{ padding: '0.5rem' }} title="Save & Back to Project">
        <ArrowLeft size={18} />
      </button>
      <div style={{ display: 'flex', gap: '0.25rem', borderRight: '1px solid var(--border)', paddingRight: '1rem' }}>
        <button 
          onClick={onPrev} 
          disabled={!onPrev} 
          className="btn-ghost" 
          style={{ padding: '0.4rem', opacity: !onPrev ? 0.3 : 1, cursor: !onPrev ? 'not-allowed' : 'pointer' }}
          title="Save & Previous Chapter"
        >
          ← Prev
        </button>
        <button 
          onClick={onNext} 
          disabled={!onNext} 
          className="btn-ghost" 
          style={{ padding: '0.4rem', opacity: !onNext ? 0.3 : 1, cursor: !onNext ? 'not-allowed' : 'pointer' }}
          title="Save & Next Chapter"
        >
          Next →
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
          <input 
              value={title}
              onChange={e => setTitle(e.target.value)}
              style={{
                  fontSize: '1.25rem', fontWeight: 600, background: 'transparent', border: 'none', 
                  color: 'var(--text-primary)', outline: 'none', width: '100%',
                  padding: '0.25rem'
              }}
          />
          
          {hasChapterAudio && (
              <div style={{ paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
                  {(() => {
                      const audioPath = chapter.audio_file_path;
                      if (!audioPath) {
                        return (
                          <audio
                              controls
                              key={chapter.id}
                              style={{ height: '32px', maxWidth: '300px' }}
                          >
                              <source src={`/projects/${chapter.project_id}/audio/${chapter.id}.mp3`} />
                              <source src={`/projects/${chapter.project_id}/audio/${chapter.id}.wav`} />
                              <source src={`/out/xtts/${chapter.id}.mp3`} />
                              <source src={`/out/xtts/${chapter.id}.wav`} />
                          </audio>
                        );
                      }
                      const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
                      const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');
                      
                      return (
                          <audio 
                              controls 
                              key={chapter.id}
                              style={{ height: '32px', maxWidth: '300px' }}
                          >
                              <source src={`/projects/${chapter.project_id}/audio/${audioPath}`} />
                              {audioPath !== wavPath && <source src={`/projects/${chapter.project_id}/audio/${wavPath}`} />}
                              {audioPath !== mp3Path && <source src={`/projects/${chapter.project_id}/audio/${mp3Path}`} />}
                              <source src={`/out/xtts/${audioPath}`} />
                              {audioPath !== wavPath && <source src={`/out/xtts/${wavPath}`} />}
                              {audioPath !== mp3Path && <source src={`/out/xtts/${mp3Path}`} />}
                          </audio>
                      );
                  })()}
              </div>
          )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {availableVoices.length > 0 && (
              <select
                  value={selectedVoice}
                  onChange={(e) => onVoiceChange(e.target.value)}
                  style={{
                      padding: '0.4rem 2rem 0.4rem 0.8rem',
                      borderRadius: '8px', border: '1px solid var(--border)',
                      background: 'var(--surface-light)', color: 'var(--text-primary)',
                      fontSize: '0.85rem', outline: 'none', cursor: 'pointer',
                      appearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.5rem center'
                  }}
                  title="Select Voice Profile for this chapter"
              >
                  <option value="">Use Project Default</option>
                  {availableVoices.map(v => (
                      <option key={v.id} value={v.value}>{v.name}</option>
                  ))}
              </select>
          )}

              <button
              onClick={onQueue}
              disabled={queueLocked}
              className="btn-primary"
              style={{
                  padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  opacity: queueLocked ? 0.3 : 1,
                  cursor: queueLocked ? 'not-allowed' : 'pointer'
              }}
              title={queueLocked ? "Already processing" : queueTitle}
              >
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              {queueLabel}
          </button>

          {queueStatus && (
              <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.35rem 0.65rem',
                  borderRadius: '999px',
                  background: isQueued ? 'var(--accent)' : 'var(--accent-tint)',
                  color: isQueued ? 'white' : 'var(--accent)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  border: '1px solid var(--accent)',
                  boxShadow: isQueued ? '0 0 0 1px var(--accent-glow)' : 'none'
              }}>
                  {queueStatus}
              </div>
          )}

          {(generatingSegmentIdsCount > 0 || chapter?.audio_status === 'processing') && (
              <button
                  onClick={onStopAll}
                  className="btn-ghost"
                  style={{
                      padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: 'var(--error)', 
                      border: '1px solid var(--error-muted)', borderRadius: '8px',
                      display: 'flex', alignItems: 'center', gap: '0.4rem'
                  }}
              >
                  Stop All
              </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', background: 'var(--surface-light)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '0.8rem', color: saving ? 'var(--warning)' : (hasUnsavedChanges ? 'var(--accent)' : 'var(--success-text)'), display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : (hasUnsavedChanges ? <AlertTriangle size={14} /> : <CheckCircle size={14} color="var(--success)" />)}
                  {saving ? 'Saving...' : (hasUnsavedChanges ? 'Unsaved' : 'Saved')}
              </span>
          </div>
      </div>
    </header>
  );
};
