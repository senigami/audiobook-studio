import { render, screen } from '@testing-library/react';
import { ChapterList } from './ChapterList';
import { vi, describe, it, expect } from 'vitest';
import type { Chapter } from '../../types';

describe('ChapterList', () => {
  const mockChapters: Chapter[] = [
    {
      id: 'chap-123',
      project_id: 'proj-1',
      title: 'Chapter 1',
      audio_status: 'done',
      audio_file_path: 'chap-123_0.wav', // Suffixed path
      has_wav: true,
      has_mp3: false,
      sort_order: 1
    } as any,
    {
      id: 'chap-456',
      project_id: 'proj-1',
      title: 'Chapter 2',
      audio_status: 'done',
      audio_file_path: null, // Missing path, relying on ID fallback
      has_wav: true,
      has_mp3: false,
      sort_order: 2
    } as any
  ];

  const defaultProps = {
    chapters: mockChapters,
    projectId: 'proj-1',
    jobs: {},
    isAssemblyMode: false,
    selectedChapters: new Set<string>(),
    onSelectChapter: vi.fn(),
    onSelectAll: vi.fn(),
    onReorder: vi.fn(),
    onEditChapter: vi.fn(),
    onRenameChapter: async () => {},
    onQueueChapter: vi.fn(),
    onResetAudio: vi.fn(),
    onDeleteChapter: vi.fn(),
    onExportSample: vi.fn(),
    isExporting: null,
    formatLength: (s: number) => `${s}s`
  };

  it('renders audio player with correct suffixed source from audio_file_path', () => {
    const { container } = render(<ChapterList {...defaultProps} />);
    
    const audioTags = container.querySelectorAll('audio');
    expect(audioTags).toHaveLength(2);
    
    const sources1 = audioTags[0].querySelectorAll('source');
    // First source is .mp3, second is .wav in my mock maybe?
    // Let's check ChapterList.tsx logic:
    // src={`/projects/${projectId}/audio/${chap.audio_file_path}`}
    // Wait, the logic I added was:
    // <source src={`/projects/${projectId}/audio/${chap.audio_file_path}`} type={chap.audio_file_path.endsWith('.mp3') ? "audio/mpeg" : "audio/wav"} />
    
    expect(sources1[0].getAttribute('src')).toBe('/projects/proj-1/audio/chap-123_0.wav');
  });

  it('falls back to chap.id when audio_file_path is missing', () => {
    const { container } = render(<ChapterList {...defaultProps} />);
    
    const audioTags = container.querySelectorAll('audio');
    const sources2 = audioTags[1].querySelectorAll('source');
    
    // Fallback logic sends .mp3 then .wav
    expect(sources2[0].getAttribute('src')).toBe('/projects/proj-1/audio/chap-456.mp3');
    expect(sources2[1].getAttribute('src')).toBe('/projects/proj-1/audio/chap-456.wav');
  });

  it('renders warning pulse when audio_status is processing but no activeJob', () => {
    const processingChapter: Chapter = {
      id: 'chap-789',
      project_id: 'proj-1',
      title: 'Processing Chapter',
      audio_status: 'processing',
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
      sort_order: 3
    } as any;

    const { container } = render(<ChapterList {...defaultProps} chapters={[processingChapter]} />);
    
    // StatusOrb should render with a specific tooltip/aria-label for stuck processing
    const orb = screen.getByLabelText(/Render was interrupted/i);
    expect(orb).toBeTruthy();
    
    // It should NOT render a spinner (RefreshCw icon)
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeFalsy();
  });

  it('uses live segment progress when available', () => {
    const liveJob = {
      id: 'job-1',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      status: 'running',
      progress: 0.1,
      active_segment_progress: 0.65,
      started_at: Date.now() / 1000 - 30,
      eta_seconds: 120,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [liveJob.id]: liveJob }} />);

    expect(screen.getByText('65%')).toBeInTheDocument();
  });

  it('shows a queued badge for chapters awaiting rendering', () => {
    const queuedJob = {
      id: 'job-queued',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      status: 'queued',
      progress: 0,
      created_at: Date.now() / 1000,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [queuedJob.id]: queuedJob }} />);

    expect(screen.getByText('Queued')).toBeInTheDocument();
  });
});
