import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as playerBus from '@/store/playerBus';
import { ContinueListeningCard } from '@/pages/Book/components/ContinueListeningCard';
import type { Audiobook } from '@/types';

const baseAudiobook: Audiobook = {
  filename: 'book-one.wav',
  title: 'Book One — Full Audiobook',
  download_filename: 'Book One.wav',
  cover_url: null,
  url: '/projects/book-1/audiobooks/book-one.wav',
  created_at: Math.floor(Date.now() / 1000) - 3600,
  size_bytes: 52428800,
  duration_seconds: 3600,
  description: null,
};

function renderCard(overrides?: Partial<ComponentProps<typeof ContinueListeningCard>>) {
  return render(
    <ContinueListeningCard
      audiobooks={[baseAudiobook]}
      coverImagePath={null}
      {...overrides}
    />,
  );
}

describe('ContinueListeningCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the latest audiobook with title, duration, and created-at', () => {
    renderCard();

    expect(screen.getByLabelText('Continue listening')).toBeInTheDocument();
    expect(screen.getByText('Book One — Full Audiobook')).toBeInTheDocument();
    expect(screen.getByText(/1h 0m/)).toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });

  it('calls loadAndPlay with book scope when Continue Listening is clicked', () => {
    const loadAndPlaySpy = vi.spyOn(playerBus, 'loadAndPlay');

    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Continue Listening/i }));

    expect(loadAndPlaySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'book',
        title: baseAudiobook.title,
        subtitle: 'Full audiobook',
        audioUrl: baseAudiobook.url,
      }),
    );
  });

  it('passes the known duration as initialDuration so PlayerBar never treats a multi-hour book as unknown-duration', () => {
    // Book-scope audio can be many hours long. Without initialDuration,
    // PlayerBar's fitsLegibly(0, ...) bootstrap treats "unknown duration" as
    // "show the waveform", letting WaveformStrip attempt a full wavesurfer
    // decode of the entire file before the browser's own metadata loads —
    // for a multi-hour audiobook that can hang or crash the tab.
    const loadAndPlaySpy = vi.spyOn(playerBus, 'loadAndPlay');

    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Continue Listening/i }));

    expect(loadAndPlaySpy).toHaveBeenCalledWith(
      expect.objectContaining({ initialDuration: baseAudiobook.duration_seconds }),
    );
  });

  it('sets the download anchor href/download attributes when Download is clicked', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const anchors: HTMLAnchorElement[] = [];
    const realCreateElement = document.createElement.bind(document);
    const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const el = realCreateElement(tagName);
      if (tagName === 'a') anchors.push(el as HTMLAnchorElement);
      return el;
    });

    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Download/i }));

    expect(anchors).toHaveLength(1);
    expect(anchors[0].href).toContain(baseAudiobook.url);
    expect(anchors[0].download).toBe(baseAudiobook.download_filename);
    expect(clickSpy).toHaveBeenCalled();

    createElementSpy.mockRestore();
  });

  it('disables Play and Download when the latest audiobook has no url', () => {
    renderCard({ audiobooks: [{ ...baseAudiobook, url: undefined }] });

    expect(screen.getByRole('button', { name: /Continue Listening/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Download/i })).toBeDisabled();
  });

  it('shows an honest empty state when there are zero assembled audiobooks', () => {
    renderCard({ audiobooks: [] });

    expect(screen.getByLabelText('Continue listening')).toBeInTheDocument();
    expect(screen.getByText(/Nothing rendered yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Continue Listening/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Download/i })).not.toBeInTheDocument();
  });
});
