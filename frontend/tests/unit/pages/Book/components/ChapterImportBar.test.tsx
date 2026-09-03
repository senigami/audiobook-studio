import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChapterImportBar } from '@/pages/Book/components/ChapterImportBar';

describe('ChapterImportBar', () => {
  it('uses a compact inline control when requested', () => {
    render(<ChapterImportBar onImportFiles={vi.fn()} submitting={false} compact />);

    const dropzone = screen.getByRole('button', { name: 'Import manuscript, browse or drop files' });

    expect(dropzone).toHaveAttribute('style', expect.stringContaining('min-height: 42px'));
    expect(dropzone.parentElement).toHaveAttribute('style', expect.stringContaining('flex: 1 1 280px'));
    expect(dropzone.parentElement).toHaveAttribute('style', expect.stringContaining('min-width: 0'));
    expect(dropzone.parentElement).toHaveAttribute('style', expect.stringContaining('margin-right: auto'));
    expect(dropzone).toHaveTextContent('Import manuscript');
    expect(screen.queryByText('Choose file')).not.toBeInTheDocument();
  });
});
