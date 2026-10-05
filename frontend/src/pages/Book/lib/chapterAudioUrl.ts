import type { Chapter } from '@/types';

/**
 * Builds the chapter audio asset URL — the single shared expression for
 * "this chapter's own rendered audio", used by both `ChapterTable.tsx`'s
 * play button (`loadAndPlay({ scope: 'chapter', audioUrl, ... })`) and the
 * synced-reader wiring (`useReaderSync`'s `chapterAudioUrl` gate).
 *
 * Extracted to a shared function (synced-reader plan, Task 9) rather than
 * two independent inline expressions: `useReaderSync` gates on an exact
 * string match against `playerBus.audioUrl`, so a copy that drifts even
 * slightly (encoding, path shape) would silently break the reader's sync
 * gate. Sharing one function makes that drift impossible rather than just
 * tested-against.
 *
 * Returns `null` when the chapter has no rendered audio yet, matching
 * `ChapterTable.tsx`'s existing `audioPath ? ... : null` behavior.
 */
export function buildChapterAudioUrl(
  chapter: Pick<Chapter, 'project_id' | 'id' | 'audio_file_path'>,
): string | null {
  const audioPath = chapter.audio_file_path;
  if (!audioPath) return null;
  return `/api/projects/${chapter.project_id}/chapters/${chapter.id}/assets/audio?filename=${encodeURIComponent(audioPath)}`;
}
