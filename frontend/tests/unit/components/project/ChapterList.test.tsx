import { render, screen } from '@testing-library/react';
import { ChapterList } from '@/pages/ProjectDetail/components/ChapterList';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Chapter } from '@/types';

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({
    progress,
    status,
    state,
    predictive,
    allowBackwardProgress,
    evidenceWeightFraction,
    checkpointMode,
    label,
  }: {
    progress: number;
    status?: string;
    state?: string;
    predictive?: boolean;
    allowBackwardProgress?: boolean;
    evidenceWeightFraction?: number;
    checkpointMode?: string;
    label?: string;
  }) => (
    <div
      data-testid="progress-bar"
      data-progress={progress}
      data-status={status ?? ''}
      data-state={state ?? ''}
      data-predictive={String(!!predictive)}
      data-allow-backward={String(!!allowBackwardProgress)}
      data-evidence-weight-fraction={evidenceWeightFraction ?? ''}
      data-checkpoint-mode={checkpointMode ?? ''}
      data-label={label ?? ''}
    />
  ),
}));

import { loadAndPlay, usePlayerBus } from '@/store/playerBus';
import { fireEvent } from '@testing-library/react';

vi.mock('@/store/playerBus', () => {
  const state = {
    scope: null as any,
    playing: false,
    audioUrl: null as any,
  };
  return {
    usePlayerBus: vi.fn().mockReturnValue(state),
    loadAndPlay: vi.fn().mockImplementation((opts) => {
      state.scope = opts.scope;
      state.audioUrl = opts.audioUrl;
      state.playing = true;
    }),
    play: vi.fn().mockImplementation(() => {
      state.playing = true;
    }),
    pause: vi.fn().mockImplementation(() => {
      state.playing = false;
    }),
  };
});

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

  beforeEach(() => {
    const state = vi.mocked(usePlayerBus)();
    state.scope = null;
    state.playing = false;
    state.audioUrl = null;
  });

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
    vi.mocked(loadAndPlay).mockClear();
    render(<ChapterList {...defaultProps} />);
    
    const playButtons = screen.getAllByTitle('Play Chapter Audio');
    expect(playButtons).toHaveLength(2);
    
    fireEvent.click(playButtons[0]);
    expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'chapter',
      audioUrl: '/api/projects/proj-1/chapters/chap-123/assets/audio?filename=chap-123_0.wav'
    }));
  });

  it('falls back to chap.id when audio_file_path is missing', () => {
    vi.mocked(loadAndPlay).mockClear();
    render(<ChapterList {...defaultProps} />);
    
    const playButtons = screen.getAllByTitle('Play Chapter Audio');
    fireEvent.click(playButtons[1]);
    expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'chapter',
      audioUrl: '/api/projects/proj-1/chapters/chap-456/assets/audio?filename=chapter.wav'
    }));
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

    // P3: queued state uses Clock icon (static, no spin) — not a warning icon
    const queuedIcon = container.querySelector('[data-testid="orb-icon-queued"]');
    expect(queuedIcon).toBeTruthy();
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
  });

  it('treats segment-capable grouped chapter jobs as chapter progress in the chapter list', () => {
    const liveJob = {
      id: 'job-segment-capable-chapter',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      status: 'running',
      progress: 0.4,
      has_segment_support: true,
      started_at: Date.now() / 1000 - 30,
      eta_seconds: 120,
      render_group_count: 3,
      completed_render_groups: 1,
      active_render_group_index: 2,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      total_render_weight: 1000,
      completed_render_weight: 500,
      active_render_group_weight: 400,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [liveJob.id]: liveJob }} />);

    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-progress', '0.63');
    expect(screen.getByTestId('progress-bar')).toHaveAttribute('data-checkpoint-mode', 'queue');
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

    render(<ChapterList {...defaultProps} jobs={{ [liveJob.id]: liveJob }} chapters={[{ ...mockChapters[0], has_wav: true, audio_status: 'done' } as any]} />);

    expect(screen.queryByTestId('progress-bar')).toBeNull();
    expect(screen.getByTitle('Play Chapter Audio')).toBeInTheDocument();
  });

  it('hides estimated runtime badge if predicted_audio_length is missing, rendering only word and character counts', () => {
    const chapterWithoutEta = {
      id: 'chap-no-eta',
      project_id: 'proj-1',
      title: 'No ETA Chapter',
      audio_status: 'unprocessed',
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
      sort_order: 3,
      word_count: 320,
      char_count: 1800,
      predicted_audio_length: null,
    } as any;

    render(<ChapterList {...defaultProps} chapters={[chapterWithoutEta]} />);

    expect(screen.getByText('320 words')).toBeInTheDocument();
    expect(screen.getByText('1800 chars')).toBeInTheDocument();
    expect(screen.queryByText(/runtime/i)).toBeNull();
  });

  it('does not render estimated runtime badge even when predicted_audio_length is present', () => {
    const chapterWithEta = {
      id: 'chap-with-eta',
      project_id: 'proj-1',
      title: 'With ETA Chapter',
      audio_status: 'unprocessed',
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
      sort_order: 4,
      word_count: 500,
      char_count: 3000,
      predicted_audio_length: 45,
    } as any;

    render(<ChapterList {...defaultProps} chapters={[chapterWithEta]} />);

    expect(screen.getByText('500 words')).toBeInTheDocument();
    expect(screen.getByText('3000 chars')).toBeInTheDocument();
    expect(screen.queryByText(/runtime/i)).toBeNull();
  });

  it('shows "Loading model" badge and "loading voice model…" bar label when reason_code is LOADING_MODEL', () => {
    // A preparing job with LOADING_MODEL reason_code is the model cold-load window.
    // ChapterList must render the "Loading model" status badge and pass the
    // "loading voice model…" label to PredictiveProgressBar (not the status string).
    const loadingModelJob = {
      id: 'job-loading-model',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'xtts',
      status: 'preparing',
      reason_code: 'LOADING_MODEL',
      progress: 0,
      started_at: Date.now() / 1000 - 5,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [loadingModelJob.id]: loadingModelJob }} />);

    // Badge text must be "Loading model" not "Preparing"
    expect(screen.getByText('Loading model')).toBeInTheDocument();
    expect(screen.queryByText('Preparing')).toBeNull();

    // PredictiveProgressBar label must be the loading-model string, not the status
    const bar = screen.getByTestId('progress-bar');
    expect(bar).toHaveAttribute('data-label', 'loading voice model…');
    expect(bar).toHaveAttribute('data-status', 'preparing');
  });

  it('shows normal "Preparing" badge and status label when preparing without LOADING_MODEL reason_code', () => {
    // A plain preparing job (no LOADING_MODEL) should use the normal presentation path.
    const plainPreparingJob = {
      id: 'job-plain-preparing',
      project_id: 'proj-1',
      chapter_id: 'chap-123',
      engine: 'xtts',
      status: 'preparing',
      progress: 0,
      started_at: Date.now() / 1000 - 3,
    } as any;

    render(<ChapterList {...defaultProps} jobs={{ [plainPreparingJob.id]: plainPreparingJob }} />);

    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.queryByText('Loading model')).toBeNull();

    const bar = screen.getByTestId('progress-bar');
    expect(bar).toHaveAttribute('data-label', 'preparing');
    expect(bar).toHaveAttribute('data-status', 'preparing');
  });
});
