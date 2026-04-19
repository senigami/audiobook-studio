import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ProjectSubnav } from './ProjectSubnav';

describe('ProjectSubnav', () => {
  const mockItems = [
    { id: 'project-overview', label: 'Overview', href: '/project/p1' },
    { id: 'project-chapters', label: 'Chapters', href: '/project/p1?tab=chapters' },
  ];

  it('renders navigation items', () => {
    render(
      <MemoryRouter>
        <ProjectSubnav items={mockItems} activeId="project-overview" />
      </MemoryRouter>
    );

    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Chapters')).toBeInTheDocument();
  });

  it('highlights the active item', () => {
    render(
      <MemoryRouter>
        <ProjectSubnav items={mockItems} activeId="project-chapters" />
      </MemoryRouter>
    );

    const chaptersLink = screen.getByText('Chapters');
    expect(chaptersLink).toHaveClass('btn-primary');
    
    const overviewLink = screen.getByText('Overview');
    expect(overviewLink).toHaveClass('btn-ghost');
  });

  it('returns null if no items provided', () => {
    const { container } = render(<ProjectSubnav items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
