/**
 * LexiconStage tests — thin wiring check only.
 *
 * LexiconStage is a one-line pass-through wrapper around LexiconPanel:
 * it pulls `bookId` from BookDataContext and forwards it as `projectId`.
 * All CRUD/list/empty-state behavior is exercised against the real
 * LexiconPanel component in components/LexiconPanel.test.tsx — this file
 * only proves the wrapper forwards the right prop.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LexiconStage } from '@/pages/Book/stages/LexiconStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/pages/Book/components/LexiconPanel', () => ({
  LexiconPanel: ({ projectId }: { projectId: string }) => (
    <div data-testid="lexicon-panel-stub">{projectId}</div>
  ),
}));

describe('LexiconStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders LexiconPanel with the book id as projectId', () => {
    vi.mocked(useBookDataContext).mockReturnValue({ bookId: 'book-1' } as any);

    render(<LexiconStage />);

    expect(screen.getByTestId('lexicon-panel-stub')).toHaveTextContent('book-1');
  });
});
