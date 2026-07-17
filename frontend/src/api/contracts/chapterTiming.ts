// Contract for the `chapter_segment_timing` sidecar (synced-reader plan,
// backend Tasks 2-5: app/domain/chapters/timing.py `ChapterGroupTiming` +
// `validate_timing_sidecar`, served at
// GET /api/projects/{project_id}/chapters/{chapter_id}/timing
// (app/api/routers/chapters_assets.py `api_get_chapter_timing`)).
//
// One entry per rendered chunk group (not per raw chapter_segments row) --
// see design-docs/plans/active/synced_reader/01-timing-contract.md. The
// route already validates schema/version/tiling/staleness server-side and
// 404s on any mismatch, so this file only needs to describe the accepted
// shape for typed consumption on this side, mirroring peaksSidecar.ts's
// validate-before-trust pattern.

export const CHAPTER_TIMING_SCHEMA = 'chapter_segment_timing';
export const CURRENT_CHAPTER_TIMING_VERSION = 1;

export interface ChapterTimingGroup {
  group_id: string;
  segment_ids: string[];
  order: number;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
}

export interface ChapterTimingPayload {
  schema: string;
  version: typeof CURRENT_CHAPTER_TIMING_VERSION;
  chapter_id: string;
  audio_file: string;
  audio_generated_at: number;
  audio_duration_ms: number;
  generated_at: number;
  group_count: number;
  groups: ChapterTimingGroup[];
}

/**
 * Validates an untrusted JSON payload against the `chapter_segment_timing`
 * shape. Returns null (rather than throwing) on any shape/schema/version
 * mismatch, so callers can treat it the same as a 404 ("no usable timing").
 * The serving route already validates tiling/staleness server-side; this is
 * a shallow shape check on the frontend's side of that trust boundary, not a
 * re-implementation of the backend's full validator.
 */
export function parseChapterTimingPayload(json: unknown): ChapterTimingPayload | null {
  if (typeof json !== 'object' || json === null) return null;
  const obj = json as Record<string, unknown>;
  if (obj.schema !== CHAPTER_TIMING_SCHEMA || obj.version !== CURRENT_CHAPTER_TIMING_VERSION) {
    return null;
  }
  if (!Array.isArray(obj.groups)) return null;
  const groupsValid = obj.groups.every(
    g =>
      typeof g === 'object' &&
      g !== null &&
      typeof (g as Record<string, unknown>).group_id === 'string' &&
      Array.isArray((g as Record<string, unknown>).segment_ids) &&
      typeof (g as Record<string, unknown>).order === 'number' &&
      typeof (g as Record<string, unknown>).start_ms === 'number' &&
      typeof (g as Record<string, unknown>).end_ms === 'number' &&
      typeof (g as Record<string, unknown>).duration_ms === 'number',
  );
  if (!groupsValid) return null;
  return obj as unknown as ChapterTimingPayload;
}
