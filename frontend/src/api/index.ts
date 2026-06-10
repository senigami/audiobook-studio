import type { Project, Chapter, ScriptViewResponse, ScriptAssignmentsUpdate } from '@/types';
import { DEFAULT_VOICE_SENTINEL } from '@/constants/api';

const parseApiResponse = async (res: Response) => {
  const data = await res.json();
  if (!res.ok || data?.status === 'error') {
    const error = new Error(data?.message || data?.detail || 'Request failed') as Error & { status?: number };
    error.status = res.status;
    throw error;
  }
  return data;
};

export const api = {
  fetchHome: async (): Promise<any> => {
    const res = await fetch('/api/home');
    return parseApiResponse(res);
  },
  resetRenderStats: async (): Promise<any> => {
    const res = await fetch('/api/system/render-stats/reset', { method: 'POST' });
    return parseApiResponse(res);
  },
  restartTtsServer: async (): Promise<any> => {
    const res = await fetch('/api/system/tts-server/restart', { method: 'POST' });
    return parseApiResponse(res);
  },
  // --- Projects ---
  fetchProjects: async (): Promise<Project[]> => {
    const res = await fetch('/api/projects');
    return parseApiResponse(res);
  },
  fetchProject: async (id: string): Promise<Project> => {
    const res = await fetch(`/api/projects/${id}`);
    return parseApiResponse(res);
  },
  createProject: async (data: { name: string; series?: string; author?: string; speaker_profile_name?: string | null; cover?: File }): Promise<{ status: string; project_id: string }> => {
    const formData = new FormData();
    formData.append('name', data.name);
    if (data.series) formData.append('series', data.series);
    if (data.author) formData.append('author', data.author);
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || DEFAULT_VOICE_SENTINEL);
    if (data.cover) formData.append('cover', data.cover);
    const res = await fetch('/api/projects', { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
  updateProject: async (id: string, data: { name?: string; series?: string; author?: string; speaker_profile_name?: string | null; cover?: File }): Promise<any> => {
    const formData = new FormData();
    if (data.name) formData.append('name', data.name);
    if (data.series) formData.append('series', data.series);
    if (data.author) formData.append('author', data.author);
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || DEFAULT_VOICE_SENTINEL);
    if (data.cover) formData.append('cover', data.cover);
    const res = await fetch(`/api/projects/${id}`, { method: 'PUT', body: formData });
    return parseApiResponse(res);
  },
  deleteProject: async (projectId: string): Promise<any> => {
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    return parseApiResponse(res);
  },
  assembleProject: async (projectId: string, chapterIds?: string[]): Promise<any> => {
    const formData = new FormData();
    if (chapterIds) {
        formData.append('chapter_ids', JSON.stringify(chapterIds));
    }
    const res = await fetch(`/api/projects/${projectId}/assemble`, { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
  // --- Backups ---
  fetchProjectBackups: async (projectId: string): Promise<import('@/types').StoredBackup[]> => {
    const res = await fetch(`/api/projects/${projectId}/backups`);
    return parseApiResponse(res);
  },
  saveProjectBackup: async (projectId: string, comment?: string, includeAudio: boolean = true): Promise<any> => {
    const params = new URLSearchParams();
    if (comment) params.append('comment', comment);
    params.append('include_audio', includeAudio.toString());
    const url = `/api/projects/${projectId}/backup-bundle/save?${params.toString()}`;
    const res = await fetch(url, { method: 'POST' });
    return parseApiResponse(res);
  },
  deleteProjectBackup: async (projectId: string, filename: string): Promise<any> => {
    const res = await fetch(`/api/projects/${projectId}/backups/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    return parseApiResponse(res);
  },
  updateProjectBackupMetadata: async (projectId: string, filename: string, comment: string): Promise<any> => {
    const res = await fetch(`/api/projects/${projectId}/backups/${encodeURIComponent(filename)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comment })
    });
    return parseApiResponse(res);
  },

  // --- Characters ---
  fetchCharacters: async (projectId: string): Promise<import('@/types').Character[]> => {
    const res = await fetch(`/api/projects/${projectId}/characters`);
    const data = await parseApiResponse(res);
    return data.characters || [];
  },
  createCharacter: async (projectId: string, name: string, speaker_profile_name?: string, default_emotion?: string, color?: string): Promise<{status: string, character_id: string}> => {
    const formData = new FormData();
    formData.append('name', name);
    if (speaker_profile_name) formData.append('speaker_profile_name', speaker_profile_name);
    if (default_emotion) formData.append('default_emotion', default_emotion);
    if (color) formData.append('color', color);
    const res = await fetch(`/api/projects/${projectId}/characters`, { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
  updateCharacter: async (characterId: string, name?: string, speaker_profile_name?: string, default_emotion?: string, color?: string): Promise<{status: string}> => {
    const formData = new FormData();
    if (name) formData.append('name', name);
    // Allowing empty strings to clear the profile
    if (speaker_profile_name !== undefined) formData.append('speaker_profile_name', speaker_profile_name);
    if (default_emotion !== undefined) formData.append('default_emotion', default_emotion);
    if (color !== undefined) formData.append('color', color);
    const res = await fetch(`/api/characters/${characterId}`, { method: 'PUT', body: formData });
    return parseApiResponse(res);
  },
  deleteCharacter: async (characterId: string): Promise<{status: string}> => {
    const res = await fetch(`/api/characters/${characterId}`, { method: 'DELETE' });
    return parseApiResponse(res);
  },

  // --- Chapters ---
  fetchChapters: async (projectId: string): Promise<Chapter[]> => {
    const res = await fetch(`/api/projects/${projectId}/chapters`);
    return parseApiResponse(res);
  },
  fetchChapter: async (chapterId: string): Promise<Chapter> => {
    const res = await fetch(`/api/chapters/${chapterId}`);
    return parseApiResponse(res);
  },
  createChapter: async (projectId: string, data: { title: string; text_content?: string; sort_order?: number; file?: File }): Promise<{status: string, chapter: Chapter}> => {
    const formData = new FormData();
    formData.append('title', data.title);
    if (data.text_content) formData.append('text_content', data.text_content);
    formData.append('sort_order', (data.sort_order || 0).toString());
    if (data.file) formData.append('file', data.file);
    const res = await fetch(`/api/projects/${projectId}/chapters`, { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
  updateChapter: async (chapterId: string, data: { title?: string; text_content?: string; speaker_profile_name?: string | null }): Promise<{status: string, chapter: Chapter}> => {
    const formData = new FormData();
    if (data.title) formData.append('title', data.title);
    if (data.text_content !== undefined) formData.append('text_content', data.text_content ?? '');
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || DEFAULT_VOICE_SENTINEL);
    const res = await fetch(`/api/chapters/${chapterId}`, { method: 'PUT', body: formData });
    return parseApiResponse(res);
  },
  deleteChapter: async (chapterId: string): Promise<{ status: string }> => {
    const res = await fetch(`/api/chapters/${chapterId}`, { method: 'DELETE' });
    return parseApiResponse(res);
  },
  reorderChapters: async (projectId: string, chapterIds: string[]): Promise<{ status: string }> => {
    const formData = new FormData();
    formData.append('chapter_ids', JSON.stringify(chapterIds));
    const res = await fetch(`/api/projects/${projectId}/reorder_chapters`, { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
  analyzeChapter: async (chapterId: string): Promise<any> => {
    const res = await fetch(`/api/chapters/${chapterId}/analyze`);
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
  fetchSegments: async (chapterId: string): Promise<import('@/types').ChapterSegment[]> => {
    const res = await fetch(`/api/chapters/${chapterId}/segments`);
    const data = await parseApiResponse(res);
    return data.segments || [];
  },
  updateSegment: async (segmentId: string, data: { character_id?: string | null; speaker_profile_name?: string | null; audio_status?: string }): Promise<any> => {
    const formData = new FormData();
    if (data.character_id !== undefined) formData.append('character_id', data.character_id || "");
    if (data.speaker_profile_name !== undefined) formData.append('speaker_profile_name', data.speaker_profile_name || "");
    if (data.audio_status) formData.append('audio_status', data.audio_status);
    const res = await fetch(`/api/segments/${segmentId}`, { method: 'PUT', body: formData });
    return parseApiResponse(res);
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
    return parseApiResponse(res);
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
    return parseApiResponse(res);
  },

  deleteAudiobook: async (filename: string, projectId?: string): Promise<any> => {
    const res = await fetch(`/api/audiobook/${encodeURIComponent(filename)}${projectId ? `?project_id=${projectId}` : ''}`, { method: 'DELETE' });
    return parseApiResponse(res);
  },
  resetChapter: async (chapterId: string): Promise<any> => {
    const res = await fetch(`/api/chapters/${chapterId}/reset`, { method: 'POST' });
    return parseApiResponse(res);
  },
  exportSample: async (chapterId: string, projectId?: string): Promise<{ url: string; status?: string; message?: string }> => {
    const url = `/api/chapters/${chapterId}/export-sample${projectId ? `?project_id=${projectId}` : ''}`;
    const res = await fetch(url, { method: 'POST' });
    return parseApiResponse(res);
  },

  // --- Processing Queue ---
  getProcessingQueue: async (): Promise<any[]> => {
    const res = await fetch('/api/processing_queue');
    return parseApiResponse(res);
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
    return parseApiResponse(res);
  },
  fetchProjectAudiobooks: async (projectId: string): Promise<any> => {
    const res = await fetch(`/api/projects/${projectId}/audiobooks`);
    return parseApiResponse(res);
  },
  reorderProcessingQueue: async (queueIds: string[]): Promise<any> => {
    const res = await fetch('/api/processing_queue/reorder', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queue_ids: queueIds })
    });
    return parseApiResponse(res);
  },
  removeProcessingQueue: async (queueId: string): Promise<any> => {
    const res = await fetch(`/api/processing_queue/${encodeURIComponent(queueId)}`, { method: 'DELETE' });
    return parseApiResponse(res);
  },
  clearProcessingQueue: async (): Promise<any> => {
    const res = await fetch('/api/processing_queue', { method: 'DELETE' });
    return parseApiResponse(res);
  },
  clearCompletedJobs: async (): Promise<any> => {
    const res = await fetch('/api/processing_queue/clear_completed', { method: 'POST' });
    return parseApiResponse(res);
  },
  toggleQueuePause: async (paused: boolean): Promise<any> => {
    const endpoint = paused ? '/api/generation/pause' : '/api/generation/resume';
    const res = await fetch(endpoint, { method: 'POST' });
    return parseApiResponse(res);
  },

  updateAudiobookMetadata: async (projectId: string, filename: string, description: string): Promise<any> => {
    const res = await fetch(`/api/projects/${projectId}/audiobooks/${encodeURIComponent(filename)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    return parseApiResponse(res);
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
  clearEngineSetting: async (engineId: string, settingKey: string): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}/settings/${encodeURIComponent(settingKey)}`, {
      method: 'DELETE',
    });
    return parseApiResponse(res);
  },
  refreshPlugins: async (): Promise<any> => {
    const res = await fetch('/api/engines/refresh', { method: 'POST' });
    return parseApiResponse(res);
  },
  verifyEngine: async (engineId: string): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}/verify`, { method: 'POST' });
    return parseApiResponse(res);
  },
  installEngineDependencies: async (engineId: string): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}/install`, { method: 'POST' });
    return parseApiResponse(res);
  },
  removeEnginePlugin: async (engineId: string): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}`, { method: 'DELETE' });
    return parseApiResponse(res);
  },
  fetchEngineLogs: async (engineId: string): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}/logs`);
    return parseApiResponse(res);
  },
  fetchEngineScenarios: async (engineId: string): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}/dev/scenarios`);
    return parseApiResponse(res);
  },
  testEngine: async (engineId: string): Promise<any> => {
    const res = await fetch(`/api/engines/${encodeURIComponent(engineId)}/test`, { method: 'POST' });
    return parseApiResponse(res);
  },
  resetEngineCalibration: async (engineId: string, model?: string): Promise<any> => {
    const params = new URLSearchParams();
    if (model) params.append('model', model);
    const url = `/api/engines/${encodeURIComponent(engineId)}/calibrate/reset?${params.toString()}`;
    const res = await fetch(url, { method: 'POST' });
    return parseApiResponse(res);
  },

  importEnginePlugin: async (file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/engines/import', {
      method: 'POST',
      body: formData,
    });
    return parseApiResponse(res);
  },
  installPlugin: async (): Promise<any> => {
    const res = await fetch('/api/engines/install', { method: 'POST' });
    return parseApiResponse(res);
  },

  exportVoiceBundleUrl: (voiceName: string, includeSourceWavs: boolean = false): string => {
    const params = new URLSearchParams({ include_source_wavs: String(includeSourceWavs) });
    return `/api/voices/${encodeURIComponent(voiceName)}/bundle/download?${params.toString()}`;
  },

  importVoiceBundle: async (file: File): Promise<{ status: string; voice_name: string; original_voice_name: string; was_renamed: boolean; variants: string[] }> => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/voices/bundle/import', { method: 'POST', body: formData });
    return parseApiResponse(res);
  },
};
