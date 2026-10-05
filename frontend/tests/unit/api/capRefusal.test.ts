import { describe, it, expect } from 'vitest';
import { readCapRefusal } from '@/api/capRefusal';

describe('readCapRefusal', () => {
  it('reads both refusal codes', () => {
    for (const code of ['parallel_cap_unsafe', 'invalid_cap']) {
      expect(readCapRefusal({ detail: { code, message: 'm', correlation_id: 'c' } })?.code).toBe(code);
    }
  });

  it('returns null for an object detail with an unknown code', () => {
    expect(readCapRefusal({ detail: { code: 'something_else', message: 'm', correlation_id: 'c' } })).toBeNull();
    expect(readCapRefusal({ detail: { code: 'cap_out_of_range', message: 'm' } })).toBeNull();
  });

  it('returns null for a list, a string, a missing message, and no body', () => {
    expect(readCapRefusal({ detail: [{ msg: 'x' }] })).toBeNull();
    expect(readCapRefusal({ detail: 'plain' })).toBeNull();
    expect(readCapRefusal({ detail: { code: 'parallel_cap_unsafe' } })).toBeNull();
    expect(readCapRefusal(null)).toBeNull();
  });
});
