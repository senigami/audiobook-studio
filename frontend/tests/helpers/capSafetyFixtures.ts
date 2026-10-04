import type { EngineConcurrencyResponse } from '@/api';
import type { ParallelCapRefusal } from '@/api/capRefusal';

// Typed so a contract change in the concurrency or refusal shape breaks the fixture.
export const concurrencyFixture = (overrides: Partial<EngineConcurrencyResponse> = {}): EngineConcurrencyResponse => ({
  global_cap: 2,
  global_safe_max: 1,
  global_hard_max: 2,
  global_cap_is_auto: false,
  memory_measurable: true,
  engines: [
    { engine_id: 'xtts', engine_class: 'gpu', manifest_max: 8, requested_cap: 2, effective_cap: 2, active_count: 0, safe_max: 1, hard_max: 2 },
    { engine_id: 'voxtral', engine_class: 'cloud', manifest_max: 1, requested_cap: 1, effective_cap: 1, active_count: 0, safe_max: 1, hard_max: 1 },
  ],
  ...overrides,
});

export const refusalFixture = (overrides: Partial<ParallelCapRefusal> = {}): ParallelCapRefusal => ({
  code: 'parallel_cap_unsafe',
  message: 'Server sentence for tests, safe maximum 1.',
  correlation_id: 'abcdef012345',
  violations: [{ setting: 'tts_parallel_cap', engine: 'xtts', requested: 3, safe_maximum: 1, hard_maximum: 2, basis: 'memory' }],
  ...overrides,
});

export const refusalResponse = (refusal: ParallelCapRefusal): Response =>
  ({ ok: false, status: 422, json: () => Promise.resolve({ detail: refusal }) }) as unknown as Response;

export const failureResponse = (status: number, detail: unknown): Response =>
  ({ ok: false, status, json: () => Promise.resolve({ detail }) }) as unknown as Response;
