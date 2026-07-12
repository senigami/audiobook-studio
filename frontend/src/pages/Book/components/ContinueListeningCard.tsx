import { Play, Download, Image as ImageIcon } from 'lucide-react';
import { loadAndPlay } from '@/store/playerBus';
import { formatLength, formatFileSize, formatRelativeTime } from '@/utils/format';
import type { Audiobook } from '@/types';

interface ContinueListeningCardProps {
  audiobooks: Audiobook[];
  coverImagePath: string | null;
}

export function ContinueListeningCard({ audiobooks, coverImagePath }: ContinueListeningCardProps) {
  const latest = audiobooks[0]; // already sorted most-recent-first by the backend (see task 006 data contract)

  if (!latest) {
    return (
      <div className="continue-listening-card continue-listening-card--empty" aria-label="Continue listening">
        <p>Nothing rendered yet — head to Contents to start casting and rendering.</p>
      </div>
    );
  }

  const metaParts = [
    latest.duration_seconds ? formatLength(latest.duration_seconds) : null,
    latest.size_bytes ? formatFileSize(latest.size_bytes) : null,
    `Created ${formatRelativeTime(latest.created_at)}`,
  ].filter(Boolean);

  const handlePlay = () => {
    if (!latest.url) return;
    loadAndPlay({
      scope: 'book',
      title: latest.title || latest.filename,
      subtitle: 'Full audiobook',
      audioUrl: latest.url,
      // Book-scope audio can be many hours long. Supplying the known
      // duration up front skips PlayerBar's "unknown duration" bootstrap
      // window, which would otherwise let the inline waveform attempt a
      // full browser decode of the entire file before real metadata loads
      // — see LoadAndPlayOptions.initialDuration.
      initialDuration: latest.duration_seconds,
    });
  };

  const handleDownload = () => {
    if (!latest.url) return;
    const link = document.createElement('a');
    link.href = latest.url;
    link.download = latest.download_filename || latest.filename;
    link.click();
  };

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
        <strong className="continue-listening-card__title">{latest.title || latest.filename}</strong>
        <p className="continue-listening-card__meta">{metaParts.join(' · ')}</p>
        <div className="continue-listening-card__actions">
          <button type="button" className="btn-primary" onClick={handlePlay} disabled={!latest.url}>
            <Play size={16} aria-hidden="true" /> Continue Listening
          </button>
          <button type="button" className="btn-ghost" onClick={handleDownload} disabled={!latest.url}>
            <Download size={16} aria-hidden="true" /> Download
          </button>
        </div>
      </div>
    </div>
  );
}
