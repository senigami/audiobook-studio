import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { api } from '../api';
import { 
  renderProjectView, mockProject, mockChapters, 
  mockSpeakerProfilesWithVariant, stripMotionProps
} from './ProjectViewTestHelpers';

const mockUseProjectActions = vi.hoisted(() =>
  vi.fn(() => ({
    submitting: false,
    handleCreateChapter: vi.fn(),
    handleUpdateProject: vi.fn(),
    handleDeleteChapter: vi.fn(),
    handleReorderChapters: vi.fn(),
    handleQueueChapter: vi.fn(),
    handleResetChapterAudio: vi.fn(),
    handleQueueAllUnprocessed: vi.fn(),
    handleAssembleProject: vi.fn(),
    handleDeleteAudiobook: vi.fn(),
    handleSaveBackup: vi.fn(),
    handleDeleteBackup: vi.fn(),
    handleUpdateBackupMetadata: vi.fn(),
    handleUpdateAudiobookMetadata: vi.fn(),
  }))
);

// Mock API
vi.mock('../api', () => ({
  api: {
    fetchProject: vi.fn(),
    fetchChapters: vi.fn(),
    fetchProjectAudiobooks: vi.fn(),
    fetchCharacters: vi.fn().mockResolvedValue([]),
    fetchSegments: vi.fn().mockResolvedValue([]),
    updateChapter: vi.fn(),
    updateProject: vi.fn(),
    exportSample: vi.fn(),
    fetchProjectBackups: vi.fn().mockResolvedValue([]),
    updateProjectBackupMetadata: vi.fn().mockResolvedValue({ status: 'ok' }),
    updateAudiobookMetadata: vi.fn().mockResolvedValue({ status: 'ok' }),
  },
}));

// Mock hooks
vi.mock('../hooks/useProjectActions', () => ({
  useProjectActions: () => mockUseProjectActions(),
}));

vi.mock('./CharactersTab', () => ({
  CharactersTab: () => <div>Characters & Voices</div>,
}));

// Mock lucide-react
vi.mock('lucide-react', () => ({
  Plus: () => <div data-testid="plus-icon" />,
  Zap: () => <div data-testid="zap-icon" />,
  ArrowUpDown: () => <div data-testid="arrow-up-down-icon" />,
  MoreVertical: () => <div data-testid="more-vertical-icon" />,
  Book: () => <div data-testid="book-icon" />,
  FileText: () => <div />,
  GripVertical: () => <div />,
  CheckSquare: () => <div />,
  Square: () => <div />,
  RefreshCw: () => <div />,
  Edit3: () => <div />,
  Video: () => <div />,
  Download: () => <div />,
  Trash2: () => <div />,
  Loader2: () => <div />,
  AlertTriangle: () => <div />,
  Volume2: () => <div />,
  Info: () => <div />,
  ChevronRight: () => <div />,
  ChevronDown: () => <div />,
  User: () => <div />,
  List: () => <div />,
  Play: () => <div />,
  Pause: () => <div />,
  X: () => <div />,
  Music: () => <div />,
  Upload: () => <div />,
  Image: () => <div data-testid="image-icon" />,
  ArrowLeft: () => <div />,
  Clock: () => <div />,
  CheckCircle: () => <div />,
  Database: () => <div />,
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...stripMotionProps(props)}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...stripMotionProps(props)}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
  Reorder: {
      Group: ({ children, ...props }: any) => <div data-testid="reorder-group" {...stripMotionProps(props)}>{children}</div>,
      Item: ({ children, ...props }: any) => <div data-testid="reorder-item" {...stripMotionProps(props)}>{children}</div>,
  }
}));

