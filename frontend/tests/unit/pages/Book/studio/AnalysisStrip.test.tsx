import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AnalysisStrip } from '@/pages/Book/studio/AnalysisStrip';

const analysis = {
  char_count: 956,
  word_count: 174,
  sent_count: 9,
  predicted_seconds: 57,
  raw_long_sentences: 5,
  auto_fixed: 3,
  uncleanable: 2,
  uncleanable_sentences: [
    { text: 'The moon was sailing through the black clouds, and the wolves kept howling without pause.', length: 132 },
    { text: 'Another sentence that still needs manual shortening.', length: 101 },
  ],
};

describe('AnalysisStrip', () => {
  it('shows stats, expands long-sentence details, and links to Manuscript edit', async () => {
    const { container } = render(
      <MemoryRouter>
        <AnalysisStrip
          bookId="book-1"
          chapterId="chapter-1"
          chapter={{
            char_count: 0,
            word_count: 0,
            sent_count: 0,
            predicted_audio_length: null,
          }}
          analysis={analysis}
          analyzing={true}
          segmentsCount={9}
        />
      </MemoryRouter>,
    );

    // Reference-only stats are a single quiet caption line, not individual card values.
    expect(screen.getByText(/956 chars/)).toBeInTheDocument();
    expect(screen.getByText(/174 words/)).toBeInTheDocument();
    expect(screen.getByText(/9 sentences/)).toBeInTheDocument();
    expect(screen.getByText(/9 segments/)).toBeInTheDocument();
    expect(screen.getByText(/~57s/)).toBeInTheDocument();
    expect(screen.getByText('3/5 auto-fixed')).toBeInTheDocument();
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /action required/i }));
    expect(await screen.findByText(/these sentences are still too long after auto-split/i)).toBeInTheDocument();
    expect(screen.getByText('The moon was sailing through the black clouds, and the wolves kept howling without pause.')).toBeInTheDocument();

    const editLink = screen.getByRole('link', { name: /edit in manuscript/i });
    expect(editLink).toHaveAttribute('href', '/book/book-1/manuscript?chapter=chapter-1');
  });
});
