import type { Job, Project, Chapter, ProductionBlocksResponse, ProductionBlock, ScriptViewResponse, ScriptAssignmentsUpdate } from '../types';
import { DEFAULT_VOICE_SENTINEL } from '../constants/api';

const parseApiResponse = async (res: Response) => {
  const data = await res.json();
  if (!res.ok || data?.status === 'error') {
    const error = new Error(data?.message || 'Request failed') as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return data;
};

export const api = {
  fetchHome: async (): Promise<any> => {
    const res = await fetch('/api/home');
    return res.json();
  },
  // --- Projects ---
  fetchProjects: async (): Promise<Project[]> => {
    const res = await fetch('/api/projects');
    return res.json();
  },
  fetchProject: async (id: string): Promise<Project> => {
    const res = await fetch(`/api/projects/${id}`);
    return res.json();
  },
  createProject: async (data: { name: string; series?: string; author?: string; speaker_profile_name?: string | null; cover?: File }): Promise<{ status: string; project_id: string }> => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.series) formData.append('series', data.series);
    if (data.author) formData.append('author', data.author);
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || DEFAULT_VOICE_SENTINEL);
    if (data.cover) formData.append('cover', data.cover);
    const res = await fetch('/api/projects', { method: 'POST', body: formData });
    return res.json();
  },
  updateProject: async (id: string, data: { name?: string; series?: string; author?: string; speaker_profile_name?: string | null; cover?: File }): Promise<any> => {
    const formData = new FormData();
    if (data.name) formData.append('name', data.name);
    if (data.series) formData.append('series', data.series);
    if (data.author) formData.append('author', data.author);
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || DEFAULT_VOICE_SENTINEL);
    if (data.cover) formData.append('cover', data.cover);
    const res = await fetch(`/api/projects/${id}`, { method: 'PUT', body: formData });
    return res.json();
  },
  deleteProject: async (projectId: string): Promise<any> => {
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    return res.json();
  },
  assembleProject: async (projectId: string, chapterIds?: string[]): Promise<any> => {
    const formData = new FormData();
    if (chapterIds) {
        formData.append('chapter_ids', JSON.stringify(chapterIds));
    }
    const res = await fetch(`/api/projects/${projectId}/assemble`, { method: 'POST', body: formData });
    return res.json();
  },

  // --- Characters ---
  fetchCharacters: async (projectId: string): Promise<import('../types').Character[]> => {
    const res = await fetch(`/api/projects/${projectId}/characters`);
    const data = await res.json();
    return data.characters || [];
  },
  createCharacter: async (projectId: string, name: string, speaker_profile_name?: string, default_emotion?: string, color?: string): Promise<{status: string, character_id: string}> => {
    const formData = new FormData();
    formData.append('name', name);
    if (speaker_profile_name) formData.append('speaker_profile_name', speaker_profile_name);
    if (default_emotion) formData.append('default_emotion', default_emotion);
    if (color) formData.append('color', color);
    const res = await fetch(`/api/projects/${projectId}/characters`, { method: 'POST', body: formData });
    return res.json();
  },
  updateCharacter: async (characterId: string, name?: string, speaker_profile_name?: string, default_emotion?: string, color?: string): Promise<{status: string}> => {
    const formData = new FormData();
    if (name) formData.append('name', name);
    // Allowing empty strings to clear the profile
    if (speaker_profile_name !== undefined) formData.append('speaker_profile_name', speaker_profile_name);
    if (default_emotion !== undefined) formData.append('default_emotion', default_emotion);
    if (color !== undefined) formData.append('color', color);
    const res = await fetch(`/api/characters/${characterId}`, { method: 'PUT', body: formData });
    return res.json();
  },
  deleteCharacter: async (characterId: string): Promise<{status: string}> => {
    const res = await fetch(`/api/characters/${characterId}`, { method: 'DELETE' });
    return res.json();
  },

  // --- Chapters ---
  fetchChapters: async (projectId: string): Promise<Chapter[]> => {
    const res = await fetch(`/api/projects/${projectId}/chapters`);
    return res.json();
  },
  createChapter: async (projectId: string, data: { title: string; text_content?: string; sort_order?: number; file?: File }): Promise<{status: string, chapter: Chapter}> => {
    const formData = new FormData();
    formData.append('title', data.title);
    if (data.text_content) formData.append('text_content', data.text_content);
    formData.append('sort_order', (data.sort_order || 0).toString());
    if (data.file) formData.append('file', data.file);
    const res = await fetch(`/api/projects/${projectId}/chapters`, { method: 'POST', body: formData });
    return res.json();
  },
  updateChapter: async (chapterId: string, data: { title?: string; text_content?: string; speaker_profile_name?: string | null }): Promise<{status: string, chapter: Chapter}> => {
    const formData = new FormData();
    if (data.title) formData.append('title', data.title);
    if (data.text_content !== undefined) formData.append('text_content', data.text_content ?? '');
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || DEFAULT_VOICE_SENTINEL);
    const res = await fetch(`/api/chapters/${chapterId}`, { method: 'PUT', body: formData });
    return res.json();
  },
  deleteChapter: async (chapterId: string): Promise<{ status: string }> => {
    const res = await fetch(`/api/chapters/${chapterId}`, { method: 'DELETE' });
    return res.json();
  },
  reorderChapters: async (projectId: string, chapterIds: string[]): Promise<{ status: string }> => {
    const formData = new FormData();
    formData.append('chapter_ids', JSON.stringify(chapterIds));
    const res = await fetch(`/api/projects/${projectId}/reorder_chapters`, { method: 'POST', body: formData });
    return res.json();
  },
  analyzeChapter: async (chapterId: string): Promise<any> => {
    const res = await fetch(`/api/chapters/${chapterId}/analyze`);
    return res.json();
  },
  fetchProductionBlocks: async (chapterId: string): Promise<ProductionBlocksResponse> => {
    const res = await fetch(`/api/chapters/${chapterId}/production-blocks`);
    return parseApiResponse(res);
  },
  fetchScriptView: async (chapterId: string): Promise<ScriptViewResponse> => {
    const res = await fetch(`/api/chapters/${chapterId}/script-view`);
    return parseApiResponse(res);
  },
  saveScriptAssignments: async (chapterId: string, payload: ScriptAssignmentsUpdate): Promise<ScriptViewResponse> => {
    const res = await fetch(`/api/chapters/${chapterId}/script-view/assignments`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.status === 409) {
      const errorData = await res.json();
      const err = new Error(errorData.message || 'Revision mismatch');
      (err as any).status = 409;
      (err as any).expected_base_revision_id = errorData.expected_base_revision_id;
      (err as any).base_revision_id = errorData.base_revision_id;
      throw err;
    }
    return parseApiResponse(res);
  },
  compactScriptView: async (chapterId: string, baseRevisionId?: string): Promise<ScriptViewResponse> => {
    const res = await fetch(`/api/chapters/${chapterId}/script-view/compact`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_revision_id: baseRevisionId })
    });
    if (res.status === 409) {
      const errorData = await res.json();
      const err = new Error(errorData.message || 'Revision mismatch');
      (err as any).status = 409;
      (err as any).expected_base_revision_id = errorData.expected_base_revision_id;
      (err as any).base_revision_id = errorData.base_revision_id;
      throw err;
    }
    return parseApiResponse(res);
  },
  previewSourceTextResync: async (chapterId: string, textContent: string): Promise<{
    total_segments_before: number;
    total_segments_after: number;
    preserved_assignments_count: number;
    lost_assignments_count: number;
    affected_character_names: string[];
    is_destructive: boolean;
  }> => {
    const res = await fetch(`/api/chapters/${chapterId}/source-text/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text_content: textContent })
    });
    return parseApiResponse(res);
  },
  updateProductionBlocks: async (
    chapterId: string,
    data: { base_revision_id?: string; blocks: ProductionBlock[] }
  ): Promise<ProductionBlocksResponse> => {
    const res = await fetch(`/api/chapters/${chapterId}/production-blocks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base_revision_id: data.base_revision_id,
        blocks: data.blocks,
      }),
    });
    return parseApiResponse(res);
  },
  exportChapterAudio: async (chapterId: string, format: 'wav' | 'mp3'): Promise<Blob> => {
    const res = await fetch(`/api/chapters/${chapterId}/export-audio`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ format }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.message || 'Audio export failed');
    }
    return res.blob();
  },

  // --- Segments ---
  fetchSegments: async (chapterId: string): Promise<import('../types').ChapterSegment[]> => {
    const res = await fetch(`/api/chapters/${chapterId}/segments`);
    const data = await res.json();
    return data.segments || [];
  },
  updateSegment: async (segmentId: string, data: { character_id?: string | null; speaker_profile_name?: string | null; audio_status?: string }): Promise<any> => {
    const formData = new FormData();
    if (data.character_id !== undefined) formData.append('character_id', data.character_id || "");
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || "");
    if (data.audio_status) formData.append('audio_status', data.audio_status);
    const res = await fetch(`/api/segments/${segmentId}`, { method: 'PUT', body: formData });
    return res.json();
  },
  updateSegmentsBulk: async (segmentIds: string[], data: { character_id?: string | null; speaker_profile_name?: string | null; audio_status?: string }): Promise<any> => {
    const res = await fetch('/api/segments/bulk-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        segment_ids: segmentIds,
        updates: data,
      }),
    });
    return res.json();
  },
  generateSegments: async (segmentIds: string[], speakerProfile?: string): Promise<any> => {
    const formData = new FormData();
    formData.append('segment_ids', segmentIds.join(','));
    if (speakerProfile) formData.append('speaker_profile', speakerProfile);
    const res = await fetch('/api/segments/generate', { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
  bakeChapter: async (chapterId: string): Promise<any> => {
    const res = await fetch(`/api/chapters/${chapterId}/bake`, { method: 'POST' });
    return parseApiResponse(res);
  },
  cancelChapterGeneration: async (chapterId: string): Promise<any> => {
    const res = await fetch(`/api/chapters/${chapterId}/cancel`, { method: 'POST' });
    return res.json();
  },

  // --- Jobs ---
  fetchJobs: async (): Promise<Job[]> => {
    const res = await fetch('/api/jobs');
    return res.json();
  },
  fetchActiveJob: async (): Promise<Job | null> => {
    const res = await fetch('/api/active_job');
    return res.json();
  },
  fetchJobDetails: async (filename: string): Promise<Job | null> => {
    const res = await fetch(`/api/job/${encodeURIComponent(filename)}`);
    return res.json();
  },
  fetchPreview: async (filename: string, processed: boolean = false): Promise<{ text: string; error?: string }> => {
    const res = await fetch(`/api/preview/${encodeURIComponent(filename)}?processed=${processed}`);
    return res.json();
  },
  updateTitle: async (filename: string, newTitle: string): Promise<any> => {
    const formData = new FormData();
    formData.append('chapter_file', filename);
    formData.append('new_title', newTitle);
    const res = await fetch('/api/job/update_title', { method: 'POST', body: formData });
    return res.json();
  },
  deleteAudiobook: async (filename: string, projectId?: string): Promise<any> => {
    const res = await fetch(`/api/audiobook/${encodeURIComponent(filename)}${projectId ? `?project_id=${projectId}` : ''}`, { method: 'DELETE' });
    return res.json();
  },
  resetChapter: async (chapterId: string): Promise<any> => {
    const res = await fetch(`/api/chapters/${chapterId}/reset`, { method: 'POST' });
    return res.json();
  },
  enqueueSingle: async (filename: string, engine: 'xtts', voice?: string): Promise<any> => {
    const formData = new FormData();
    formData.append('chapter_file', filename);
    formData.append('engine', engine);
    if (voice) formData.append('voice', voice);
    const res = await fetch('/api/queue/single', { method: 'POST', body: formData });
    return res.json();
  },
  cancelPending: async (): Promise<any> => {
    const res = await fetch('/api/queue/cancel_pending', { method: 'POST' });
    return res.json();
  },
  exportSample: async (filename: string, projectId?: string): Promise<{ url: string; status?: string; message?: string }> => {
    const url = `/api/chapter/${encodeURIComponent(filename)}/export-sample${projectId ? `?project_id=${projectId}` : ''}`;
    const res = await fetch(url, { method: 'POST' });
    return res.json();
  },

  // --- Processing Queue ---
  getProcessingQueue: async (): Promise<any[]> => {
    const res = await fetch('/api/processing_queue');
    return res.json();
  },
  addProcessingQueue: async (projectId: string, chapterId: string, splitPart: number = 0, speakerProfile?: string): Promise<any> => {
    const formData = new FormData();
    formData.append('project_id', projectId);
    formData.append('chapter_id', chapterId);
    formData.append('split_part', splitPart.toString());
    if (speakerProfile) formData.append('speaker_profile', speakerProfile);
    const res = await fetch('/api/processing_queue', { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
  fetchAudiobooks: async (): Promise<any> => {
    const res = await fetch('/api/audiobooks');
    return res.json();
  },
  fetchProjectAudiobooks: async (projectId: string): Promise<any> => {
    const res = await fetch(`/api/projects/${projectId}/audiobooks`);
    return res.json();
  },
  reorderProcessingQueue: async (queueIds: string[]): Promise<any> => {
    const res = await fetch('/api/processing_queue/reorder', { 
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_ids: queueIds }) 
    });
    return res.json();
  },
  removeProcessingQueue: async (queueId: string): Promise<any> => {
    const res = await fetch(`/api/processing_queue/${encodeURIComponent(queueId)}`, { method: 'DELETE' });
    return res.json();
  },
  clearProcessingQueue: async (): Promise<any> => {
    const res = await fetch('/api/processing_queue', { method: 'DELETE' });
    return res.json();
  },
  clearCompletedJobs: async (): Promise<any> => {
    const res = await fetch('/api/processing_queue/clear_completed', { method: 'POST' });
    return res.json();
  },
  toggleQueuePause: async (paused: boolean): Promise<any> => {
    const endpoint = paused ? '/queue/pause' : '/queue/resume';
    const res = await fetch(endpoint, { method: 'POST' });
    return res.json();
  },

  // --- Engines ---
  fetchEngines: async (): Promise<any[]> => {
    const res = await fetch('/api/engines');
    return parseApiResponse(res);
  },
  updateEngineSettings: async (engineId: string, settings: Record<string, any>): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
    return parseApiResponse(res);
  },
  refreshPlugins: async (): Promise<any> => {
    const res = await fetch('/api/engines/refresh', { method: 'POST' });
    return parseApiResponse(res);
  },
};
