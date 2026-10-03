import { describe, it, expect } from 'vitest';
import { capHint, PARALLEL_CAP_COPY } from '@/utils/parallelCapCopy';

describe('capHint', () => {
  it('shows nothing before the first answer', () => {
    expect(capHint({ safeMax: null, ceiling: 8, memoryMeasurable: true })).toBeNull();
    expect(capHint({ safeMax: undefined, ceiling: 8, memoryMeasurable: true })).toBeNull();
  });

  it('says memory could not be checked when it is not measurable', () => {
    expect(capHint({ safeMax: 1, ceiling: 8, memoryMeasurable: false })).toBe(
      "Studio could not check how much memory is free, so for now the number can't be raised above 1. The number you already saved still applies."
    );
  });

  it('shows nothing when the safe maximum reaches the control ceiling', () => {
    expect(capHint({ safeMax: 8, ceiling: 8, memoryMeasurable: true })).toBeNull();
    expect(capHint({ safeMax: 9, ceiling: 8, memoryMeasurable: true })).toBeNull();
  });

  it('says one at a time when the safe maximum is 1', () => {
    expect(capHint({ safeMax: 1, ceiling: 8, memoryMeasurable: true })).toBe(
      'Studio estimates this computer can render one at a time right now. Closing other apps may allow more.'
    );
  });

  it('names the safe maximum when it is between 2 and the ceiling', () => {
    expect(capHint({ safeMax: 3, ceiling: 8, memoryMeasurable: true })).toBe(
      'Studio estimates this computer can render up to 3 at once right now.'
    );
  });
});

describe('PARALLEL_CAP_COPY', () => {
  it('fills the engine card limit', () => {
    expect(PARALLEL_CAP_COPY.engineCardDescription(4)).toBe(
      'How many segments this engine may render at once, up to 4. Changes apply right away, no restart needed.'
    );
  });

  it('uses one generic save error string', () => {
    expect(PARALLEL_CAP_COPY.genericSaveError).toBe('Settings update failed. Please try again.');
  });

  it('contains no em dashes', () => {
    const all = [
      PARALLEL_CAP_COPY.hintSafe(3),
      PARALLEL_CAP_COPY.hintOne,
      PARALLEL_CAP_COPY.hintUnmeasurable,
      PARALLEL_CAP_COPY.engineCardDescription(4),
      PARALLEL_CAP_COPY.genericSaveError,
    ].join(' ');
    expect(all).not.toContain('—');
  });
});
