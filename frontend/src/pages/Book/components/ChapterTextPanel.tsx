import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { ResyncPreviewModal } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import { useChapterText } from '@/pages/Book/lib/useChapterText';
import type { Chapter } from '@/types';

interface ChapterTextPanelProps {
  chapter: Chapter | null;
  onSaved?: () => Promise<void> | void;
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function SaveChip({ state }: { state: ReturnType<typeof useChapterText>['saveState'] }) {
  if (state === 'saving') return <span className="chapter-text-panel__chip">saving...</span>;
  if (state === 'saved') return <span className="chapter-text-panel__chip chapter-text-panel__chip--saved">editing - autosaved ✓</span>;
  if (state === 'error') return <span className="chapter-text-panel__chip chapter-text-panel__chip--error">autosave failed</span>;
  return <span className="chapter-text-panel__chip">editing</span>;
}

export function ChapterTextPanel({ chapter, onSaved }: ChapterTextPanelProps) {
  const chapterText = useChapterText(chapter, onSaved);
  const [showUnlockWarning, setShowUnlockWarning] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!chapter) {
    return (
      <section className="chapter-text-panel" aria-label="Chapter preview">
        <div className="chapter-text-panel__empty">Select a chapter to preview its manuscript.</div>
      </section>
    );
  }

  const canEditDirectly = !chapterText.isProduced || unlocked;
  const isUnlockedProduced = chapterText.isProduced && unlocked;

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

  return (
    <section className="chapter-text-panel" aria-label="Chapter preview">
      <div className="chapter-text-panel__header">
        <div>
          <span className="chapter-text-panel__eyebrow">{chapterText.lifecycle}</span>
          <h2>{chapterText.chapter?.title || chapter.title}</h2>
        </div>
        {!canEditDirectly && (
          <button type="button" className="btn-ghost" onClick={() => setShowUnlockWarning(true)}>
            Edit text
          </button>
        )}
        {canEditDirectly && !chapterText.isProduced && <SaveChip state={chapterText.saveState} />}
      </div>

      {showUnlockWarning && !unlocked && (
        <div className="chapter-text-panel__warning" role="alert">
          <AlertTriangle size={18} />
          <p>Editing re-analyzes this chapter. Voice assignments are matched best-effort - some may be lost.</p>
          <button type="button" className="btn-primary" onClick={() => { setUnlocked(true); setShowUnlockWarning(false); }}>
            Edit anyway
          </button>
          <button type="button" className="btn-ghost" onClick={() => setShowUnlockWarning(false)}>
            Cancel
          </button>
        </div>
      )}

      {isUnlockedProduced && (
        <div className="chapter-text-panel__unlock-strip">
          Assignment-safe edit mode. Changes are not saved until you commit them.
        </div>
      )}

      {canEditDirectly ? (
        <textarea
          aria-label="Chapter manuscript text"
          value={chapterText.text}
          onChange={(event) => chapterText.setText(event.target.value)}
          disabled={chapterText.loading}
          className="chapter-text-panel__textarea"
          placeholder="Start typing your chapter text here..."
        />
      ) : (
        <pre className="chapter-text-panel__preview">{chapterText.text}</pre>
      )}

      <div className="chapter-text-panel__footer">
        <span>{wordCount(chapterText.text).toLocaleString()} words</span>
        {isUnlockedProduced && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => void handleCommitProduced()}
            disabled={!chapterText.hasTextChanges || chapterText.previewLoading || chapterText.resyncing}
          >
            Commit changes
          </button>
        )}
      </div>

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
