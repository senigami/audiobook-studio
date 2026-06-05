export function formatEngineTestGeneratedAt(generatedAt: number | string | null | undefined): string {
  if (generatedAt === null || generatedAt === undefined || generatedAt === '') {
    return 'Unknown';
  }

  if (typeof generatedAt === 'number' && Number.isFinite(generatedAt)) {
    return new Date(generatedAt * 1000).toLocaleString();
  }

  const numericValue = typeof generatedAt === 'string' ? Number(generatedAt) : Number.NaN;
  if (Number.isFinite(numericValue)) {
    const millis = numericValue > 1e12 ? numericValue : numericValue * 1000;
    return new Date(millis).toLocaleString();
  }

  const parsed = new Date(String(generatedAt));
  return Number.isNaN(parsed.getTime()) ? 'Unknown' : parsed.toLocaleString();
}
