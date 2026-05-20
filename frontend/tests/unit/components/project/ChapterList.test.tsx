import { render, screen } from '@testing-library/react';
import { ChapterList } from '@/pages/ProjectDetail/components/ChapterList';
import { vi, describe, it, expect } from 'vitest';
import type { Chapter } from '@/types';

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({
    progress,
    status,
    state,
    predictive,
    allowBackwardProgress,
    evidenceWeightFraction,
  }: {
    progress: number;
    status?: string;
    state?: string;
    predictive?: boolean;
    allowBackwardProgress?: boolean;
    evidenceWeightFraction?: number;
  }) => (
    <div
      data-testid="progress-bar"
      data-progress={progress}
      data-status={status ?? ''}
      data-state={state ?? ''}
      data-predictive={String(!!predictive)}
      data-allow-backward={String(!!allowBackwardProgress)}
      data-evidence-weight-fraction={evidenceWeightFraction ?? ''}
    />
  ),
}));

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
    
    expect(sources1[0].getAttribute('src')).toBe('/api/projects/proj-1/chapters/chap-123/assets/audio?filename=chap-123_0.wav');
  });

  it('falls back to chap.id when audio_file_path is missing', () => {
    const { container } = render(<ChapterList {...defaultProps} />);
    
    const audioTags = container.querySelectorAll('audio');
    const sources2 = audioTags[1].querySelectorAll('source');
    
    expect(sources2[0].getAttribute('src')).toBe('/api/projects/proj-1/chapters/chap-456/assets/audio?filename=chapter.wav');
  });

  it('renders queued pulse when audio_status is processing but no activeJob', () => {
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
    
    // StatusOrb should render as queued rather than interrupted while the live job attaches
    const orb = screen.getByLabelText(/Queued for rendering/i);
    expect(orb).toBeTruthy();
    
    // It should render a spinner, not a warning icon
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('uses live job progress when available', () => {
    const liveJob = {
      id: 'job-1',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      status: 'running',
      progress: 0.4,
      started_at: Date.now() / 1000 - 30,
      eta_seconds: 120,
      render_group_count: 3,
      completed_render_groups: 1,
      active_render_group_index: 2,
      active_segment_progress: 0.5,
      total_render_weight: 1000,
      completed_render_weight: 500,
      active_render_group_weight: 400,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [liveJob.id]: liveJob }} />);

    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0.63');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-allow-backward', 'false');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-evidence-weight-fraction', '0.4');
  });

  it('keeps a grouped running chapter in processing state until an active render block exists', () => {
    const groupedJob = {
      id: 'job-grouped-pre-render',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      status: 'running',
      progress: 0.12,
      started_at: Date.now() / 1000 - 3,
      eta_seconds: 120,
      render_group_count: 3,
      completed_render_groups: 0,
      active_render_group_index: 0,
      total_render_weight: 300,
      completed_render_weight: 0,
      active_render_group_weight: 100,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [groupedJob.id]: groupedJob }} />);

    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-status', 'running');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-state', 'processing');
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('shows an indeterminate preparing state for active chapter jobs', () => {
    const preparingJob = {
      id: 'job-preparing',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'xtts',
      status: 'preparing',
      progress: 0,
      started_at: Date.now() / 1000 - 10,
      eta_seconds: 120,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [preparingJob.id]: preparingJob }} />);

    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-status', 'preparing');
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

  it('shows indeterminate jobs as working instead of predictive percentages while running', () => {
    const liveJob = {
      id: 'job-indeterminate',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'cloud_engine',
      status: 'running',
      progress: 0,
      started_at: Date.now() / 1000 - 10,
      eta_seconds: 120,
    } as any;

    const engines = [{ engine_id: 'cloud_engine', cloud: true } as any];
    render(<ChapterList {...defaultProps} engines={engines} jobs={{ [liveJob.id]: liveJob }} chapters={[{ ...mockChapters[0], has_wav: false, audio_file_path: null, audio_status: 'processing' } as any]} />);

    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-predictive', 'true');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-status', 'preparing');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-allow-backward', 'true');
  });

  it('does not reuse a recent completed job once the chapter has been requeued into processing', () => {
    const liveJob = {
      id: 'job-cloud-done',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'cloud_engine',
      status: 'done',
      progress: 1,
      finished_at: Date.now() / 1000,
    } as any;

    const engines = [{ engine_id: 'cloud_engine', cloud: true } as any];
    render(<ChapterList {...defaultProps} engines={engines} jobs={{ [liveJob.id]: liveJob }} chapters={[{ ...mockChapters[0], has_wav: false, audio_file_path: null, audio_status: 'processing' } as any]} />);

    expect(screen.getByText('Queued')).toBeInTheDocument();
    expect(screen.queryByText('Finalizing')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('does not show a stale old done indeterminate job as finalizing on reload', () => {
    const staleDoneJob = {
      id: 'job-cloud-old',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'cloud_engine',
      status: 'done',
      progress: 1,
      finished_at: (Date.now() / 1000) - 120,
    } as any;

    const engines = [{ engine_id: 'cloud_engine', cloud: true } as any];
    render(<ChapterList {...defaultProps} engines={engines} jobs={{ [staleDoneJob.id]: staleDoneJob }} chapters={[{ ...mockChapters[0], has_wav: false, audio_file_path: null, audio_status: 'unprocessed' } as any]} />);

    expect(screen.queryByText('Finalizing')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('does not treat a recently done segment job as chapter finalizing on reload', () => {
    const recentDoneSegmentJob = {
      id: 'job-mixed-segment-done',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'mixed',
      status: 'done',
      progress: 1,
      finished_at: Date.now() / 1000,
      segment_ids: ['seg-1', 'seg-2'],
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [recentDoneSegmentJob.id]: recentDoneSegmentJob }} chapters={[{ ...mockChapters[0], has_wav: false, audio_file_path: null, audio_status: 'unprocessed', done_segments_count: 2, total_segments_count: 2 } as any]} />);

    expect(screen.queryByText('Finalizing')).toBeNull();
    expect(screen.queryByText('100%')).toBeNull();
  });

  it('treats mixed segment jobs as determinate even if segment_ids are missing from later updates', () => {
    const liveSegmentJob = {
      id: 'job-mixed-segment-running',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'mixed',
      status: 'running',
      progress: 0.05,
      custom_title: 'Chapter 1: segment #3',
      started_at: Date.now() / 1000 - 2,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [liveSegmentJob.id]: liveSegmentJob }} chapters={[{ ...mockChapters[0], has_wav: false, audio_file_path: null, audio_status: 'unprocessed', done_segments_count: 2, total_segments_count: 4 } as any]} />);

    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0.05');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-allow-backward', 'true');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-evidence-weight-fraction', '1');
  });

  it('does not show interrupted orb when a job is active for a stale chapter', () => {
    const staleChapter: Chapter = {
      id: 'chap-stale',
      project_id: 'proj-1',
      title: 'Stale Chapter',
      audio_status: 'done',
      audio_file_path: 'old.wav',
      has_wav: true,
      has_mp3: false,
      text_last_modified: Date.now() / 1000,
      audio_generated_at: (Date.now() / 1000) - 1000,
      sort_order: 4
    } as any;

    const activeJob = {
      id: 'job-active',
      project_id: 'proj-1',
      chapter_id: 'chap-stale',
      status: 'running',
      progress: 0.1,
    } as any;

    const { container } = render(<ChapterList {...defaultProps} chapters={[staleChapter]} jobs={{ [activeJob.id]: activeJob }} />);
    
    // StatusOrb should NOT show the AlertTriangle or 'needs rebuild' label
    const orbWithAlert = screen.queryByLabelText(/needs rebuild/i);
    expect(orbWithAlert).toBeNull();
    
    // It SHOULD show the spinner
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('immediately hides the done job and renders the audio player without delay', () => {
    const liveJob = {
      id: 'job-done-recent',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      status: 'done',
      progress: 1,
      finished_at: Date.now() / 1000 - 1,
    } as any;

    const { container } = render(<ChapterList {...defaultProps} jobs={{ [liveJob.id]: liveJob }} chapters={[{ ...mockChapters[0], has_wav: true, audio_status: 'done' } as any]} />);

    expect(screen.queryByTestId('progress-bar')).toBeNull();
    const audioTags = container.querySelectorAll('audio');
    expect(audioTags).toHaveLength(1);
  });
});
