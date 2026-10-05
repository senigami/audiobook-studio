import { describe, it, expect } from 'vitest';
import { capHint, capWarning, PARALLEL_CAP_COPY } from '@/utils/parallelCapCopy';

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

  it('shows nothing when the comfortable number reaches the control ceiling', () => {
    expect(capHint({ safeMax: 8, hardMax: 8, ceiling: 8, memoryMeasurable: true })).toBeNull();
    expect(capHint({ safeMax: 9, hardMax: 9, ceiling: 8, memoryMeasurable: true })).toBeNull();
  });

  it('names both numbers when one at a time is comfortable but more is allowed', () => {
    expect(capHint({ safeMax: 1, hardMax: 2, ceiling: 8, memoryMeasurable: true })).toBe(
      'This computer can comfortably render one at a time right now, and can go as high as 2. Closing other apps may allow more.'
    );
  });

  it('names both numbers when the comfortable number is 2 or more', () => {
    expect(capHint({ safeMax: 2, hardMax: 4, ceiling: 8, memoryMeasurable: true })).toBe(
      'This computer can comfortably render 2 at once right now, and can go as high as 4.'
    );
  });

  it('says one at a time when nothing is allowed above 1', () => {
    expect(capHint({ safeMax: 1, hardMax: 1, ceiling: 8, memoryMeasurable: true })).toBe(
      'This computer can render one at a time right now. Closing other apps may allow more.'
    );
  });

  it('says up to the limit when the comfortable and hard numbers match', () => {
    expect(capHint({ safeMax: 3, hardMax: 3, ceiling: 8, memoryMeasurable: true })).toBe(
      'This computer can render up to 3 at once right now.'
    );
  });
});

describe('capWarning', () => {
  const warning = 'Above 1, Studio uses memory it normally keeps free, so your computer may feel slow while rendering.';

  it('warns when the value is above the comfortable number', () => {
    expect(capWarning({ value: 2, safeMax: 1, memoryMeasurable: true })).toBe(warning);
  });

  it('is quiet at or below the comfortable number', () => {
    expect(capWarning({ value: 1, safeMax: 1, memoryMeasurable: true })).toBeNull();
  });

  it('is quiet when memory could not be measured or the limit is unknown', () => {
    expect(capWarning({ value: 2, safeMax: 1, memoryMeasurable: false })).toBeNull();
    expect(capWarning({ value: 2, safeMax: null, memoryMeasurable: true })).toBeNull();
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
      PARALLEL_CAP_COPY.hintComfortable(2, 4),
      PARALLEL_CAP_COPY.hintOneComfortable(2),
      PARALLEL_CAP_COPY.hintOne,
      PARALLEL_CAP_COPY.hintUpTo(3),
      PARALLEL_CAP_COPY.overComfortableWarning(1),
      PARALLEL_CAP_COPY.hintUnmeasurable,
      PARALLEL_CAP_COPY.engineCardDescription(4),
      PARALLEL_CAP_COPY.genericSaveError,
    ].join(' ');
    expect(all).not.toContain('—');
  });
});
