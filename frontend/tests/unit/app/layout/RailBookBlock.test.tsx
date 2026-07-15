import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RailBookBlock } from '@/app/layout/RailBookBlock';
import { setBookIdentity } from '@/app/layout/bookIdentityStore';
import type { Chapter, Job } from '@/types';

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

const secondChapter: Chapter = {
  ...chapter,
  id: 'chapter-2',
  title: 'Second Chapter',
  sort_order: 1,
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

function setIdentity(chapters: Chapter[], jobs: Record<string, Job> = {}) {
  act(() => {
    setBookIdentity({
      id: 'book-1',
      title: 'Book One',
      author: null,
      series: null,
      coverUrl: null,
      runtimeSeconds: 0,
      predictedSeconds: null,
      chapters,
      jobs,
      actions: {},
    });
  });
}

function expectNoChapterList() {
  // No chapter titles, no chapter-shaped rows/progress bars, no chapter list
  // container should ever render from RailBookBlock — it's a pure duplicate
  // of ChapterTable.tsx now removed from the rail entirely.
  expect(screen.queryByText('Opening Chapter')).toBeNull();
  expect(screen.queryByText('Second Chapter')).toBeNull();
  expect(screen.queryByTestId('rail-book-row-chapter-1')).toBeNull();
  expect(screen.queryByTestId('rail-book-progress-chapter-1')).toBeNull();
  expect(document.querySelector('.rail-book-block__chapters')).toBeNull();
  expect(document.querySelector('.rail-book-block__chapter')).toBeNull();
}

describe('RailBookBlock', () => {
  afterEach(() => {
    act(() => {
      setBookIdentity(null);
    });
  });

  it('renders only title/cover header + fixed stage links, no chapter list, on the Contents route', () => {
    setIdentity([chapter], { 'job-1': job });

    render(
      <MemoryRouter initialEntries={['/book/book-1/contents']}>
        <RailBookBlock />
      </MemoryRouter>,
    );

    expect(screen.getByText('Book One')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Contents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cast' })).toHaveAttribute('href', '/book/book-1/cast');
    expectNoChapterList();
  });

  it('renders no chapter list inside the chapter workspace route either', () => {
    setIdentity([chapter], { 'job-1': job });

    render(
      <MemoryRouter initialEntries={['/book/book-1/chapter/chapter-1']}>
        <RailBookBlock />
      </MemoryRouter>,
    );

    expectNoChapterList();
  });

  it('stays free of a chapter list after a prop change (stage switch + chapter-count change)', () => {
    setIdentity([chapter], { 'job-1': job });

    render(
      <MemoryRouter initialEntries={['/book/book-1/contents']}>
        <RailBookBlock />
      </MemoryRouter>,
    );
    expectNoChapterList();

    // Simulate a re-render with changed props: chapter count grows and the
    // active job set changes, while still on the Contents-shaped route.
    setIdentity([chapter, secondChapter], { 'job-1': job });
    expectNoChapterList();
  });

  it('stays free of a chapter list after a simulated route change within the same book', () => {
    setIdentity([chapter], { 'job-1': job });

    function TestHarness() {
      return (
        <Routes>
          <Route path="/book/:bookId/contents" element={<RailBookBlock />} />
          <Route path="/book/:bookId/chapter/:chapterId" element={<RailBookBlock />} />
          <Route path="/book/:bookId/cast" element={<RailBookBlock />} />
        </Routes>
      );
    }

    const { rerender } = render(
      <MemoryRouter initialEntries={['/book/book-1/contents']}>
        <TestHarness />
      </MemoryRouter>,
    );
    expectNoChapterList();

    rerender(
      <MemoryRouter initialEntries={['/book/book-1/chapter/chapter-1']}>
        <TestHarness />
      </MemoryRouter>,
    );
    expectNoChapterList();

    rerender(
      <MemoryRouter initialEntries={['/book/book-1/cast']}>
        <TestHarness />
      </MemoryRouter>,
    );
    expectNoChapterList();
  });

  it('renders the same fixed stage-link set regardless of chapter/job state', () => {
    setIdentity([], {});

    render(
      <MemoryRouter initialEntries={['/book/book-1/cast']}>
        <RailBookBlock />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Contents' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cast' })).toBeInTheDocument();
    expectNoChapterList();
  });
});
