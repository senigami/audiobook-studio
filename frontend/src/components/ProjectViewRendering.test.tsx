import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { api } from '../api';
import { 
  renderProjectView, mockProject, mockChapters, stripMotionProps
} from './ProjectViewTestHelpers';

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

describe('ProjectView - Rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchProject as any).mockResolvedValue(mockProject);
    (api.fetchChapters as any).mockResolvedValue(mockChapters);
    (api.fetchProjectAudiobooks as any).mockResolvedValue([]);
  });

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

    expect(screen.getAllByText('Test Project')[0]).toBeInTheDocument();
    expect(screen.getByText('Chapter 1')).toBeInTheDocument();
    expect(screen.getByText('Chapter 2')).toBeInTheDocument();
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

    renderProjectView({ shellState: mockShellState });

    await screen.findAllByText('Test Project');
    expect(screen.getByRole('navigation', { name: /breadcrumb/i })).toBeInTheDocument();
    expect(screen.getByText('Library')).toBeInTheDocument();
  });
});
