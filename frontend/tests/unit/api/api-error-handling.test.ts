import { describe, it, expect, vi, afterEach } from 'vitest';
import { api } from '@/api';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api error handling — unchecked res.ok', () => {
  it('fetchProjects rejects on 503 rather than returning the error body as data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ status: 'error', message: 'Service Unavailable' }),
      })
    );

    await expect(api.fetchProjects()).rejects.toThrow('Service Unavailable');
  });

  it('getProcessingQueue rejects on 503 rather than returning the error body as data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ status: 'error', message: 'Queue unavailable' }),
      })
    );

    await expect(api.getProcessingQueue()).rejects.toThrow('Queue unavailable');
  });

  it('fetchProject rejects on 404 with a thrown error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ status: 'error', message: 'Project not found' }),
      })
    );

    await expect(api.fetchProject('missing-id')).rejects.toThrow('Project not found');
  });
});
