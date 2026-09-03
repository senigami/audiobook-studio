import { fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';
import { BookInfoCard } from '@/pages/Book/components/BookInfoCard';
import type { Project } from '@/types';

const baseProject: Project = {
  id: 'book-1',
  name: 'Book One',
  series: null,
  author: 'Author One',
  speaker_profile_name: null,
  cover_image_path: null,
  created_at: 1710000000,
  updated_at: 1710000000,
};

function renderCard(overrides?: Partial<ComponentProps<typeof BookInfoCard>>) {
  return render(
    <BookInfoCard
      project={baseProject}
      totalRuntime={3600}
      totalPredicted={5400}
      hasRendered={true}
      hasUnrendered={true}
      onUpdateProject={async () => true}
      {...overrides}
    />,
  );
}

describe('BookInfoCard metadata', () => {
  it('renders title, author, and series context in standard book-detail order', () => {
    const { container } = renderCard({ project: { ...baseProject, series: 'Aurora Cycle', series_position: 12 } });

    const title = screen.getByText('Book One');
    const byline = screen.getByText('Author One').closest('.book-info-card__byline');
    const series = screen.getByText('Aurora Cycle').closest('.book-info-card__series-line');

    expect(byline).toHaveTextContent('byAuthor One');
    expect(series).toHaveTextContent('Aurora CycleBook-+');
    expect(screen.getByRole('textbox', { name: 'Series position' })).toHaveValue('12');
    expect(title.compareDocumentPosition(byline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(byline.compareDocumentPosition(series) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(byline).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease series position' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase series position' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Series position' })).toHaveValue('12');
    expect(container.querySelector('.book-info-card__series-line')).toBeInTheDocument();
    expect(container.querySelector('.book-info-card__series-line')?.textContent).not.toContain('#');
  });

  it('hides the book prefix when the series number is unset', () => {
    renderCard({ project: { ...baseProject, series_position: null, series: 'Aurora Cycle' } });

    expect(screen.queryByText(/^Book$/)).not.toBeInTheDocument();
    expect(screen.getByText('Aurora Cycle')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add series number' })).toBeInTheDocument();
    expect(screen.getByText('Book One')).toBeInTheDocument();
  });

  it('shows compact series position controls when a book number is set', () => {
    renderCard({ project: { ...baseProject, series: 'Aurora Cycle', series_position: 12 } });

    expect(screen.getByRole('textbox', { name: 'Series position' })).toHaveValue('12');
    expect(screen.getByRole('button', { name: 'Decrease series position' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Increase series position' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Decrease series position' })).toHaveTextContent('-');
    expect(screen.getByRole('button', { name: 'Increase series position' })).toHaveTextContent('+');
  });

  it('shows the series steppers while editing when the book number is unset', async () => {
    renderCard({ project: { ...baseProject, series: 'Aurora Cycle', series_position: null } });

    fireEvent.click(screen.getByRole('button', { name: 'Add series number' }));

    expect(await screen.findByRole('button', { name: 'Decrease series position' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase series position' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Series position' })).toHaveValue('');
  });

  it('does not render an awkward byline when author is missing', () => {
    renderCard({ project: { ...baseProject, author: null } });

    expect(screen.getByText('Add author').closest('.inline-edit-trigger')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.queryByText('by')).not.toBeInTheDocument();
  });

  it('keeps populated metadata upright and only italicizes empty placeholders', () => {
    const { rerender } = renderCard({ project: { ...baseProject, series: 'Aurora Cycle', series_position: 12 } });

    expect(screen.getByText('Author One')).not.toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Aurora Cycle')).not.toHaveStyle({ fontStyle: 'italic' });

    rerender(
      <BookInfoCard
        project={{ ...baseProject, author: null, series: null, series_position: null }}
        totalRuntime={3600}
        totalPredicted={5400}
        hasRendered={true}
        hasUnrendered={true}
        onUpdateProject={async () => true}
      />,
    );

    expect(screen.getByText('Add author').closest('.inline-edit-trigger')).toHaveStyle({ fontStyle: 'italic' });
    expect(screen.getByText('Add series').closest('.inline-edit-trigger')).toHaveStyle({ fontStyle: 'italic' });
  });

  it('allows the title to be edited in place', async () => {
    renderCard();

    fireEvent.click(screen.getByText('Book One'));

    expect(await screen.findByRole('textbox')).toHaveValue('Book One');
  });

  it('uses the same borderless inline editor for title, author, and series text', async () => {
    renderCard({ project: { ...baseProject, series: 'Aurora Cycle', series_position: 12 } });

    fireEvent.click(screen.getByText('Book One'));
    expect(await screen.findByRole('textbox', { name: 'Title' })).toHaveStyle({ borderStyle: 'none', background: 'transparent' });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Title' }));

    fireEvent.click(screen.getByText('Author One'));
    expect(await screen.findByRole('textbox', { name: 'Author' })).toHaveStyle({ borderStyle: 'none', background: 'transparent' });
    expect(screen.getByRole('textbox', { name: 'Author' })).toHaveClass('inline-edit-input');
    fireEvent.blur(screen.getByRole('textbox', { name: 'Author' }));

    fireEvent.click(screen.getByText('Aurora Cycle'));
    expect(await screen.findByRole('textbox', { name: 'Series name' })).toHaveStyle({ borderStyle: 'none', background: 'transparent' });
    expect(screen.getByRole('textbox', { name: 'Series name' })).toHaveClass('inline-edit-input');
  });

  // Runtime/Predicted are shown persistently in the app-shell breadcrumb
  // (BookIdentityLine) across every stage tab, so this card intentionally
  // does not repeat those numbers -- only status + Created date.
  it('shows a Rendered status chip (not Runtime/Predicted) when fully rendered', () => {
    renderCard({ hasRendered: true, hasUnrendered: false });

    expect(screen.getByText('Rendered')).toBeInTheDocument();
    expect(screen.queryByText(/Runtime/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Predicted/)).not.toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });

  it('shows a "No segments yet" status chip (not Runtime/Predicted) when nothing is rendered', () => {
    renderCard({ hasRendered: false, hasUnrendered: true });

    expect(screen.getByText('No segments yet')).toBeInTheDocument();
    expect(screen.queryByText(/Runtime/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Predicted/)).not.toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });

  it('shows no status chip, only Created, when partially rendered', () => {
    renderCard({ hasRendered: true, hasUnrendered: true });

    expect(screen.queryByText('Rendered')).not.toBeInTheDocument();
    expect(screen.queryByText('No segments yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/Runtime/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Predicted/)).not.toBeInTheDocument();
    expect(screen.getByText(/Created/)).toBeInTheDocument();
  });
});
