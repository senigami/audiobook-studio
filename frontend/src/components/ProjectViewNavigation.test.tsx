import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('ProjectView - Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchProject as any).mockResolvedValue(mockProject);
    (api.fetchChapters as any).mockResolvedValue(mockChapters);
    (api.fetchProjectAudiobooks as any).mockResolvedValue([]);
  });

  it('switches to characters tab', async () => {
    renderProjectView();
    await screen.findAllByText('Test Project');

    fireEvent.click(screen.getByText('Characters'));
    expect(await screen.findByText('Characters & Voices')).toBeInTheDocument();
  });

  it('switches to assemblies tab', async () => {
    renderProjectView();
    await screen.findAllByText('Test Project');

    fireEvent.click(screen.getByRole('link', { name: /^Assemblies$/i }));
    expect(await screen.findByRole('heading', { name: /Project Assemblies/i })).toBeInTheDocument();
  });

  it('switches to backups tab', async () => {
    (api.fetchProjectBackups as any).mockResolvedValue([]);
    renderProjectView();
    await screen.findAllByText('Test Project');

    fireEvent.click(screen.getByRole('link', { name: /^Backups$/i }));
    expect(await screen.findByRole('heading', { name: /Backups/i })).toBeInTheDocument();
  });

  it('opens add chapter modal', async () => {
    renderProjectView();
    await waitFor(() => screen.findAllByText('Test Project'));

    fireEvent.click(screen.getByText('Add Chapter'));
    expect(screen.getByText('Add New Chapter')).toBeInTheDocument();
  });

  it('opens edit project modal', async () => {
    renderProjectView();
    await waitFor(() => screen.findAllByText('Test Project'));

    fireEvent.click(screen.getByTitle('Edit Project Metadata'));
    expect(screen.getByText('Edit Project Details')).toBeInTheDocument();
  });

  it('enters assembly mode', async () => {
    renderProjectView();
    await waitFor(() => screen.findAllByText('Test Project'));

    fireEvent.click(screen.getByTitle('Assemble Project'));
    expect(screen.getByText('Select Chapters for Assembly')).toBeInTheDocument();
    expect(screen.getByText('Confirm Assembly')).toBeInTheDocument();
  });
});
