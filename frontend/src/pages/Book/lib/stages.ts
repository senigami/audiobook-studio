export const BOOK_STAGES = ['contents', 'cast', 'publish', 'backups'] as const;

export type BookStage = (typeof BOOK_STAGES)[number];

export const BOOK_STAGE_LABELS: Record<BookStage, string> = {
  contents: 'Contents',
  cast: 'Cast',
  publish: 'Publish',
  backups: 'Backups',
};

export function isBookStage(value: string | undefined): value is BookStage {
  return BOOK_STAGES.includes(value as BookStage);
}

export function getBookStageStorageKey(bookId: string): string {
  return `studio.book.${bookId}.lastStage`;
}

export function getLastStage(bookId: string): BookStage {
  if (typeof window === 'undefined') {
    return 'contents';
  }

  try {
    const stored = window.localStorage.getItem(getBookStageStorageKey(bookId));
    const storedStage = stored ?? undefined;
    if (isBookStage(storedStage)) {
      return storedStage;
    }

    return 'contents';
  } catch {
    return 'contents';
  }
}

export function setLastStage(bookId: string, stage: BookStage): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getBookStageStorageKey(bookId), stage);
  } catch {
    // Ignore storage errors; the route itself remains authoritative.
  }
}

/** Storage key for the last-opened chapter within a book (used to restore the workspace). */
export function getLastChapterStorageKey(bookId: string): string {
  return `studio.book.${bookId}.lastChapter`;
}

export function getLastChapter(bookId: string): string | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(getLastChapterStorageKey(bookId)) ?? null;
  } catch {
    return null;
  }
}

export function setLastChapter(bookId: string, chapterId: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(getLastChapterStorageKey(bookId), chapterId);
  } catch {
    // Ignore storage errors.
  }
}
