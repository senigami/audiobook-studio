import { useEffect, useState } from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { ResyncPreviewModal } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import { useChapterText } from '@/pages/Book/lib/useChapterText';
import type { ChapterLifecycle } from '@/pages/Book/lib/chapterLifecycle';
import type { Chapter } from '@/types';

// Consequence-aware eyebrow wording for this editor surface only — the raw
// `ChapterLifecycle` enum ("Rendered"/"Cast") reads as text-rendering
// jargon here; readers of this panel care about "is this chapter's audio
// done" rather than the pipeline-stage name. `ChapterTable`'s status pill
// keeps the raw lifecycle value (a different surface, out of scope).
function eyebrowLabel(lifecycle: ChapterLifecycle): string {
  switch (lifecycle) {
    case 'Rendered':
      return 'Audio rendered';
    case 'Cast':
      return 'Audio in progress';
    case 'Stale':
      return 'Needs re-render';
    case 'Error':
      return 'Render error';
    case 'Ready':
      return 'Ready';
    case 'Draft':
    default:
      return 'Draft';
  }
}

interface ChapterTextPanelProps {
  chapter: Chapter | null;
  onSaved?: () => Promise<void> | void;
  /**
   * Reports whether there is an uncommitted edit to a produced chapter's
   * text (i.e. the chapter has already been Cast/Rendered/gone
   * Stale/Error and the user has unlocked + changed the text but not yet
   * committed via the resync flow). Non-produced chapters autosave, so
   * they never report dirty here. Used by DirectorsConsole's WriteTool
   * wrapper to gate rail-tab switches (see DirtyGuardContext.tsx).
   */
  onDirtyChange?: (dirty: boolean) => void;
  /**
   * `'gated'` (default) preserves the Contents/Manuscript-stage behavior:
   * a produced chapter opens read-only behind an "Edit Text" → "Edit
   * Anyway" click-through before the textarea unlocks.
   *
   * `'immediate'` is for DirectorsConsole's Write mode
   * (design-docs/workflows/chapter-editor-modes.md §7b — "always
   * accessible, no advanced gate"): the textarea is editable the moment
   * the panel mounts, with a calm persistent info banner in place of the
   * click-through warning. The commit-time `ResyncPreviewModal` is the
   * real safety net either way.
   */
  variant?: 'gated' | 'immediate';
  /**
   * Whether to render the panel's own chapter-title heading. Defaults to
   * `true` for the Contents/Manuscript-stage usage, which has no other
   * title nearby. DirectorsConsole's Write mode passes `false` —
   * `ChapterWorkspaceHeader` (rendered once, above the whole console)
   * already shows the chapter title, so this heading duplicated it within
   * ~140px (design-critique HIG finding).
   */
  showTitle?: boolean;
}

function sentenceCount(text: string): number {
  const matches = text
    .trim()
    .match(/[^.!?]+(?:[.!?]+|$)/g);
  return matches?.filter((sentence) => sentence.trim().length > 0).length ?? 0;
}

function formatDuration(seconds?: number | null): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return '—';
  }

  if (seconds >= 3600) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }

  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  }

  return `${Math.round(seconds)}s`;
}

function SaveChip({ state }: { state: ReturnType<typeof useChapterText>['saveState'] }) {
  if (state === 'saving') return <span className="chapter-text-panel__chip">saving…</span>;
  if (state === 'saved') return <span className="chapter-text-panel__chip chapter-text-panel__chip--saved">editing — autosaved <Check size={12} aria-hidden="true" /></span>;
  if (state === 'error') return <span className="chapter-text-panel__chip chapter-text-panel__chip--error">Autosave failed</span>;
  return <span className="chapter-text-panel__chip">editing</span>;
}

