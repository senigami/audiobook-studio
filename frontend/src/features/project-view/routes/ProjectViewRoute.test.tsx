import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { ProjectViewRoute } from './ProjectViewRoute';

describe('ProjectViewRoute', () => {
  const defaultProps = {
    loading: false,
    connected: true,
    isReconnecting: false,
    projectTitle: 'My Project'
  };

  it('provides derived shell state to its children', async () => {
    let capturedState: any = null;

    render(
      <MemoryRouter initialEntries={['/project/p123']}>
        <Routes>
          <Route path="/project/:projectId" element={
            <ProjectViewRoute {...defaultProps}>
              {({ shellState }) => {
                capturedState = shellState;
                return <div>ChildContent</div>;
              }}
            </ProjectViewRoute>
          } />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('ChildContent')).toBeInTheDocument();
    expect(capturedState.navigation.activeProjectId).toBe('p123');
    expect(capturedState.breadcrumbs[1].label).toBe('My Project');
    expect(capturedState.hydration.status).toBe('ready');
  });

  it('derives activeProjectSubnavId from search params', () => {
    render(
      <MemoryRouter initialEntries={['/project/p1?tab=chapters']}>
        <Routes>
          <Route path="/project/:projectId" element={
            <ProjectViewRoute 
              loading={false} 
              connected={true} 
              isReconnecting={false}
              projectTitle="Test Project"
            >
              {(props) => <div data-testid="nav-state">{JSON.stringify(props.shellState.navigation)}</div>}
            </ProjectViewRoute>
          } />
        </Routes>
      </MemoryRouter>
    );

    const navState = JSON.parse(screen.getByTestId('nav-state').textContent || '{}');
    expect(navState.activeProjectSubnavId).toBe('project-chapters');
  });

  it('updates shell state when project title changes', async () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/project/p123']}>
        <ProjectViewRoute {...defaultProps}>
          {({ shellState }) => <div>{shellState.breadcrumbs[1].label}</div>}
        </ProjectViewRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('My Project')).toBeInTheDocument();

    rerender(
      <MemoryRouter initialEntries={['/project/p123']}>
        <ProjectViewRoute {...defaultProps} projectTitle="New Title">
          {({ shellState }) => <div>{shellState.breadcrumbs[1].label}</div>}
        </ProjectViewRoute>
      </MemoryRouter>
    );

    expect(screen.getByText('New Title')).toBeInTheDocument();
  });
});
