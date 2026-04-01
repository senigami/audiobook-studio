import { describe, it, expect } from 'vitest';
import { formatQueueContext } from './queueLabels';

describe('formatQueueContext', () => {
  it('uses project name when present', () => {
    expect(formatQueueContext({
      id: 'job-1',
      project_id: 'project-1',
      chapter_id: 'chapter-1',
      split_part: 0,
      status: 'queued',
      created_at: 0,
      completed_at: null,
      project_name: 'Project A',
      engine: 'xtts',
    })).toBe('Project A');
  });

  it('uses engine-specific labels for voice jobs without a project', () => {
    expect(formatQueueContext({
      id: 'job-2',
      project_id: '',
      chapter_id: '',
      split_part: 0,
      status: 'queued',
      created_at: 0,
      completed_at: null,
      engine: 'voice_test',
    })).toBe('Voice Preview');

    expect(formatQueueContext({
      id: 'job-3',
      project_id: '',
      chapter_id: '',
      split_part: 0,
      status: 'queued',
      created_at: 0,
      completed_at: null,
      engine: 'voice_build',
    })).toBe('Voice Build');
  });

  it('uses engine-specific labels for generic non-project jobs', () => {
    expect(formatQueueContext({
      id: 'job-4',
      project_id: '',
      chapter_id: '',
      split_part: 0,
      status: 'queued',
      created_at: 0,
      completed_at: null,
      engine: 'xtts',
    })).toBe('XTTS Generation');

    expect(formatQueueContext({
      id: 'job-5',
      project_id: '',
      chapter_id: '',
      split_part: 0,
      status: 'queued',
      created_at: 0,
      completed_at: null,
      engine: 'audiobook',
    })).toBe('Audiobook Assembly');
  });
});
