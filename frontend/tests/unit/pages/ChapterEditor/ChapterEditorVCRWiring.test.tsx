import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChapterEditor } from '@/pages/ChapterEditor/ChapterEditorPage';
import { api } from '@/api';
import { 
  mockChapterId, 
  mockProjectId, 
  mockChapter, 
  mockSegments,
  mockScriptView,
  stripMotionProps
} from '@tests/helpers/chapterEditorFixtures';

// Mock API
vi.mock('@/api', () => ({
  api: {
    fetchChapters: vi.fn(),
    fetchSegments: vi.fn(),
    fetchCharacters: vi.fn(),
    fetchScriptView: vi.fn(),
    fetchChapterRenderGroups: vi.fn(),
  },
}));

// Mock hooks
const mockPlaySegment = vi.fn();
const mockStopPlayback = vi.fn();
const mockTogglePause = vi.fn();

vi.mock('@/hooks/useChapterPlayback', () => ({
  useChapterPlayback: vi.fn(() => ({
    playingSegmentId: null,
    playingSegmentIds: new Set(),
    playSegment: mockPlaySegment,
    stopPlayback: mockStopPlayback,
    togglePause: mockTogglePause,
    isPlaying: false,
    isPaused: false,
    startSkim: vi.fn(),
    stopSkim: vi.fn(),
  })),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...stripMotionProps(props)}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const localSegments = [
  { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'Once upon a time.', character_id: null, audio_status: 'unprocessed' as const },
  { id: 'seg-2', chapter_id: mockChapterId, segment_order: 1, text_content: 'They lived happily ever after.', character_id: null, audio_status: 'unprocessed' as const },
  { id: 'seg-3', chapter_id: mockChapterId, segment_order: 2, text_content: 'The end.', character_id: null, audio_status: 'unprocessed' as const },
];

const localScriptView = {
  ...mockScriptView,
  paragraphs: [
    { id: 'para-1', span_ids: ['seg-1', 'seg-2', 'seg-3'] },
  ],
  spans: localSegments.map((segment, index) => ({
    id: segment.id,
    order_index: index,
    text: segment.text_content,
    sanitized_text: segment.text_content,
    character_id: null,
    speaker_profile_name: null,
    status: 'draft',
    audio_file_path: null,
    audio_generated_at: null,
    char_count: segment.text_content.length,
    sanitized_char_count: segment.text_content.length,
  })),
  render_batches: [
    { id: 'batch-1', span_ids: ['seg-1', 'seg-2'], status: 'rendered', estimated_work_weight: 1 },
    { id: 'batch-2', span_ids: ['seg-3'], status: 'rendered', estimated_work_weight: 1 },
  ],
  audio_groups: [
    { id: 'audio-1', span_ids: ['seg-1', 'seg-2'], status: 'rendered', audio_file_path: 'audio-1.wav', asset_url: null, order_index: 0, estimated_work_weight: 1 },
    { id: 'audio-2', span_ids: ['seg-3'], status: 'rendered', audio_file_path: 'audio-2.wav', asset_url: null, order_index: 1, estimated_work_weight: 1 },
  ],
};

describe('ChapterEditor - VCR Wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchChapters as any).mockResolvedValue([mockChapter]);
    (api.fetchSegments as any).mockResolvedValue(localSegments);
    (api.fetchCharacters as any).mockResolvedValue([]);
    (api.fetchScriptView as any).mockResolvedValue(localScriptView);
    (api.fetchChapterRenderGroups as any).mockResolvedValue({ count: 0, groups: [] });
  });

  it('wires Play button to playSegment for first segment when nothing is playing', async () => {
    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={[]} 
        speakers={[]} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    
    const playButton = screen.getByLabelText('Play');
    fireEvent.click(playButton);

    expect(mockPlaySegment).toHaveBeenCalledWith(localSegments[0].id, localSegments.map(s => s.id));
  });

  it('wires Pause button to togglePause when playing', async () => {
    const useChapterPlayback = await import('@/hooks/useChapterPlayback');
    (useChapterPlayback.useChapterPlayback as any).mockReturnValue({
        playingSegmentId: localSegments[0].id,
        playingSegmentIds: new Set([localSegments[0].id]),
        playSegment: mockPlaySegment,
        stopPlayback: mockStopPlayback,
        togglePause: mockTogglePause,
        isPlaying: true,
        isPaused: false,
    });

    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={[]} 
        speakers={[]} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    
    const pauseButton = screen.getByLabelText('Pause');
    fireEvent.click(pauseButton);

    expect(mockTogglePause).toHaveBeenCalled();
  });

  it('wires Next button to playSegment for the next audio block', async () => {
    const useChapterPlayback = await import('@/hooks/useChapterPlayback');
    (useChapterPlayback.useChapterPlayback as any).mockReturnValue({
        playingSegmentId: localSegments[0].id,
        playingSegmentIds: new Set([localSegments[0].id, localSegments[1].id]),
        playSegment: mockPlaySegment,
        stopPlayback: mockStopPlayback,
        togglePause: mockTogglePause,
        isPlaying: true,
        isPaused: false,
    });

    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={[]} 
        speakers={[]} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    
    const nextButton = screen.getByLabelText('Next Segment');
    fireEvent.click(nextButton);

    expect(mockPlaySegment).toHaveBeenCalledWith(localSegments[2].id, localSegments.map(s => s.id));
  });
});
