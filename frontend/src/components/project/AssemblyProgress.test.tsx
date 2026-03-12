import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { AssemblyProgress } from './AssemblyProgress';
import type { Project, Job } from '../../types';

describe('AssemblyProgress', () => {
  const mockProject: Project = {
    id: 'proj1',
    name: 'Test Project',
    series: 'Test Series',
    author: 'Test Author',
    created_at: 123456789,
    updated_at: 123456789,
  };

  it('renders nothing when no assembly job is provided', () => {
    const { container } = render(
      <AssemblyProgress project={mockProject} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders progress when activeAssemblyJob is provided', () => {
    const mockActiveJob: Job = {
      id: 'job1',
      engine: 'audiobook',
      chapter_file: 'c1.txt',
      status: 'running',
      progress: 0.5,
      eta_seconds: 120,
      created_at: 123456789,
    };

    render(
      <AssemblyProgress 
        project={mockProject} 
        activeAssemblyJob={mockActiveJob} 
      />
    );

    expect(screen.getByText('Assembling Test Project...')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('ETA: 2m 0s')).toBeInTheDocument();
  });

  it('renders success message when finishedAssemblyJob is provided', () => {
    const mockFinishedJob: Job = {
      id: 'job2',
      engine: 'audiobook',
      chapter_file: 'c1.txt',
      status: 'done',
      progress: 1.0,
      output_mp3: 'final_audiobook.mp3',
      created_at: 123456789,
    };

    render(
      <AssemblyProgress 
        project={mockProject} 
        finishedAssemblyJob={mockFinishedJob} 
      />
    );

    expect(screen.getByText(/Audiobook assembled successfully!/)).toBeInTheDocument();
    expect(screen.getByText(/final_audiobook.mp3/)).toBeInTheDocument();
  });

  it('renders "Calculating..." when eta_seconds is missing', () => {
    const mockActiveJob: Job = {
      id: 'job1',
      engine: 'audiobook',
      chapter_file: 'c1.txt',
      status: 'running',
      progress: 0.5,
      created_at: 123456789,
    };

    render(
      <AssemblyProgress 
        project={mockProject} 
        activeAssemblyJob={mockActiveJob} 
      />
    );

    expect(screen.getByText('ETA: Calculating...')).toBeInTheDocument();
  });
});
