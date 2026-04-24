import { useState, useRef } from 'react';
import { api } from '../api';
import type { Chapter } from '../types';

export function useProjectActions(
  projectId: string,
  onDataRefresh: () => Promise<void>,
  navigate: (path: string) => void,
  onOpenQueue?: () => void
) {
  const [submitting, setSubmitting] = useState(false);
  const reorderTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCreateChapter = async (title: string, text: string, file: File | null, sortOrder: number) => {
    setSubmitting(true);
    try {
      await api.createChapter(projectId, {
        title,
        text_content: text,
        sort_order: sortOrder,
        file: file || undefined
      });
      await onDataRefresh();
      return true;
    } catch (e) {
      console.error("Failed to create chapter", e);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateProject = async (data: { name: string; series: string; author: string; cover?: File | null }) => {
    setSubmitting(true);
    try {
      await api.updateProject(projectId, {
        name: data.name,
        series: data.series,
        author: data.author,
        cover: data.cover || undefined
      });
      await onDataRefresh();
      return true;
    } catch (e) {
      console.error("Failed to update project", e);
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteChapter = async (chapterId: string) => {
    try {
      await api.deleteChapter(chapterId);
      await onDataRefresh();
      return true;
    } catch (e) {
      console.error("Delete failed", e);
      return false;
    }
  };

  const handleReorderChapters = async (reorderedChapters: Chapter[]) => {
    if (reorderTimeoutRef.current) {
        clearTimeout(reorderTimeoutRef.current);
    }
    
    reorderTimeoutRef.current = setTimeout(async () => {
        try {
            await api.reorderChapters(projectId, reorderedChapters.map(c => c.id));
        } catch (e) {
            console.error("Failed to save chapter order", e);
            await onDataRefresh(); 
        }
    }, 500);
  };

  const handleQueueChapter = async (chapterId: string, selectedVoice?: string) => {
    try {
        await api.addProcessingQueue(projectId, chapterId, 0, selectedVoice || undefined);
        await onDataRefresh();
        return true;
    } catch (e) {
        console.error("Failed to enqueue", e);
        return false;
    }
  };

  const handleResetChapterAudio = async (chapterId: string) => {
    try {
      await api.resetChapter(chapterId);
      await onDataRefresh();
      return true;
    } catch (e) {
      console.error("Reset failed", e);
      return false;
    }
  };

  const handleQueueAllUnprocessed = async (chapters: Chapter[], jobs: any, selectedVoice?: string) => {
    const liveQueuedChapterIds = new Set(
        Object.values(jobs)
            .filter((j: any) => j.engine !== 'audiobook' && (j.status === 'queued' || j.status === 'running'))
            .map((j: any) => {
                const stem = j.chapter_file.replace('.txt', '');
                const parts = stem.split('_'); 
                if (parts.length > 1 && !isNaN(Number(parts[parts.length - 1]))) {
                    parts.pop(); 
                }
                return parts.join('_');
            })
    );

    const unprocessed = chapters.filter(c => 
        (c.audio_status === 'unprocessed' || c.audio_status === 'error') && 
        !liveQueuedChapterIds.has(c.id)
    );

    if (unprocessed.length === 0) return { success: false, message: "All chapters are already processed or queued." };

    setSubmitting(true);
    try {
        for (const chap of unprocessed) {
            await api.addProcessingQueue(projectId, chap.id, 0, selectedVoice || undefined);
        }
        await onDataRefresh();
        if (onOpenQueue) {
            onOpenQueue();
        } else {
            navigate('/queue');
        }
        return { success: true };
    } catch (e) {
        console.error("Failed to enqueue all", e);
        return { success: false, message: "Some chapters failed to queue." };
    } finally {
        setSubmitting(false);
    }
  };

  const handleAssembleProject = async (chapterIds: string[]) => {
    setSubmitting(true);
    try {
        await api.assembleProject(projectId, chapterIds);
        await onDataRefresh();
        return true;
    } catch (e) {
        console.error("Assembly failed", e);
        return false;
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAudiobook = async (filename: string) => {
    try {
      await api.deleteAudiobook(filename, projectId);
      await onDataRefresh();
      return true;
    } catch (e) {
      console.error("Delete failed", e);
      return false;
    }
  };

  return {
    submitting,
    handleCreateChapter,
    handleUpdateProject,
    handleDeleteChapter,
    handleReorderChapters,
    handleQueueChapter,
    handleResetChapterAudio,
    handleQueueAllUnprocessed,
    handleAssembleProject,
    handleDeleteAudiobook
  };
}
