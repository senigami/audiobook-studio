import { CheckSquare, Square } from 'lucide-react';
import type { Chapter } from '@/types';
import { deriveChapterLifecycle } from '@/pages/Book/lib/chapterLifecycle';
import { formatLength } from '@/utils/format';

interface AssemblyChapterPickerProps {
  chapters: Chapter[];
  selectedChapterIds: Set<string>;
  submitting?: boolean;
  onToggleChapter: (chapterId: string) => void;
  onSelectAllRendered: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function AssemblyChapterPicker({
  chapters,
  selectedChapterIds,
  submitting = false,
  onToggleChapter,
  onSelectAllRendered,
  onCancel,
  onConfirm,
}: AssemblyChapterPickerProps) {
  const renderedChapters = chapters.filter((chapter) => deriveChapterLifecycle(chapter) === 'Rendered');
  const allRenderedSelected = renderedChapters.length > 0
    && renderedChapters.every((chapter) => selectedChapterIds.has(chapter.id));

  return (
    <section className="assembly-picker" aria-label="Assembly chapter selection">
      <div className="assembly-picker__header">
        <div>
          <h2>Select chapters for assembly</h2>
          <p>Only rendered chapters can be included.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={onSelectAllRendered} disabled={renderedChapters.length === 0}>
          {allRenderedSelected ? <CheckSquare size={16} aria-hidden="true" /> : <Square size={16} aria-hidden="true" />}
          Select all rendered
        </button>
      </div>

      <div className="assembly-picker__list">
        {chapters.map((chapter, index) => {
          const lifecycle = deriveChapterLifecycle(chapter);
          const isRendered = lifecycle === 'Rendered';
          const selected = selectedChapterIds.has(chapter.id);
          const checkboxId = `assembly-chapter-${chapter.id}`;

          return (
            <label key={chapter.id} htmlFor={checkboxId} className="assembly-picker__row">
              <input
                id={checkboxId}
                type="checkbox"
                checked={selected}
                disabled={!isRendered}
                onChange={() => onToggleChapter(chapter.id)}
              />
              <span className="assembly-picker__number">{index + 1}</span>
              <span className="assembly-picker__title">{chapter.title}</span>
              <span className={`chapter-lifecycle-pill chapter-lifecycle-pill--${lifecycle.toLowerCase()}`}>{lifecycle}</span>
              <span className="assembly-picker__duration">
                {chapter.audio_length_seconds ? formatLength(chapter.audio_length_seconds) : ''}
              </span>
            </label>
          );
        })}
      </div>

      <div className="assembly-picker__footer">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button
          type="button"
          className="btn-primary"
          onClick={onConfirm}
          disabled={submitting || selectedChapterIds.size === 0}
        >
          Confirm Assembly ({selectedChapterIds.size})
        </button>
      </div>
    </section>
  );
}
