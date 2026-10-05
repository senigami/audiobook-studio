/**
 * Pure balanced-split logic for Revise mode's "segment overflow" case.
 *
 * design-docs/workflows/chapter-editor-modes.md §7:
 * > if an edit causes the segment text to exceed the engine's character
 * > buffer, split at the nearest sentence boundary (`.`/`?`/`!`/`;`) to the
 * > midpoint; both halves must be above an ~80-100 char floor; if no clean
 * > boundary exists near the midpoint and a half would fall below the
 * > floor, do not split — let the segment run long instead.
 *
 * No React, no I/O — a plain function so it's trivially unit-testable in
 * isolation (see design-docs/plans/active/directors_console_activation/tasks/005-revise-tool.md).
 * The "passive (non-blocking) indicator" the design doc calls for when a
 * segment runs long is a `ReviseToolBody`/UI-level concern, not this
 * function's job — this function only decides whether/where to split.
 */

const SENTENCE_BOUNDARY_CHARS = ['.', '?', '!', ';'];
export const DEFAULT_MIN_FLOOR = 80;

export interface SegmentSplitResult {
  segments: string[];
}

/**
 * Splits `text` into a balanced two-part segment pair if it exceeds
 * `maxChars`, using the sentence boundary nearest the string's midpoint —
 * as long as both resulting halves are at least `minFloor` characters
 * (after trimming). Returns the original text as a single-element array,
 * unchanged, whenever no split is needed or no valid split point exists.
 */
export function splitSegmentText(
  text: string,
  maxChars: number,
  minFloor: number = DEFAULT_MIN_FLOOR,
): { segments: string[] } | { segments: [string] } {
  if (text.length <= maxChars) {
    return { segments: [text] };
  }

  const midpoint = text.length / 2;

  // Candidate split points: the index immediately after a sentence-boundary
  // character (so `text.slice(0, idx)` includes the punctuation and
  // `text.slice(idx)` starts the next sentence).
  let bestSplitIndex: number | null = null;
  let bestDistance = Infinity;

  for (let i = 0; i < text.length; i++) {
    if (!SENTENCE_BOUNDARY_CHARS.includes(text[i])) continue;

    const splitIndex = i + 1;
    const first = text.slice(0, splitIndex).trim();
    const second = text.slice(splitIndex).trim();
    if (first.length < minFloor || second.length < minFloor) continue;

    const distance = Math.abs(splitIndex - midpoint);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestSplitIndex = splitIndex;
    }
  }

  if (bestSplitIndex === null) {
    // No sentence boundary keeps both halves above the floor — don't split;
    // let the segment run long (UI shows a passive, non-blocking indicator).
    return { segments: [text] };
  }

  const first = text.slice(0, bestSplitIndex).trim();
  const second = text.slice(bestSplitIndex).trim();
  return { segments: [first, second] };
}
