import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { api } from '@/api';
import { useBookData } from '@/pages/Book';
import type { Chapter, Project, SpeakerProfile, TtsEngine } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchProject: vi.fn(),
    fetchChapters: vi.fn(),
    fetchCharacters: vi.fn(),
    fetchProjectAudiobooks: vi.fn(),
    createChapter: vi.fn(),
  },
}));

const project: Project = {
  id: 'book-1',
  name: 'Book One',
  series: null,
  author: null,
  speaker_profile_name: null,
  cover_image_path: null,
  created_at: 1,
  updated_at: 1,
};

const chapter: Chapter = {
  id: 'chapter-1',
  project_id: 'book-1',
  title: 'Chapter 1',
  text_content: 'Chapter text',
  speaker_profile_name: null,
  sort_order: 0,
  audio_status: 'unprocessed',
  audio_file_path: null,
  text_last_modified: null,
  audio_generated_at: null,
  char_count: 250,
  word_count: 40,
  sent_count: 2,
  predicted_audio_length: 10,
  audio_length_seconds: 0,
};

const profiles: SpeakerProfile[] = [
  {
    name: 'Narrator',
    wav_count: 1,
    speed: 1,
    is_default: true,
    engine: 'xtts',
  },
];

const engines: TtsEngine[] = [
  {
    engine_id: 'xtts',
    display_name: 'XTTS',
    status: 'ready',
    verified: true,
    enabled: true,
    version: '1',
    local: true,
    cloud: false,
    network: false,
    languages: ['en'],
    capabilities: [],
    resource: {},
    author: '',
    homepage: '',
    settings_schema: {},
  },
];

describe('useBookData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.fetchProject).mockResolvedValue(project);
    vi.mocked(api.fetchChapters).mockResolvedValue([chapter]);
    vi.mocked(api.fetchCharacters).mockResolvedValue([{ id: 'char-1', project_id: 'book-1', name: 'Alice', speaker_profile_name: null, default_emotion: null, color: '#fff' }]);
    vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([{ filename: 'book.mp3' }]);
  });

  it('hydrates book data from the existing project endpoints', async () => {
    const { result } = renderHook(() =>
      useBookData({
        bookId: 'book-1',
        speakerProfiles: profiles,
        speakers: [],
        settings: { default_speaker_profile: 'Narrator' } as any,
        engines,
      }),
    );

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(api.fetchProject).toHaveBeenCalledWith('book-1');
    expect(api.fetchChapters).toHaveBeenCalledWith('book-1');
    expect(api.fetchCharacters).toHaveBeenCalledWith('book-1');
    expect(api.fetchProjectAudiobooks).toHaveBeenCalledWith('book-1');
    expect(result.current.project).toEqual(project);
    expect(result.current.chapters).toEqual([chapter]);
    expect(result.current.characters).toHaveLength(1);
    expect(result.current.availableAudiobooks).toEqual([{ filename: 'book.mp3' }]);
  });

  it('reloads when refreshTrigger changes', async () => {
    const { result, rerender } = renderHook(
      ({ refreshTrigger }) =>
        useBookData({
          bookId: 'book-1',
          speakerProfiles: profiles,
          speakers: [],
          settings: {},
          engines,
          refreshTrigger,
        }),
      { initialProps: { refreshTrigger: 0 } },
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    rerender({ refreshTrigger: 1 });

    await waitFor(() => {
      expect(api.fetchProject).toHaveBeenCalledTimes(2);
    });
  });

  it('uses the project voice before other fallbacks', async () => {
    vi.mocked(api.fetchProject).mockResolvedValue({ ...project, speaker_profile_name: 'Project Voice' });

    const { result } = renderHook(() =>
      useBookData({
        bookId: 'book-1',
        speakerProfiles: profiles,
        speakers: [],
        settings: { default_speaker_profile: 'Narrator' } as any,
        engines,
      }),
    );

    await waitFor(() => {
      expect(result.current.effectiveProjectVoice).toBe('Project Voice');
    });
  });

  it('uses settings before the profile fallback for the effective project voice', async () => {
    const { result } = renderHook(() =>
      useBookData({
        bookId: 'book-1',
        speakerProfiles: profiles,
        speakers: [],
        settings: { default_speaker_profile: 'Settings Voice' } as any,
        engines,
      }),
    );

    await waitFor(() => {
      expect(result.current.effectiveProjectVoice).toBe('Settings Voice');
    });
  });

  it('uses the default profile when project and settings voices are absent', async () => {
    const { result } = renderHook(() =>
      useBookData({
        bookId: 'book-1',
        speakerProfiles: profiles,
        speakers: [],
        settings: {},
        engines,
      }),
    );

    await waitFor(() => {
      expect(result.current.effectiveProjectVoice).toBe('Narrator');
    });
  });

  it('exposes derived runtime values and project actions', async () => {
    vi.mocked(api.fetchChapters).mockResolvedValue([
      { ...chapter, audio_status: 'done', audio_length_seconds: 30, char_count: 100 },
      { ...chapter, id: 'chapter-2', title: 'Chapter 2', audio_status: 'unprocessed', audio_length_seconds: 0, char_count: 200 },
    ]);
    vi.mocked(api.createChapter).mockResolvedValue({ status: 'ok', chapter });

    const { result } = renderHook(() =>
      useBookData({
        bookId: 'book-1',
        speakerProfiles: profiles,
        speakers: [],
        settings: {},
        engines: [{ ...engines[0], calibrated_cps: 20 }],
      }),
    );

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.totalRuntime).toBe(30);
    expect(result.current.totalPredicted).toBe(40);
    expect(result.current.hasUnrendered).toBe(true);
    await result.current.actions.handleCreateChapter('New chapter', 'Text', null, 2);
    expect(api.createChapter).toHaveBeenCalledWith('book-1', {
      title: 'New chapter',
      text_content: 'Text',
      sort_order: 2,
      file: undefined,
    });
  });
});
