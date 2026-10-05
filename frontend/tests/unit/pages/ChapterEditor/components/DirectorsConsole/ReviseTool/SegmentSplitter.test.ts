import { describe, it, expect } from 'vitest';
import { splitSegmentText } from '@/pages/ChapterEditor/components/DirectorsConsole/ReviseTool/SegmentSplitter';

describe('splitSegmentText', () => {
  it('does not split text at or under the character limit', () => {
    const text = 'A short segment that easily fits within the limit.';
    const result = splitSegmentText(text, 500);

    expect(result.segments).toEqual([text]);
  });

  it('splits at the nearest clean sentence boundary to the midpoint when over the limit', () => {
    const first = 'Repeat this clause to pad it out nicely so it clears the floor comfortably.';
    const second = 'Then this second clause also needs enough characters to clear the floor too.';
    const text = `${first} ${second}`;

    // Sanity: this text is over the limit we're testing against.
    expect(text.length).toBeGreaterThan(100);

    const result = splitSegmentText(text, 100, 40);

    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toBe(first);
    expect(result.segments[1]).toBe(second);
    // Splitting lost no text (aside from the single joining space, trimmed
    // off both sides) — proves this is a boundary-aware split, not lossy.
    expect(result.segments.join(' ')).toBe(text);

    // Revert-check against a naive "always split at the character limit"
    // implementation: that would cut mid-word ("...second clause " / "also
    // needs...") rather than at the sentence boundary. Assert the actual
    // split point is NOT the naive character-limit cut, proving the
    // balanced-split (sentence-boundary) logic is what produced this result.
    const naiveFirst = text.slice(0, 100);
    const naiveSecond = text.slice(100);
    expect(result.segments[0]).not.toBe(naiveFirst);
    expect(result.segments[1]).not.toBe(naiveSecond);
  });

  it('does not split when no clean sentence boundary near the midpoint keeps both halves above the floor', () => {
    // A period exists, but it sits far from the midpoint — splitting there
    // would leave the first half well under the floor. No other boundary
    // exists in the text at all, so no valid split point exists.
    const text = `${'X'.repeat(40)}. ${'Y'.repeat(160)}`;

    expect(text.length).toBeGreaterThan(100);

    const result = splitSegmentText(text, 100, 80);

    // Unsplit: returns the original text, unchanged, as the sole element.
    expect(result.segments).toEqual([text]);
  });

  it('uses the default floor of 80 chars when none is provided', () => {
    const text = `${'X'.repeat(40)}. ${'Y'.repeat(160)}`;
    const result = splitSegmentText(text, 100);

    expect(result.segments).toEqual([text]);
  });
});
