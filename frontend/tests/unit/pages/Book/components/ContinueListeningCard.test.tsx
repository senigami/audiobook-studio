import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as bookContinuousPlayback from '@/store/bookContinuousPlayback';
import * as bookmarks from '@/store/bookmarks';
import { ContinueListeningCard } from '@/pages/Book/components/ContinueListeningCard';
import type { Audiobook, Chapter } from '@/types';

vi.mock('@/store/bookContinuousPlayback', async () => {
  const actual = await vi.importActual<typeof import('@/store/bookContinuousPlayback')>(
    '@/store/bookContinuousPlayback',
  );
  return {
    ...actual,
    buildChapterQueue: actual.buildChapterQueue, // real implementation — pure/simple, part of the unit's behavior
    playBookContinuous: vi.fn(),
    useAutoSaveResumePosition: vi.fn(),
  };
});

vi.mock('@/store/bookmarks', () => ({
  getAutoResumeBookmark: vi.fn(() => null),
}));

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

function makeChapter(overrides: Partial<Chapter> & { id: string; title: string }): Chapter {
  return {
    project_id: 'book-1',
    text_content: '',
    speaker_profile_name: null,
    sort_order: 0,
    audio_status: 'unprocessed',
    audio_file_path: null,
    text_last_modified: null,
    audio_generated_at: null,
    char_count: 0,
    word_count: 0,
    sent_count: 0,
    predicted_audio_length: 0,
    audio_length_seconds: 0,
    ...overrides,
  };
}

const renderedChapters: Chapter[] = [
  makeChapter({ id: 'ch-1', title: 'The Beginning', audio_file_path: 'ch1.wav' }),
  makeChapter({ id: 'ch-2', title: 'The Middle', audio_file_path: 'ch2.wav' }),
];

function renderCard(overrides?: Partial<ComponentProps<typeof ContinueListeningCard>>) {
  return render(
    <ContinueListeningCard
      audiobooks={[baseAudiobook]}
      coverImagePath={null}
      bookId="book-1"
      bookTitle="Book One"
      chapters={renderedChapters}
      {...overrides}
    />,
  );
}

describe('ContinueListeningCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(bookmarks.getAutoResumeBookmark).mockReturnValue(null);
  });

  it('calls playBookContinuous with the book id, title, and queue built from chapters', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /Continue Listening/i }));

    expect(bookContinuousPlayback.playBookContinuous).toHaveBeenCalledWith(
      'book-1',
      'Book One',
      expect.arrayContaining([
        expect.objectContaining({ chapterId: 'ch-1', title: 'The Beginning' }),
        expect.objectContaining({ chapterId: 'ch-2', title: 'The Middle' }),
      ]),
    );
  });

  it('enables Continue Listening when chapters are rendered even when there are zero assembled audiobooks', () => {
    renderCard({ audiobooks: [] });

    expect(screen.getByRole('button', { name: /Continue Listening/i })).toBeEnabled();
  });

  it('disables Continue Listening and shows the empty state when no chapters are rendered', () => {
    renderCard({ chapters: [makeChapter({ id: 'ch-1', title: 'Unrendered', audio_file_path: null })] });

    expect(screen.queryByRole('button', { name: /Continue Listening/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Nothing rendered yet/i)).toBeInTheDocument();
  });

  it('displays the bookmarked resume chapter title', () => {
    vi.mocked(bookmarks.getAutoResumeBookmark).mockReturnValue({
      id: 'bm-1',
      bookId: 'book-1',
      chapterId: 'ch-2',
      label: '__auto_resume__',
      createdAt: 0,
      kind: 'auto',
      positionSeconds: 30,
    });

    renderCard();

    expect(screen.getByText(/The Middle/)).toBeInTheDocument();
  });

  it('defaults to the first chapter when there is no resume bookmark yet', () => {
    renderCard();

    expect(screen.getByText(/The Beginning/)).toBeInTheDocument();
  });

  it('calls useAutoSaveResumePosition with the bookId and queue', () => {
    renderCard();

    expect(bookContinuousPlayback.useAutoSaveResumePosition).toHaveBeenCalledWith(
      'book-1',
      expect.arrayContaining([expect.objectContaining({ chapterId: 'ch-1' })]),
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

  it('disables Download when there is no assembled audiobook, independent of the queue', () => {
    renderCard({ audiobooks: [{ ...baseAudiobook, url: undefined }] });

    expect(screen.getByRole('button', { name: /Download/i })).toBeDisabled();
  });
});
