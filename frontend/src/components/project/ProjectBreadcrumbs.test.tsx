import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ProjectBreadcrumbs } from './ProjectBreadcrumbs';

describe('ProjectBreadcrumbs', () => {
  it('calls back to the project surface when the project crumb is clicked from chapter view', () => {
    const onProjectClick = vi.fn();

    render(
      <MemoryRouter>
        <ProjectBreadcrumbs
          projectId="proj-1"
          projectTitle="Test Project"
          chapterTitle="Chapter One"
          selectedChapterId="chap-1"
          chapters={[
            { id: 'chap-1', title: 'Chapter One' } as any,
            { id: 'chap-2', title: 'Chapter Two' } as any,
          ]}
          onProjectClick={onProjectClick}
          onNavigateChapter={vi.fn()}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Test Project' }));

    expect(onProjectClick).toHaveBeenCalledTimes(1);
  });
});
