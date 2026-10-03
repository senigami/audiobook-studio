export const PARALLEL_CAP_COPY = {
  hintSafe: (n: number): string => `Studio estimates this computer can render up to ${n} at once right now.`,
  hintOne: 'Studio estimates this computer can render one at a time right now. Closing other apps may allow more.',
  hintUnmeasurable: 'Studio could not check how much memory is free, so it will render one at a time for now.',
  engineCardDescription: (limit: number): string =>
    `How many segments this engine may render at once, up to ${limit}. Changes apply right away, no restart needed.`,
  genericSaveError: 'Settings update failed. Please try again.',
} as const;

/** Which hint line to show, or null for none (limit unknown, or nothing is being limited). */
export const capHint = (args: {
  safeMax: number | null | undefined;
  ceiling: number;
  memoryMeasurable: boolean;
}): string | null => {
  const { safeMax, ceiling, memoryMeasurable } = args;
  if (safeMax == null) return null;
  if (!memoryMeasurable) return PARALLEL_CAP_COPY.hintUnmeasurable;
  if (safeMax >= ceiling) return null;
  return safeMax <= 1 ? PARALLEL_CAP_COPY.hintOne : PARALLEL_CAP_COPY.hintSafe(safeMax);
};
