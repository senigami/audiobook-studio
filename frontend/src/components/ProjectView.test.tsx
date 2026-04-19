import { describe, it, expect, vi, beforeEach } from 'vitest';

const stripMotionProps = (props: Record<string, unknown>) => {
  const {
    initial,
    animate,
    exit,
    transition,
    whileHover,
    whileTap,
    whileDrag,
    layout,
    layoutId,
    drag,
    dragListener,
    dragConstraints,
    dragElastic,
    onReorder,
    ...domProps
  } = props;
  void initial;
  void animate;
  void exit;
  void transition;
  void whileHover;
  void whileTap;
  void whileDrag;
  void layout;
  void layoutId;
  void drag;
  void dragListener;
  void dragConstraints;
  void dragElastic;
  void onReorder;
  return domProps;
};

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

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { ProjectView } from './ProjectView';
import { api } from '../api';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mockProject = {
  id: 'proj-123',
  name: 'Test Project',
  series: 'Test Series',
  author: 'Test Author',
  speaker_profile_name: null,
  cover_image_path: '',
  created_at: 1000,
  updated_at: 2000,
};

const mockChapters = [
  { 
    id: 'chap-1', 
    title: 'Chapter 1', 
    audio_status: 'done', 
    char_count: 100,
    total_segments_count: 10,
    done_segments_count: 10,
    has_wav: true,
    predicted_audio_length: 60
  },
  { 
    id: 'chap-2', 
    title: 'Chapter 2', 
    audio_status: 'unprocessed', 
    char_count: 200,
    total_segments_count: 0,
    done_segments_count: 0,
    has_wav: false,
    predicted_audio_length: 120
  },
];

  const mockSpeakerProfiles = [
    {
      name: 'Voice 1',
      wav_count: 1,
      speed: 1,
    is_default: true,
    speaker_id: 'speaker-1',
    variant_name: 'Default',
      preview_url: '/out/voices/Voice 1/sample.wav',
    },
  ];

  const mockSpeakerProfilesWithVariant = [
    {
      name: 'Voice 1 - Angry',
      wav_count: 1,
      speed: 1.5,
      is_default: false,
      speaker_id: 'speaker-1',
      variant_name: 'Angry',
      preview_url: '/out/voices/Voice 1 - Angry/sample.wav',
    },
    {
      name: 'Voice 1',
      wav_count: 1,
      speed: 1,
      is_default: false,
      speaker_id: 'speaker-1',
      variant_name: 'Default',
      preview_url: '/out/voices/Voice 1/sample.wav',
    },
  ];

  const mockSpeakers = [
    {
      id: 'speaker-1',
      name: 'Voice 1',
      default_profile_name: 'Voice 1',
      created_at: 1,
      updated_at: 1,
    },
  ];

