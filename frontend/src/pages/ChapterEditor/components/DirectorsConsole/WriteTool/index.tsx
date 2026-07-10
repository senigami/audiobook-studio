import React, { useCallback } from 'react';
import { FileText } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { DirectorsTool } from '../types';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { ChapterTextPanel } from '@/pages/Book/components/ChapterTextPanel';
import { useDirtyGuard } from '../DirtyGuardContext';

/**
 * Write mode — the full chapter source editor. Thin wrapper around the
 * already-working `ChapterTextPanel`/`useChapterText` (unchanged), matching
 * Contents' existing full-text-edit behavior for the same chapter, including
 * the produced-chapter lock/warning banner. See
 * design-docs/workflows/chapter-editor-modes.md §7b/§13.
 *
 * Dirty-exit guard (DirtyGuardContext.tsx): forwards `ChapterTextPanel`'s
 * `onDirtyChange` (uncommitted produced-chapter edit) up to the console so
 * switching rail tabs mid-edit prompts a confirm instead of silently
 * discarding the rewrite.
 */
const WriteToolBody: React.FC = () => {
  const { chapters, reload } = useBookDataContext();
  const [searchParams] = useSearchParams();
  const { setDirty } = useDirtyGuard();
  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;
  const selectedChapter = chapters.find((chapter) => chapter.id === resolvedChapterId) || null;

  const handleDirtyChange = useCallback((dirty: boolean) => {
    setDirty(dirty, dirty ? 'Uncommitted chapter text edit' : undefined);
  }, [setDirty]);

  return <ChapterTextPanel chapter={selectedChapter} onSaved={reload} onDirtyChange={handleDirtyChange} />;
};

export const WriteTool: DirectorsTool = {
  id: 'write',
  label: 'Write',
  icon: FileText,
  component: WriteToolBody,
  demoPlaceholder: false
};