describe('ProjectView - Speaker Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectActions.mockClear();
    (api.fetchProject as any).mockResolvedValue(mockProject);
    (api.fetchChapters as any).mockResolvedValue(mockChapters);
    (api.fetchProjectAudiobooks as any).mockResolvedValue([]);
    (api.updateProject as any).mockResolvedValue({ status: 'ok', project_id: mockProject.id });
  });

  it('defaults the queue voice to the available profile', async () => {
    renderProjectView();

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByText('Queue Remaining'));
    await waitFor(() => {
      const actions = mockUseProjectActions.mock.results.at(-1)?.value;
      expect(actions?.handleQueueAllUnprocessed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'Voice 1'
      );
    });
  });

  it('allows clearing the chapter voice back to Default Speaker', async () => {
    renderProjectView({
      settings: { default_speaker_profile: 'Voice 1' } as any
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });

    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByDisplayValue('Default Speaker (Voice 1)')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Queue Remaining'));
    await waitFor(() => {
      const actions = mockUseProjectActions.mock.results.at(-1)?.value;
      expect(actions?.handleQueueAllUnprocessed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'Voice 1'
      );
    });
  });

  it('prefers the base Default voice when both a base profile and variant exist', async () => {
    renderProjectView({
      speakerProfiles: mockSpeakerProfilesWithVariant
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Default Speaker (Voice 1)')).toBeInTheDocument();
  });

  it('stores a real default profile name when a speaker label differs from its default profile', async () => {
    renderProjectView({
      speakerProfiles: [
        {
          name: 'Dark Fantasy - Default',
          wav_count: 1,
          speed: 1,
          is_default: false,
          speaker_id: 'speaker-dark-fantasy',
          variant_name: 'Default',
          preview_url: '/out/voices/Dark Fantasy - Default/sample.wav',
        },
        {
          name: 'Dark Fantasy - Light Narrator',
          wav_count: 1,
          speed: 1,
          is_default: false,
          speaker_id: 'speaker-dark-fantasy',
          variant_name: 'Light Narrator',
          preview_url: '/out/voices/Dark Fantasy - Light Narrator/sample.wav',
        },
        {
          name: 'Test',
          wav_count: 1,
          speed: 1,
          is_default: true,
          speaker_id: 'speaker-test',
          variant_name: 'Default',
          preview_url: '/out/voices/Test/sample.wav',
        },
      ] as any,
      speakers: [
        {
          id: 'speaker-dark-fantasy',
          name: 'Dark Fantasy',
          default_profile_name: 'Dark Fantasy - Default',
          created_at: 1,
          updated_at: 1,
        },
        {
          id: 'speaker-test',
          name: 'Test',
          default_profile_name: 'Test',
          created_at: 1,
          updated_at: 1,
        },
      ] as any,
      settings: { default_speaker_profile: 'Test' } as any
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Dark Fantasy - Default' } });
    expect(screen.getByDisplayValue('Dark Fantasy')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Queue Remaining'));
    await waitFor(() => {
      const actions = mockUseProjectActions.mock.results.at(-1)?.value;
      expect(actions?.handleQueueAllUnprocessed).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(Object),
        'Dark Fantasy - Default'
      );
    });
  });

  it('keeps the default option selected after reload when no project override is saved', async () => {
    renderProjectView({
      settings: { default_speaker_profile: 'Voice 1' } as any
    });

    const select = await screen.findByRole('combobox');
    expect(select).toHaveValue('');
    expect(screen.getByDisplayValue('Default Speaker (Voice 1)')).toBeInTheDocument();
  });

  it('persists the project voice selection immediately', async () => {
    renderProjectView();

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(0);
    });

    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });

    await waitFor(() => {
      expect(api.updateProject).toHaveBeenCalledWith('proj-123', { speaker_profile_name: null });
    });
  });

  it('loads a saved project voice instead of reusing the global default', async () => {
    (api.fetchProject as any).mockResolvedValue({
      ...mockProject,
      speaker_profile_name: 'Voice 1',
    });

    renderProjectView({
      settings: { default_speaker_profile: 'Some Other Voice' } as any
    });

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('Voice 1');
    });
  });
});