describe('ProjectView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectActions.mockClear();
    (api.fetchProject as any).mockResolvedValue(mockProject);
    (api.fetchChapters as any).mockResolvedValue(mockChapters);
    (api.fetchProjectAudiobooks as any).mockResolvedValue([]);
    (api.updateProject as any).mockResolvedValue({ status: 'ok', project_id: mockProject.id });
  });

  const renderProjectView = () => {
    return render(
      <MemoryRouter initialEntries={['/project/proj-123']}>
        <Routes>
          <Route path="/project/:projectId" element={
            <ProjectView 
              jobs={{}} 
              speakerProfiles={mockSpeakerProfiles as any} 
              speakers={mockSpeakers as any} 
            />
          } />
        </Routes>
      </MemoryRouter>
    );
  };

  it('renders loading state', () => {
    (api.fetchProject as any).mockReturnValue(new Promise(() => {}));
    (api.fetchChapters as any).mockReturnValue(new Promise(() => {}));
    (api.fetchProjectAudiobooks as any).mockReturnValue(new Promise(() => {}));

    renderProjectView();
    expect(screen.getByText('Loading project...')).toBeInTheDocument();
  });

  it('loads and renders project and chapters', async () => {
    renderProjectView();

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Test Project')).toBeInTheDocument();
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2')).toBeInTheDocument();
  });

  it('switches to characters tab', async () => {
    renderProjectView();

    await screen.findByText('Test Project');

    fireEvent.click(screen.getByText('Characters'));
    expect(screen.getByText('Characters & Voices')).toBeInTheDocument();
  });

  it('opens add chapter modal', async () => {
    renderProjectView();

    await waitFor(() => screen.findByText('Test Project'));

    fireEvent.click(screen.getByText('Add Chapter'));
    expect(screen.getByText('Add New Chapter')).toBeInTheDocument();
  });

  it('opens edit project modal', async () => {
    renderProjectView();

    await waitFor(() => screen.findByText('Test Project'));

    // ProjectHeader has the edit button with title="Edit Project Metadata"
    fireEvent.click(screen.getByTitle('Edit Project Metadata'));
    expect(screen.getByText('Edit Project Details')).toBeInTheDocument();
  });

  it('enters assembly mode', async () => {
    renderProjectView();

    await waitFor(() => screen.findByText('Test Project'));

    fireEvent.click(screen.getByText('Assemble Project'));
    expect(screen.getByText('Select Chapters for Assembly')).toBeInTheDocument();
    expect(screen.getByText('Confirm Assembly')).toBeInTheDocument();
  });

  it('defaults the queue voice to the available profile', async () => {
    renderProjectView();

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('');
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
    render(
      <MemoryRouter initialEntries={['/projects/proj-123']}>
        <Routes>
          <Route path="/projects/:projectId" element={
            <ProjectView
              jobs={{}}
              speakerProfiles={mockSpeakerProfiles as any}
              speakers={mockSpeakers as any}
              settings={{ default_speaker_profile: 'Voice 1' } as any}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('');
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
    render(
      <MemoryRouter initialEntries={['/projects/proj-123']}>
        <Routes>
          <Route path="/projects/:projectId" element={
            <ProjectView
              jobs={{}}
              speakerProfiles={mockSpeakerProfilesWithVariant as any}
              speakers={mockSpeakers as any}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
    });

    expect(screen.getByDisplayValue('Default Speaker (Voice 1)')).toBeInTheDocument();
  });

  it('stores a real default profile name when a speaker label differs from its default profile', async () => {
    render(
      <MemoryRouter initialEntries={['/projects/proj-123']}>
        <Routes>
          <Route path="/projects/:projectId" element={
            <ProjectView
              jobs={{}}
              speakerProfiles={[
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
              ] as any}
              speakers={[
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
              ] as any}
              settings={{ default_speaker_profile: 'Test' } as any}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('');
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
    render(
      <MemoryRouter initialEntries={['/projects/proj-123']}>
        <Routes>
          <Route path="/projects/:projectId" element={
            <ProjectView
              jobs={{}}
              speakerProfiles={mockSpeakerProfiles as any}
              speakers={mockSpeakers as any}
              settings={{ default_speaker_profile: 'Voice 1' } as any}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    const select = await screen.findByRole('combobox');
    expect(select).toHaveValue('');
    expect(screen.getByDisplayValue('Default Speaker (Voice 1)')).toBeInTheDocument();
  });

  it('persists the project voice selection immediately', async () => {
    renderProjectView();

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('');
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

    render(
      <MemoryRouter initialEntries={['/projects/proj-123']}>
        <Routes>
          <Route path="/projects/:projectId" element={
            <ProjectView
              jobs={{}}
              speakerProfiles={mockSpeakerProfiles as any}
              speakers={mockSpeakers as any}
              settings={{ default_speaker_profile: 'Some Other Voice' } as any}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading project...')).not.toBeInTheDocument();
      expect(screen.getByRole('combobox')).toHaveValue('Voice 1');
    });
  });

  it('renders breadcrumbs when shellState is provided', async () => {
    const mockShellState = {
      navigation: { activeGlobalId: 'project', activeProjectId: 'proj-123', routeKind: 'project-overview' },
      hydration: { status: 'ready', lastHydratedAt: 1000 },
      breadcrumbs: [
        { id: 'library', label: 'Library', href: '/' },
        { id: 'project', label: 'Test Project' }
      ],
      projectSubnav: []
    };

    render(
      <MemoryRouter initialEntries={['/projects/proj-123']}>
        <Routes>
          <Route path="/projects/:projectId" element={
            <ProjectView 
              jobs={{}} 
              speakerProfiles={mockSpeakerProfiles as any} 
              speakers={mockSpeakers as any} 
              shellState={mockShellState as any}
            />
          } />
        </Routes>
      </MemoryRouter>
    );

    await screen.findAllByText('Test Project');
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
  });
});