export function ChapterTextPanel({ chapter, onSaved, onDirtyChange, variant = 'gated', showTitle = true }: ChapterTextPanelProps) {
  const chapterText = useChapterText(chapter, onSaved);
  const [showUnlockWarning, setShowUnlockWarning] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    onDirtyChange?.(chapterText.isProduced && chapterText.hasTextChanges);
  }, [chapterText.isProduced, chapterText.hasTextChanges, onDirtyChange]);

  if (!chapter) {
    return (
      <section className="chapter-text-panel" aria-label="Chapter preview">
        <div className="chapter-text-panel__empty">Select a chapter to preview its manuscript.</div>
      </section>
    );
  }

  // Write mode (variant="immediate") never gates entry — it's always
  // effectively unlocked, per §7b. Contents/Manuscript ("gated", the
  // default) keep today's click-through unlock.
  const effectivelyUnlocked = variant === 'immediate' || unlocked;
  const canEditDirectly = !chapterText.isProduced || effectivelyUnlocked;
  const isUnlockedProduced = chapterText.isProduced && effectivelyUnlocked;
  const analysisChapter = chapterText.chapter ?? chapter;
  const analysisText = chapterText.text;
  const charCount = analysisText.length;
  const words = analysisText.trim() ? analysisText.trim().split(/\s+/).length : 0;
  const sentences = sentenceCount(analysisText);
  const segments = typeof analysisChapter?.total_segments_count === 'number' && analysisChapter.total_segments_count > 0
    ? analysisChapter.total_segments_count
    : null;
  const estimatedGeneration = analysisChapter?.predicted_audio_length ?? null;

  const handleCommitProduced = async () => {
    setPreviewOpen(true);
    await chapterText.requestResyncPreview();
  };

  const handleConfirmResync = async () => {
    const saved = await chapterText.confirmResync();
    if (saved) {
      setPreviewOpen(false);
      setUnlocked(false);
    }
  };

  const handleDiscard = () => {
    chapterText.setText(chapterText.chapter?.text_content ?? '');
    if (variant === 'gated') {
      setUnlocked(false);
    }
  };

  return (
    <section className="chapter-text-panel" aria-label="Chapter preview">
      <div className="chapter-text-panel__header">
        <div>
          <span className="chapter-text-panel__eyebrow">{eyebrowLabel(chapterText.lifecycle)}</span>
          {showTitle && <h2>{chapterText.chapter?.title || chapter.title}</h2>}
        </div>
        {!canEditDirectly && (
          <button type="button" className="btn-ghost" onClick={() => setShowUnlockWarning(true)}>
            Edit Text
          </button>
        )}
        {canEditDirectly && !chapterText.isProduced && <SaveChip state={chapterText.saveState} />}
      </div>

      {showUnlockWarning && !unlocked && (
        <div className="chapter-text-panel__warning" role="alert">
          <AlertTriangle size={18} />
          <p>Editing re-analyzes this chapter. Voice assignments are matched best-effort — some may be lost.</p>
          <button type="button" className="btn-primary" onClick={() => { setUnlocked(true); setShowUnlockWarning(false); }}>
            Edit Anyway
          </button>
          <button type="button" className="btn-ghost" onClick={() => setShowUnlockWarning(false)}>
            Cancel
          </button>
        </div>
      )}

      {isUnlockedProduced && (
        variant === 'immediate' ? (
          <div className="chapter-text-panel__info-banner" role="status">
            <Info size={16} aria-hidden="true" />
            <p>Editing the full source. Committing re-syncs voice assignments — you'll preview what's kept before anything changes.</p>
          </div>
        ) : (
          <div className="chapter-text-panel__unlock-strip">
            Changes aren't saved until you commit them.
          </div>
        )
      )}

      {canEditDirectly ? (
        <textarea
          aria-label="Chapter manuscript text"
          value={chapterText.text}
          onChange={(event) => chapterText.setText(event.target.value)}
          disabled={chapterText.loading}
          className="chapter-text-panel__textarea"
          placeholder="Start typing your chapter text here…"
        />
      ) : (
          <pre className="chapter-text-panel__preview">{chapterText.text}</pre>
      )}

      <div className="chapter-text-panel__analysis">
        <div className="chapter-text-panel__analysis-label">
          <Info size={12} />
          <span>Analysis</span>
        </div>

        {[
          { label: 'Chars', value: charCount.toLocaleString() },
          { label: 'Words', value: words.toLocaleString() },
          { label: 'Sentences', value: sentences.toLocaleString() },
          ...(segments != null ? [{ label: 'Segments', value: segments.toLocaleString() }] : []),
        ].map(({ label, value }) => (
          <div key={label} className="chapter-text-panel__analysis-stat">
            <span className="chapter-text-panel__analysis-value">{value}</span>
            <span className="chapter-text-panel__analysis-label-text">{label}</span>
          </div>
        ))}

        {estimatedGeneration != null && (
          <>
            <div className="chapter-text-panel__analysis-divider" />
            <div className="chapter-text-panel__analysis-stat">
              <span className="chapter-text-panel__analysis-value chapter-text-panel__analysis-value--accent">
                {formatDuration(estimatedGeneration)}
              </span>
              <span className="chapter-text-panel__analysis-label-text">Est. Gen.</span>
            </div>
          </>
        )}
      </div>

      {isUnlockedProduced && (
        <div className="chapter-text-panel__footer">
          <button
            type="button"
            className="btn-ghost"
            onClick={handleDiscard}
            disabled={!chapterText.hasTextChanges || chapterText.previewLoading || chapterText.resyncing}
          >
            Discard
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleCommitProduced()}
            disabled={!chapterText.hasTextChanges || chapterText.previewLoading || chapterText.resyncing}
          >
            Commit Changes
          </button>
        </div>
      )}

      <ResyncPreviewModal
        isOpen={previewOpen}
        data={chapterText.previewData}
        onConfirm={() => void handleConfirmResync()}
        onCancel={() => setPreviewOpen(false)}
        loading={chapterText.previewLoading || chapterText.resyncing}
      />
    </section>
  );
}
