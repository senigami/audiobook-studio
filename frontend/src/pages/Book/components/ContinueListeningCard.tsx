import { useMemo } from 'react';
import { Play, Download, Image as ImageIcon } from 'lucide-react';
import { buildChapterQueue, playBookContinuous, useAutoSaveResumePosition } from '@/store/bookContinuousPlayback';
import { getAutoResumeBookmark } from '@/store/bookmarks';
import { formatLength, formatFileSize, formatRelativeTime } from '@/utils/format';
import type { Audiobook, Chapter } from '@/types';

interface ContinueListeningCardProps {
  audiobooks: Audiobook[];
  coverImagePath: string | null;
  bookId: string;
  bookTitle: string;
  chapters: Chapter[];
}

export function ContinueListeningCard({
  audiobooks,
  coverImagePath,
  bookId,
  bookTitle,
  chapters,
}: ContinueListeningCardProps) {
  const latest = audiobooks[0]; // already sorted most-recent-first by the backend (see task 006 data contract)
  const queue = useMemo(() => buildChapterQueue(chapters), [chapters]);

  useAutoSaveResumePosition(bookId, queue);

  const handleDownload = () => {
    if (!latest?.url) return;
    const link = document.createElement('a');
    link.href = latest.url;
    link.download = latest.download_filename || latest.filename;
    link.click();
  };

  if (queue.length === 0) {
    return (
      <div className="continue-listening-card continue-listening-card--empty" aria-label="Continue listening">
        <p>Nothing rendered yet — head to Contents to start casting and rendering.</p>
        {latest && (
          <button type="button" className="btn-ghost" onClick={handleDownload} disabled={!latest.url}>
            <Download size={16} aria-hidden="true" /> Download
          </button>
        )}
      </div>
    );
  }

  const resumeBookmark = getAutoResumeBookmark(bookId);
  const bookmarkedIndex = queue.findIndex((entry) => entry.chapterId === resumeBookmark?.chapterId);
  const resumeIndex = bookmarkedIndex !== -1 ? bookmarkedIndex : 0;
  const resumeChapter = queue[resumeIndex];

  const handlePlay = () => {
    playBookContinuous(bookId, bookTitle, queue);
  };

  const metaParts = latest
    ? [
        latest.duration_seconds ? formatLength(latest.duration_seconds) : null,
        latest.size_bytes ? formatFileSize(latest.size_bytes) : null,
        `Created ${formatRelativeTime(latest.created_at)}`,
      ].filter(Boolean)
    : [];

  return (
    <div className="continue-listening-card" aria-label="Continue listening">
      <div className="continue-listening-card__cover">
        {coverImagePath ? (
          <img className="continue-listening-card__cover-image" src={coverImagePath} alt="" />
        ) : (
          <div className="continue-listening-card__cover-placeholder" aria-hidden="true">
            <ImageIcon size={20} aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="continue-listening-card__body">
        <strong className="continue-listening-card__title">
          Resume: Chapter {resumeIndex + 1}: {resumeChapter.title}
        </strong>
        {metaParts.length > 0 && <p className="continue-listening-card__meta">{metaParts.join(' · ')}</p>}
        <div className="continue-listening-card__actions">
          <button type="button" className="btn-primary" onClick={handlePlay}>
            <Play size={16} aria-hidden="true" /> Continue Listening
          </button>
          <button type="button" className="btn-ghost" onClick={handleDownload} disabled={!latest?.url}>
            <Download size={16} aria-hidden="true" /> Download
          </button>
        </div>
      </div>
    </div>
  );
}
