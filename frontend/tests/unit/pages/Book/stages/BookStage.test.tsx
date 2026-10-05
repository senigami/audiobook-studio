import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookStage } from '@/pages/Book/stages/BookStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { Project } from '@/types';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

const baseProject: Project = {
  id: 'book-1',
  name: 'Book One',
  series: null,
  author: 'Author One',
  speaker_profile_name: null,
  cover_image_path: null,
  description: null,
  created_at: 1710000000,
  updated_at: 1710000000,
};

function mockContext(overrides?: {
  project?: Partial<Project> | null;
  handleUpdateProject?: ReturnType<typeof vi.fn>;
}) {
  const handleUpdateProject = overrides?.handleUpdateProject ?? vi.fn().mockResolvedValue(true);
  const project =
    overrides && 'project' in overrides
      ? overrides.project === null
        ? null
        : { ...baseProject, ...overrides.project }
      : baseProject;

  vi.mocked(useBookDataContext).mockReturnValue({
    actions: { handleUpdateProject },
    project,
    totalRuntime: 3600,
    totalPredicted: 5400,
    hasRendered: true,
    hasUnrendered: false,
    availableAudiobooks: [],
  } as any);

  return { handleUpdateProject };
}

describe('BookStage description card', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the loading placeholder when project has not loaded yet', () => {
    mockContext({ project: null });

    render(<BookStage />);

    expect(screen.getByText('Book information is loading.')).toBeInTheDocument();
  });

  it('shows the empty-state placeholder when description is null', () => {
    mockContext({ project: { description: null } });

    render(<BookStage />);

    const hero = screen.getByRole('region', { name: 'Book info' });
    expect(
      within(hero).getByText(
        'Add a description to give readers and listeners a sense of the story before they dive in.',
      ),
    ).toBeInTheDocument();
  });

  it('renders the real description value when set', () => {
    mockContext({ project: { description: 'A tale of two cities.' } });

    render(<BookStage />);

    const hero = screen.getByRole('region', { name: 'Book info' });
    expect(within(hero).getByText('A tale of two cities.')).toBeInTheDocument();
  });

  it('enters edit mode and saves the full expected object shape on blur', () => {
    const { handleUpdateProject } = mockContext({
      project: {
        name: 'Book One',
        series: 'Aurora Cycle',
        author: 'Author One',
        series_position: 3,
        description: null,
      },
    });

    render(<BookStage />);

    const hero = screen.getByRole('region', { name: 'Book info' });
    fireEvent.click(
      within(hero).getByText(
        'Add a description to give readers and listeners a sense of the story before they dive in.',
      ),
    );

    const textbox = within(hero).getByRole('textbox', { name: 'Book description' });
    fireEvent.change(textbox, { target: { value: '  A new synopsis.  ' } });
    fireEvent.blur(textbox);

    expect(handleUpdateProject).toHaveBeenCalledWith({
      name: 'Book One',
      series: 'Aurora Cycle',
      author: 'Author One',
      series_position: 3,
      description: 'A new synopsis.',
    });
  });
});
