import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { RailBookBlock } from '@/app/layout/RailBookBlock';
import { setBookIdentity } from '@/app/layout/bookIdentityStore';
import type { Chapter, Job } from '@/types';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

const chapter: Chapter = {
  id: 'chapter-1',
  project_id: 'book-1',
  title: 'Opening Chapter',
  text_content: 'Text',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'unprocessed',
  audio_file_path: null,
  text_last_modified: null,
  audio_generated_at: null,
  char_count: 100,
  word_count: 20,
  sent_count: 1,
  predicted_audio_length: 10,
  audio_length_seconds: 0,
  total_segments_count: 4,
  done_segments_count: 1,
};

const job: Job = {
  id: 'job-1',
  engine: 'tts',
  chapter_file: 'chapter-1.txt',
  status: 'running',
  created_at: 1,
  project_id: 'book-1',
  chapter_id: 'chapter-1',
  safe_mode: false,
  make_mp3: false,
  progress: 42,
  warning_count: 0,
};

describe('RailBookBlock', () => {
  afterEach(() => {
    act(() => {
      setBookIdentity(null);
    });
  });

  it('renders active stage links, chapter rows with StatusOrb, and chapter action callbacks', async () => {
    const onQueueChapter = vi.fn();
    const onResetAudio = vi.fn();
    const onDeleteChapter = vi.fn();

    act(() => {
      setBookIdentity({
        id: 'book-1',
        title: 'Book One',
        author: null,
        series: null,
        coverUrl: null,
        runtimeSeconds: 0,
        predictedSeconds: null,
        chapters: [chapter],
        jobs: { 'job-1': job },
        actions: {
          onQueueChapter,
          onResetAudio,
          onDeleteChapter,
        },
      });
    });

    render(
      <MemoryRouter initialEntries={['/book/book-1/studio?chapter=chapter-1']}>
        <LocationProbe />
        <RailBookBlock />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Studio' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Casting' })).toHaveAttribute('href', '/book/book-1/casting');
    const row = screen.getByTestId('rail-book-row-chapter-1');
    expect(row).toHaveClass('rail-book-block__chapter-wrap--active');

    const main = row.querySelector('.rail-book-block__chapter-main');
    expect(main).not.toBeNull();
    expect(main?.children[0]).toHaveAttribute('aria-label', expect.stringContaining('Rendering'));
    expect(main?.children[1]).toHaveTextContent('1.');
    expect(main?.children[2]).toHaveTextContent('Opening Chapter');

    expect(screen.getByText('Opening Chapter')).toBeInTheDocument();
    expect(screen.getByLabelText(/Rendering/i)).toBeInTheDocument();
    expect(screen.getByTestId('rail-book-progress-chapter-1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Opening Chapter/i }));
    expect(screen.getByTestId('location')).toHaveTextContent('/book/book-1/studio?chapter=chapter-1');

    fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Queue' }));
    expect(onQueueChapter).toHaveBeenCalledWith(chapter);

    fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Reset audio' }));
    expect(onResetAudio).toHaveBeenCalledWith('chapter-1');

    fireEvent.click(within(row).getByRole('button', { name: 'More actions' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(onDeleteChapter).toHaveBeenCalledWith('chapter-1');
  });

  it('does NOT render loading label when status is running with stale LOADING_MODEL reason_code', () => {
    // A job that transitions from preparing→running but whose reason_code was never cleared.
    // The rail must NOT show "loading voice model…" for a running job.
    const runningJobWithStaleCode: Job = {
      ...job,
      status: 'running',
      reason_code: 'LOADING_MODEL',
      progress: 25,
    };
    act(() => {
      setBookIdentity({
        id: 'book-1',
        title: 'Book One',
        author: null,
        series: null,
        coverUrl: null,
        runtimeSeconds: 0,
        predictedSeconds: null,
        chapters: [chapter],
        jobs: { 'job-1': runningJobWithStaleCode },
        actions: {},
      });
    });

    render(
      <MemoryRouter initialEntries={['/book/book-1/studio?chapter=chapter-1']}>
        <RailBookBlock />
      </MemoryRouter>,
    );

    expect(screen.queryByText('loading voice model…')).toBeNull();
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders loading label when status is preparing AND reason_code is LOADING_MODEL', () => {
    const preparingJob: Job = {
      ...job,
      status: 'preparing',
      reason_code: 'LOADING_MODEL',
      progress: 0,
    };
    act(() => {
      setBookIdentity({
        id: 'book-1',
        title: 'Book One',
        author: null,
        series: null,
        coverUrl: null,
        runtimeSeconds: 0,
        predictedSeconds: null,
        chapters: [chapter],
        jobs: { 'job-1': preparingJob },
        actions: {},
      });
    });

    render(
      <MemoryRouter initialEntries={['/book/book-1/studio?chapter=chapter-1']}>
        <RailBookBlock />
      </MemoryRouter>,
    );

    expect(screen.getByText('loading voice model…')).toBeInTheDocument();
  });

  it('hides chapter rows outside the Studio stage', () => {
    act(() => {
      setBookIdentity({
        id: 'book-1',
        title: 'Book One',
        author: null,
        series: null,
        coverUrl: null,
        runtimeSeconds: 0,
        predictedSeconds: null,
        chapters: [chapter],
        jobs: {},
        actions: {},
      });
    });

    render(
      <MemoryRouter initialEntries={['/book/book-1/casting']}>
        <RailBookBlock />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Opening Chapter')).toBeNull();
  });
});
