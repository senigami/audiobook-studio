/**
 * Hook-level tests for the Lexicon API methods in api/index.ts.
 *
 * R2: mocks only the real network boundary (global.fetch), not the module
 * under test (api/index.ts) itself.
 *
 * Revert-check: each test asserts the FIXED behavior — it must fail if run
 * against the pre-fix hooks:
 *   - fetchLexicon: pre-fix returned the whole {status, entries} object;
 *     this test asserts it returns the entries array.
 *   - addLexiconEntry: pre-fix sent JSON; this test asserts form encoding.
 *   - updateLexiconEntry: pre-fix sent JSON; this test asserts form encoding.
 */
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { api } from '@/api/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchResponse(body: unknown, ok = true) {
  return {
    ok,
    status: ok ? 200 : 400,
    json: () => Promise.resolve(body),
  } as Response;
}

// ---------------------------------------------------------------------------
// fetchLexicon
// ---------------------------------------------------------------------------

describe('api.fetchLexicon', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        makeFetchResponse({ status: 'ok', entries: [{ id: '1', project_id: 'p1', word: 'via', replacement: 'VEE-ah', created_at: 1 }] })
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls GET /api/projects/:id/lexicon', async () => {
    await api.fetchLexicon('p1');
    expect(global.fetch).toHaveBeenCalledWith('/api/projects/p1/lexicon');
  });

  it('returns the entries ARRAY from the nested response body (revert-check: fails if hook returns raw object)', async () => {
    const result = await api.fetchLexicon('p1');
    // Must be an array, not the envelope object
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: '1', word: 'via', replacement: 'VEE-ah' });
  });

  it('returns an empty array when entries is missing from the response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ status: 'ok' }))
    );
    const result = await api.fetchLexicon('p1');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  it('returns an empty array when entries is not an array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ status: 'ok', entries: null }))
    );
    const result = await api.fetchLexicon('p1');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// addLexiconEntry
// ---------------------------------------------------------------------------

describe('api.addLexiconEntry', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ status: 'ok', id: 42 }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls POST /api/projects/:id/lexicon', async () => {
    await api.addLexiconEntry('p1', 'myword', 'myreplacement');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/p1/lexicon',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends form-encoded body, NOT JSON (revert-check: fails if hook sends Content-Type: application/json)', async () => {
    await api.addLexiconEntry('p1', 'myword', 'myreplacement');
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    // Must use FormData (multipart), not JSON
    expect(init.body).toBeInstanceOf(FormData);
    // Must NOT send a Content-Type: application/json header
    const ct = (init.headers as Record<string, string> | undefined)?.['Content-Type'];
    expect(ct).not.toBe('application/json');
    // FormData fields must be present
    const fd = init.body as FormData;
    expect(fd.get('word')).toBe('myword');
    expect(fd.get('replacement')).toBe('myreplacement');
  });

  it('returns a full LexiconEntry with the id from the backend response', async () => {
    const result = await api.addLexiconEntry('p1', 'myword', 'myreplacement');
    expect(result).toMatchObject({
      id: '42',
      project_id: 'p1',
      word: 'myword',
      replacement: 'myreplacement',
    });
  });
});

// ---------------------------------------------------------------------------
// updateLexiconEntry
// ---------------------------------------------------------------------------

describe('api.updateLexiconEntry', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ status: 'ok' }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls PUT /api/projects/:id/lexicon/:entryId', async () => {
    await api.updateLexiconEntry('p1', 'e5', 'updated', 'new-rep');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/p1/lexicon/e5',
      expect.objectContaining({ method: 'PUT' })
    );
  });

  it('sends form-encoded body, NOT JSON (revert-check: fails if hook sends Content-Type: application/json)', async () => {
    await api.updateLexiconEntry('p1', 'e5', 'updated', 'new-rep');
    const [, init] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.body).toBeInstanceOf(FormData);
    const ct = (init.headers as Record<string, string> | undefined)?.['Content-Type'];
    expect(ct).not.toBe('application/json');
    const fd = init.body as FormData;
    expect(fd.get('word')).toBe('updated');
    expect(fd.get('replacement')).toBe('new-rep');
  });

  it('returns a constructed LexiconEntry with the given ids and values', async () => {
    const result = await api.updateLexiconEntry('p1', 'e5', 'updated', 'new-rep');
    expect(result).toMatchObject({
      id: 'e5',
      project_id: 'p1',
      word: 'updated',
      replacement: 'new-rep',
    });
  });
});

// ---------------------------------------------------------------------------
// deleteLexiconEntry
// ---------------------------------------------------------------------------

describe('api.deleteLexiconEntry', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(makeFetchResponse({ status: 'ok' }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls DELETE /api/projects/:id/lexicon/:entryId', async () => {
    await api.deleteLexiconEntry('p1', 'e9');
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/projects/p1/lexicon/e9',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('returns the {status} response body unchanged', async () => {
    const result = await api.deleteLexiconEntry('p1', 'e9');
    expect(result).toMatchObject({ status: 'ok' });
  });
});
