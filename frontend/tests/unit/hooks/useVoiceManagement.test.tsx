import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVoiceManagement } from '@/hooks/useVoiceManagement';
import { APP_TOAST_EVENT } from '@/utils/toast';

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
    expect(global.fetch).toHaveBeenCalledWith('/api/speakers', { cache: 'no-store' });
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
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'success', job_id: 'test-job-1' }),
    });

    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    await act(async () => {
      await result.current.handleTest('Voice 1');
    });

    expect(result.current.buildingProfiles['Voice 1']).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/speaker-profiles/Voice%201/test', expect.objectContaining({
      method: 'POST'
    }));
    // Note: handleTest doesn't call onRefresh, it relies on WebSocket/jobs to finish.
    // However, the original test expected it. Checking useVoiceManagement.ts...
    // handleTest only updates buildingProfiles.
  });

  it('clears restored building profiles when the job snapshot goes empty', async () => {
    const activeJobs = {
      'job-1': {
        id: 'job-1',
        engine: 'voice_build',
        speaker_profile: 'Voice 1',
        status: 'running',
      } as any,
    };

    const initialProps: { jobs: Record<string, any> } = { jobs: activeJobs };
    const { result, rerender } = renderHook(
      ({ jobs }: { jobs: Record<string, any> }) => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm, jobs),
      {
        initialProps,
      }
    );

    await waitFor(() => {
      expect(result.current.buildingProfiles['Voice 1']).toBe(true);
    });

    rerender({ jobs: {} });

    await waitFor(() => {
      expect(result.current.buildingProfiles['Voice 1']).toBeUndefined();
    });
  });

  // Owner-reported (2026-07-16): "after I rebuild, the samples are still
  // labeled as new" -- root cause was two separate useEffects both watching
  // `jobs`, where the first silently cleared a just-completed build's
  // buildingProfiles entry before the second (which alone called onRefresh)
  // ever saw the transition, so the profile list (and its is_new/
  // is_rebuild_required flags) never refreshed after a rebuild finished.
  it('calls onRefresh when a tracked build job transitions to done', async () => {
    const initialProps: { jobs: Record<string, any> } = {
      jobs: {
        'job-1': {
          id: 'job-1',
          engine: 'voice_build',
          speaker_profile: 'Voice 1',
          status: 'running',
        } as any,
      },
    };
    const { result, rerender } = renderHook(
      ({ jobs }: { jobs: Record<string, any> }) => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm, jobs),
      { initialProps }
    );

    await waitFor(() => {
      expect(result.current.buildingProfiles['Voice 1']).toBe(true);
    });

    rerender({
      jobs: {
        'job-1': {
          id: 'job-1',
          engine: 'voice_build',
          speaker_profile: 'Voice 1',
          status: 'done',
        } as any,
      },
    });

    await waitFor(() => {
      expect(onRefresh).toHaveBeenCalled();
    });
    expect(result.current.buildingProfiles['Voice 1']).toBeUndefined();
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

  it('surfaces a toast when handleUpdateSettings fails (non-ok response)', async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: 'nope' }),
    });

    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.handleUpdateSettings('Voice 1', { test_text: 'hi' });
    });

    expect(success).toBe(false);
    expect(toastHandler).toHaveBeenCalledTimes(1);
    expect((toastHandler.mock.calls[0][0] as CustomEvent).detail.message).toMatch(/failed to save voice settings/i);

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });

  it('surfaces a toast when handleUpdateSettings throws (network error)', async () => {
    (global.fetch as any).mockRejectedValue(new Error('network down'));

    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    let success: boolean | undefined;
    await act(async () => {
      success = await result.current.handleUpdateSettings('Voice 1', { test_text: 'hi' });
    });

    expect(success).toBe(false);
    expect(toastHandler).toHaveBeenCalledTimes(1);
    expect((toastHandler.mock.calls[0][0] as CustomEvent).detail.message).toMatch(/failed to save voice settings/i);

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });

  it('handles handleDelete — defers the actual delete behind an undo toast', async () => {
    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    vi.useFakeTimers();
    await act(async () => {
      await result.current.handleDelete('Voice 1');
    });

    expect(global.fetch).not.toHaveBeenCalledWith('/api/speaker-profiles/Voice%201', {
      method: 'DELETE',
    });
    expect(toastHandler).toHaveBeenCalledTimes(1);
    const detail = (toastHandler.mock.calls[0][0] as CustomEvent).detail;
    expect(detail.message).toMatch(/deleted voice "voice 1"/i);
    expect(detail.action).toEqual({ label: 'Undo', onClick: expect.any(Function) });

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(global.fetch).toHaveBeenCalledWith('/api/speaker-profiles/Voice%201', {
      method: 'DELETE',
    });
    expect(onRefresh).toHaveBeenCalled();

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });

  it('cancels the deferred voice delete when Undo is clicked', async () => {
    const toastHandler = vi.fn();
    window.addEventListener(APP_TOAST_EVENT, toastHandler);

    const { result } = renderHook(() => useVoiceManagement(onRefresh, speakerProfiles, requestConfirm));

    vi.useFakeTimers();
    await act(async () => {
      await result.current.handleDelete('Voice 1');
    });

    const detail = (toastHandler.mock.calls[0][0] as CustomEvent).detail;
    detail.action.onClick();

    await act(async () => {
      vi.advanceTimersByTime(4000);
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(global.fetch).not.toHaveBeenCalledWith('/api/speaker-profiles/Voice%201', {
      method: 'DELETE',
    });
    expect(onRefresh).not.toHaveBeenCalled();

    window.removeEventListener(APP_TOAST_EVENT, toastHandler);
  });
});
