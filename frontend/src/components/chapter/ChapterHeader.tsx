import React from 'react';
import { RefreshCw, Zap, CheckCircle, AlertTriangle, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Chapter, Job } from '../../types';
import { PredictiveProgressBar } from '../PredictiveProgressBar';
import { VoiceProfileSelect } from './VoiceProfileSelect';

const RECENT_DONE_WINDOW_SECONDS = 60;

interface ChapterHeaderProps {
  chapter: Chapter;
  title?: string;
  setTitle?: (title: string) => void;
  saving: boolean;
  hasUnsavedChanges: boolean;
  onBack?: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  selectedVoice: string;
  onVoiceChange: (voice: string) => void;
  availableVoices: import('../../utils/voiceProfiles').VoiceOption[];
  defaultVoiceLabel?: string;
  submitting: boolean;
  queueLocked?: boolean;
  queuePending?: boolean;
  job?: Job;
  generatingJob?: Job;
  generatingSegmentIdsCount: number;
  queueLabel?: string;
  queueTitle?: string;
  onSaveWav?: () => void;
  onSaveMp3?: () => void;
  exportingFormat?: 'wav' | 'mp3' | null;
  onQueue: () => void;
  onStopAll: () => void;
  onCommitSourceText?: () => void;
  canCommitSourceText?: boolean;
}

