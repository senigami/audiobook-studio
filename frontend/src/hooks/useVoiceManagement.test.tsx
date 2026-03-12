import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVoiceManagement } from './useVoiceManagement';

describe('useVoiceManagement', () => {
  const onRefresh = vi.fn();
  const requestConfirm = vi.fn();
  const speakerProfiles = [{ name: 'Voice 1' } as any];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
    });
  });

  it('fetches speakers on mount', async () => {
    const mockSpeakers = [{ id: 's1', name: 'Speaker 1' }];
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSpeakers),
    });

    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    await waitFor(() => {
      expect(result.current.speakers).toEqual(mockSpeakers);
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/speakers');
  });

  it('handles setting default voice', async () => {
    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    await act(async () => {
      await result.current.handleSetDefault('Voice 1');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/settings/default-speaker', expect.objectContaining({
      method: 'POST',
      body: expect.any(URLSearchParams),
    }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('handles testing a voice profile', async () => {
    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    await act(async () => {
      await result.current.handleTest('Voice 1');
    });

    expect(result.current.testingProfile).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith('/api/speaker-profiles/test', expect.objectContaining({
      method: 'POST',
      body: expect.any(URLSearchParams),
    }));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('handles buildNow failure with error formatting', async () => {
    const errorResponse = { detail: [{ msg: 'Rebuild failed' }] };
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve(errorResponse),
    });

    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    await act(async () => {
      await result.current.handleBuildNow('Voice 1', [new File([''], 'test.wav')]);
    });

    expect(requestConfirm).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Rebuild Failed',
      message: 'Rebuild failed',
    }));
  });

  it('handles handleDelete', async () => {
    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    await act(async () => {
      await result.current.handleDelete('Voice 1');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/speaker-profiles/Voice%201', {
      method: 'DELETE',
    });
    expect(onRefresh).toHaveBeenCalled();
  });
});
