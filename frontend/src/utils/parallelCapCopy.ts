export const PARALLEL_CAP_COPY = {
  hintComfortable: (n: number, m: number): string =>
    `This computer can comfortably render ${n} at once right now, and can go as high as ${m}.`,
  hintOneComfortable: (m: number): string =>
    `This computer can comfortably render one at a time right now, and can go as high as ${m}. Closing other apps may allow more.`,
  hintOne: 'This computer can render one at a time right now. Closing other apps may allow more.',
  hintUpTo: (m: number): string => `This computer can render up to ${m} at once right now.`,
  overComfortableWarning: (n: number): string =>
    `Above ${n}, Studio uses memory it normally keeps free, so your computer may feel slow while rendering.`,
  hintUnmeasurable: "Studio could not check how much memory is free, so for now the number can't be raised above 1. The number you already saved still applies.",
  engineCardDescription: (limit: number): string =>
    `How many segments this engine may render at once, up to ${limit}. Changes apply right away, no restart needed.`,
  inheritsGlobal: (n: number): string =>
    `Left empty, this engine uses the Parallel Segment Rendering setting, which is ${n} right now.`,
  genericSaveError: 'Settings update failed. Please try again.',
} as const;

/** Which hint line to show, or null for none (limit unknown, or nothing is being limited). */
export const capHint = (args: {
  safeMax: number | null | undefined;
  hardMax?: number | null;
  ceiling: number;
  memoryMeasurable: boolean;
}): string | null => {
  const { safeMax, ceiling, memoryMeasurable } = args;
  if (safeMax == null) return null;
  if (!memoryMeasurable) return PARALLEL_CAP_COPY.hintUnmeasurable;
  if (safeMax >= ceiling) return null;
  // A missing hard limit reads as "no room above the guide".
  const hardMax = Math.max(safeMax, args.hardMax ?? safeMax);
  if (hardMax === safeMax) return safeMax <= 1 ? PARALLEL_CAP_COPY.hintOne : PARALLEL_CAP_COPY.hintUpTo(hardMax);
  return safeMax <= 1
    ? PARALLEL_CAP_COPY.hintOneComfortable(hardMax)
    : PARALLEL_CAP_COPY.hintComfortable(safeMax, hardMax);
};

/** The zone between the comfortable and hard limits is allowed, with a note. */
export const capWarning = (args: {
  value: number;
  safeMax: number | null | undefined;
  memoryMeasurable: boolean;
}): string | null => {
  const { value, safeMax, memoryMeasurable } = args;
  if (safeMax == null || !memoryMeasurable || value <= safeMax) return null;
  return PARALLEL_CAP_COPY.overComfortableWarning(safeMax);
};
