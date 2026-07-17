import type { PlayerBusState } from '@/store/playerBus';
import type { ChapterTimingGroup } from '@/api/contracts/chapterTiming';
import type { UseChapterTimingResult } from './useChapterTiming';

export interface ReaderSyncResult {
  activeGroup: ChapterTimingGroup | null;
  groupProgress: number;
  prev: ChapterTimingGroup | null;
  next: ChapterTimingGroup | null;
  isTrackingThisChapter: boolean;
}

const NOT_TRACKING: ReaderSyncResult = {
  activeGroup: null,
  groupProgress: 0,
  prev: null,
  next: null,
  isTrackingThisChapter: false,
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Finds the index of the group whose window contains `positionMs`, via
 * binary search over `groups` (sorted by `order`, tiling gaplessly — trusted
 * per the backend contract, not re-validated here).
 *
 * Boundary rule: at an exact `positionMs === groups[i].end_ms ===
 * groups[i+1].start_ms` handoff, the START of the next group wins (i.e. this
 * returns i+1, not i) — deterministic and matches "the next line has begun"
 * rather than "the previous line hasn't quite ended".
 *
 * Out-of-range positions clamp to the first/last group rather than falling
 * through to no match (covers seeking to exactly 0, and audio playing a
 * fraction past the last group's end_ms due to float/rounding).
 */
function findActiveGroupIndex(groups: ChapterTimingGroup[], positionMs: number): number {
  if (positionMs <= groups[0].start_ms) return 0;
  if (positionMs >= groups[groups.length - 1].end_ms) return groups.length - 1;

  let lo = 0;
  let hi = groups.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (groups[mid].end_ms <= positionMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

/**
 * Derives the active reading position from the player bus, gated to this
 * chapter's own playback (synced-reader plan, `03-reader-frontend.md` "Sync
 * engine" + `01-findings.md` §5).
 *
 * Gate first: if the bus isn't scoped to `'chapter'` and playing THIS
 * chapter's audio URL, this returns the all-null/not-tracking shape
 * immediately — the reader must never react to unrelated playback
 * elsewhere in the app (Booth, previews, book-level continuous playback all
 * share this same global bus).
 *
 * When the gate matches but `timing` is `null` (no sidecar available), this
 * still reports `isTrackingThisChapter: true` with a null `activeGroup`, so
 * callers can distinguish "not tracking this chapter" from "tracking, but no
 * timing data exists" (the reader UI needs different empty states for each).
 */
export function useReaderSync(
  timing: UseChapterTimingResult | null,
  playerBus: PlayerBusState,
  chapterAudioUrl: string,
): ReaderSyncResult {
  const isTrackingThisChapter = playerBus.scope === 'chapter' && playerBus.audioUrl === chapterAudioUrl;

  if (!isTrackingThisChapter) {
    return NOT_TRACKING;
  }

  if (!timing || timing.groups.length === 0) {
    return { activeGroup: null, groupProgress: 0, prev: null, next: null, isTrackingThisChapter: true };
  }

  const positionMs = playerBus.position * 1000;
  const idx = findActiveGroupIndex(timing.groups, positionMs);
  const activeGroup = timing.groups[idx];
  const groupProgress = clamp01((positionMs - activeGroup.start_ms) / activeGroup.duration_ms);
  const prev = idx > 0 ? timing.groups[idx - 1] : null;
  const next = idx < timing.groups.length - 1 ? timing.groups[idx + 1] : null;

  return { activeGroup, groupProgress, prev, next, isTrackingThisChapter: true };
}
