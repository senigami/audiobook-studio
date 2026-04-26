import type { Character } from '../../types';

export const mockProjectId = 'proj-123';
export const mockChapterId = 'chap-456';

export const mockChapter = {
  id: mockChapterId,
  project_id: mockProjectId,
  title: 'Test Chapter',
  text_content: 'Once upon a time.',
  speaker_profile_name: null,
  char_count: 50,
  word_count: 10,
  audio_status: 'unprocessed' as const,
};

export const mockSpeakers = [
  { id: 'speaker-1', name: 'Voice 1' }
];

export const mockSpeakerProfiles = [
  { name: 'Profile 1', speaker_id: 'speaker-1', variant_name: 'Standard' },
  { name: 'Profile 2', speaker_id: 'speaker-1', variant_name: 'Warm' }
];

export const mockSegments = [
  { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'Once upon a time.', character_id: null, audio_status: 'unprocessed' }
];

export const mockProductionBlocks = [
  {
    id: 'block-1',
    order_index: 0,
    text: 'Once upon a time.',
    character_id: null,
    speaker_profile_name: null,
    status: 'draft',
    source_segment_ids: ['seg-1']
  }
];

export const mockRenderBatches = [
  {
    id: 'batch-1',
    block_ids: ['block-1'],
    status: 'queued',
    estimated_work_weight: 1
  }
];

export const mockCharacters: Character[] = [
  { id: 'char-1', project_id: mockProjectId, name: 'Char 1', color: '#ff0000', speaker_profile_name: 'Voice 1' } as any
];

export const mockScriptView = {
  chapter_id: mockChapterId,
  base_revision_id: 'rev-1',
  paragraphs: [
    { id: 'para-1', span_ids: ['seg-1'] }
  ],
  spans: [
    {
      id: 'seg-1',
      order_index: 0,
      text: 'Once upon a time.',
      sanitized_text: 'Once upon a time.',
      character_id: null,
      speaker_profile_name: null,
      status: 'draft',
      audio_file_path: null,
      audio_generated_at: null,
      char_count: 17,
      sanitized_char_count: 17
    }
  ],
  render_batches: [
    { id: 'batch-1', span_ids: ['seg-1'], status: 'draft', estimated_work_weight: 1 }
  ]
};

export const stripMotionProps = (props: Record<string, unknown>) => {
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
    dragConstraints,
    dragElastic,
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
  void dragConstraints;
  void dragElastic;
  return domProps;
};
