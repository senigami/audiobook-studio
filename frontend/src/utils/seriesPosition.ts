export function parseSeriesPositionInput(raw: string): { value: number | null; error: string | null } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { value: null, error: null };
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return { value: null, error: 'Series position must be a whole number.' };
  }

  return { value, error: null };
}