export const ChapterHeader: React.FC<ChapterHeaderProps> = ({
  chapter,
  title,
  setTitle,
  saving,
  hasUnsavedChanges,
  onPrev,
  onNext,
  selectedVoice,
  onVoiceChange,
  availableVoices,
  defaultVoiceLabel = 'Use Project Default',
  submitting,
  queueLocked = false,
  queuePending = false,
  job,
  generatingJob,
  generatingSegmentIdsCount,
  queueLabel = 'Queue',
  queueTitle = 'Queue Chapter',
  onSaveWav,
  onSaveMp3,
  exportingFormat = null,
  onQueue,
  onStopAll,
  onCommitSourceText,
  canCommitSourceText
}) => {
  const hasChapterAudio = !!(chapter.has_wav || chapter.has_mp3 || chapter.has_m4a);
  const recentlyFinishedDoneJob = !!(job?.status === 'done' && job?.finished_at && ((Date.now() / 1000) - job.finished_at) <= RECENT_DONE_WINDOW_SECONDS);
  const rawQueueStatus = queuePending
    ? 'Queued'
    : job?.status === 'queued'
      ? 'Queued'
      : job?.status === 'preparing'
        ? 'Preparing'
        : job?.status === 'running'
          ? 'Rendering'
          : job?.status === 'finalizing'
            ? 'Finalizing'
            : generatingSegmentIdsCount > 0
              ? 'Processing'
            : chapter?.audio_status === 'processing'
              ? 'Processing'
              : recentlyFinishedDoneJob && !hasChapterAudio
                ? 'Finalizing'
                : null;
  const [heldQueueStatus, setHeldQueueStatus] = React.useState<string | null>(null);
  const releaseHoldTimerRef = React.useRef<number | null>(null);
  const lastActiveQueueStatusRef = React.useRef<string | null>(null);
  const holdUntilRef = React.useRef<number>(0);
  const queueStatus = heldQueueStatus ?? rawQueueStatus;
  const effectiveQueueLocked = queueLocked || !!queueStatus || chapter.audio_status === 'processing';
  const isQueued = queueStatus === 'Queued';
  const liveSegmentProgressJob = generatingJob && ['preparing', 'running', 'finalizing'].includes(generatingJob.status)
    ? generatingJob
    : undefined;
  const liveSegmentProgressValue = liveSegmentProgressJob
    ? (liveSegmentProgressJob.status === 'finalizing'
        ? 1
        : (liveSegmentProgressJob.active_segment_id
            ? (liveSegmentProgressJob.active_segment_progress ?? 0)
            : (liveSegmentProgressJob.progress ?? 0)))
    : 0;
  React.useEffect(() => {
    if (releaseHoldTimerRef.current !== null) {
      window.clearTimeout(releaseHoldTimerRef.current);
      releaseHoldTimerRef.current = null;
    }

    if (rawQueueStatus) {
      lastActiveQueueStatusRef.current = rawQueueStatus;
      holdUntilRef.current = Date.now() + 400;
      if (heldQueueStatus !== rawQueueStatus) {
        setHeldQueueStatus(rawQueueStatus);
      }
      return;
    }

    const shouldBridge = !hasChapterAudio
      && chapter.audio_status !== 'done'
      && holdUntilRef.current > Date.now()
      && !!lastActiveQueueStatusRef.current;

    if (shouldBridge) {
      const bridged = recentlyFinishedDoneJob ? 'Finalizing' : lastActiveQueueStatusRef.current;
      if (heldQueueStatus !== bridged) {
        setHeldQueueStatus(bridged);
      }
      const remainingMs = Math.max(0, holdUntilRef.current - Date.now());
      releaseHoldTimerRef.current = window.setTimeout(() => {
        setHeldQueueStatus(null);
        releaseHoldTimerRef.current = null;
      }, remainingMs);
      return;
    }

    if (heldQueueStatus !== null) {
      setHeldQueueStatus(null);
    }
  }, [rawQueueStatus, hasChapterAudio, chapter.audio_status, recentlyFinishedDoneJob, heldQueueStatus]);

  React.useEffect(() => () => {
    if (releaseHoldTimerRef.current !== null) {
      window.clearTimeout(releaseHoldTimerRef.current);
    }
  }, []);

  return (
    <header className="chapter-header" style={{
      display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem 0',
      background: 'var(--bg)',
      flexShrink: 0
    }}>
      <div className="chapter-header__nav" style={{ display: 'flex', gap: '0.35rem' }}>
        <button
          onClick={onPrev}
          disabled={!onPrev}
          className="btn-ghost"
          style={{
            padding: '0.4rem',
            opacity: !onPrev ? 0.3 : 1,
            cursor: !onPrev ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px'
          }}
          title="Save & Previous Chapter"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          onClick={onNext}
          disabled={!onNext}
          className="btn-ghost"
          style={{
            padding: '0.4rem',
            opacity: !onNext ? 0.3 : 1,
            cursor: !onNext ? 'not-allowed' : 'pointer',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px'
          }}
          title="Save & Next Chapter"
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="chapter-header__main" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem', minWidth: 0 }}>
          {typeof title === 'string' && setTitle && (
              <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-label="Chapter Title"
                  style={{
                      flex: 1,
                      minWidth: 0,
                      padding: '0.55rem 0.8rem',
                      borderRadius: '8px',
                      border: '1px solid var(--border)',
                      background: 'var(--surface)',
                      color: 'var(--text-primary)',
                      fontSize: '1rem',
                      fontWeight: 700,
                      outline: 'none',
                  }}
              />
          )}

          {hasChapterAudio && (
              <div className="chapter-header__audio" style={{ paddingLeft: '1rem', borderLeft: '1px solid var(--border)' }}>
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
      <div className="chapter-header__actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {(onSaveWav || onSaveMp3) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  {onSaveWav && (
                      <button
                          type="button"
                          onClick={onSaveWav}
                          className="btn-ghost"
                          style={{
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              border: '1px solid var(--border)',
                              borderRadius: '8px'
                          }}
                          title="Export WAV"
                          disabled={exportingFormat !== null}
                      >
                          {exportingFormat === 'wav' ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                          Export WAV
                      </button>
                  )}
                  {onSaveMp3 && (
                      <button
                          type="button"
                          onClick={onSaveMp3}
                          className="btn-ghost"
                          style={{
                              padding: '0.4rem 0.75rem',
                              fontSize: '0.82rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              border: '1px solid var(--border)',
                              borderRadius: '8px'
                          }}
                          title="Export MP3"
                          disabled={exportingFormat !== null}
                      >
                          {exportingFormat === 'mp3' ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
                          Export MP3
                      </button>
                  )}
              </div>
          )}

          {availableVoices.length > 0 && (
              <VoiceProfileSelect
                  value={selectedVoice}
                  onChange={onVoiceChange}
                  options={availableVoices}
                  defaultLabel={defaultVoiceLabel}
                  title="Select Voice Profile for this chapter"
                  disabled={submitting}
              />
          )}

              <button
              onClick={onQueue}
              disabled={effectiveQueueLocked}
              className="btn-primary"
              style={{
                  padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                  opacity: effectiveQueueLocked ? 0.3 : 1,
                  cursor: effectiveQueueLocked ? 'not-allowed' : 'pointer'
              }}
              title={effectiveQueueLocked ? "Already processing" : queueTitle}
              >
              {submitting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
              {queueLabel}
          </button>

          {canCommitSourceText && onCommitSourceText && (
              <button
                  onClick={onCommitSourceText}
                  className="btn-primary"
                  style={{
                      padding: '0.4rem 0.8rem', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem',
                      background: 'var(--success)', border: '1px solid var(--success-muted)'
                  }}
                  title="Commit Source Text changes and resync segments"
              >
                  <CheckCircle size={14} />
                  Commit Changes
              </button>
          )}

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

          {liveSegmentProgressJob && (
              <div style={{ width: '180px', minWidth: '180px' }}>
                  <PredictiveProgressBar
                      progress={liveSegmentProgressValue}
                      startedAt={liveSegmentProgressJob.started_at}
                      etaSeconds={liveSegmentProgressJob.eta_seconds}
                      etaBasis={liveSegmentProgressJob.eta_basis ?? (liveSegmentProgressJob.eta_seconds != null ? 'remaining_from_update' : undefined)}
                      updatedAt={liveSegmentProgressJob.updated_at}
                      persistenceKey={`${liveSegmentProgressJob.id}:${liveSegmentProgressJob.active_segment_id || 'none'}`}
                      status={liveSegmentProgressJob.status}
                      label="Segment Progress"
                      predictive={true}
                      allowBackwardProgress={false}
                      checkpointMode="segment"
                      transitionTickCount={3}
                      backwardTransitionTickCount={2}
                      tickMs={250}
                      showEta={false}
                  />
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
