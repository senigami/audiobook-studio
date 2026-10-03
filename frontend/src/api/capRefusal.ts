export type ParallelCapBasis = 'memory' | 'unmeasurable';

export interface ParallelCapViolation {
  setting: 'tts_parallel_cap' | 'tts_engine_caps';
  engine: string | null;
  requested: number;
  safe_maximum: number;
  basis: ParallelCapBasis;
}

export type CapRefusalCode = 'parallel_cap_unsafe' | 'invalid_cap';

export interface ParallelCapRefusal {
  code: CapRefusalCode;
  message: string;
  correlation_id: string;
  /** Present for `parallel_cap_unsafe` only. */
  violations?: ParallelCapViolation[];
}

export class ParallelCapRefusedError extends Error {
  readonly refusal: ParallelCapRefusal;
  constructor(refusal: ParallelCapRefusal) {
    super(refusal.message);
    this.name = 'ParallelCapRefusedError';
    this.refusal = refusal;
  }
}

const REFUSAL_CODES: readonly string[] = ['parallel_cap_unsafe', 'invalid_cap'];

/**
 * Two 422 shapes exist (FastAPI's own validation gives a `detail` LIST, and a
 * 503 gives a plain string); only an object `detail` with one of these codes is
 * a cap refusal the person can act on.
 */
export const readCapRefusal = (body: unknown): ParallelCapRefusal | null => {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) {
    const candidate = detail as Partial<ParallelCapRefusal>;
    if (
      typeof candidate.code === 'string' &&
      REFUSAL_CODES.includes(candidate.code) &&
      typeof candidate.message === 'string'
    ) {
      return candidate as ParallelCapRefusal;
    }
  }
  return null;
};

export const isParallelCapRefused = (error: unknown): error is ParallelCapRefusedError =>
  error instanceof ParallelCapRefusedError;
