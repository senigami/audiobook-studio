import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVariantActions } from '@/hooks/useVariantActions';
import type { SpeakerProfile } from '@/types';
import { loadAndPlay, play, pause, usePlayerBus } from '@/store/playerBus';

vi.mock('@/store/playerBus', () => {
  const state = {
    scope: null as any,
    playing: false,
    audioUrl: null as any,
  };
  return {
    usePlayerBus: vi.fn().mockReturnValue(state),
    loadAndPlay: vi.fn().mockImplementation((opts) => {
      state.scope = opts.scope;
      state.audioUrl = opts.audioUrl;
      state.playing = true;
    }),
    play: vi.fn().mockImplementation(() => {
      state.playing = true;
    }),
    pause: vi.fn().mockImplementation(() => {
      state.playing = false;
    }),
  };
});

describe('useVariantActions', () => {
  const mockProfile: SpeakerProfile = {
    name: 'Test Voice',
    preview_url: '/preview.wav',
    samples: ['sample1.wav'],
    num_samples: 1,
    last_modified: 123456789,
    is_built: true,
  } as any;

  const onRefresh = vi.fn();
  const onTest = vi.fn();
  const requestConfirm = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 'success' }),
    });
    
    // Reset the mock state
    const state = vi.mocked(usePlayerBus)();
    state.scope = null;
    state.playing = false;
    state.audioUrl = null;
  });

  it('handles play/pause for main preview', () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    act(() => {
      result.current.handlePlayClick({ stopPropagation: vi.fn() } as any);
    });

    expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'preview',
      audioUrl: expect.stringContaining('/preview.wav'),
    }));

    // Update state to simulate it playing
    const state = vi.mocked(usePlayerBus)();
    state.scope = 'preview';
    state.audioUrl = result.current.isPlaying ? '' : `/preview.wav?t=${result.current.cacheBuster}`;
    state.playing = true;

    act(() => {
      result.current.handlePlayClick({ stopPropagation: vi.fn() } as any);
    });

    expect(pause).toHaveBeenCalled();
  });

  it('triggers onTest if no preview_url exists', () => {
    const profileNoPreview: any = { ...mockProfile, preview_url: null };
    const { result } = renderHook(() => useVariantActions(profileNoPreview, onRefresh, onTest, requestConfirm));

    act(() => {
      result.current.handlePlayClick({ stopPropagation: vi.fn() } as any);
    });

    expect(onTest).toHaveBeenCalledWith('Test Voice');
  });

  it('generates preview explicitly when requested', () => {
    const { result } = renderHook(() =>
      useVariantActions(mockProfile, onRefresh, onTest, requestConfirm)
    );

    act(() => {
      result.current.handleGeneratePreview({ stopPropagation: vi.fn() } as any);
    });

    expect(onTest).toHaveBeenCalledWith('Test Voice');
    expect(pause).not.toHaveBeenCalled();
  });

  it('stops current playback before regenerating a preview', () => {
    const { result } = renderHook(() =>
      useVariantActions(mockProfile, onRefresh, onTest, requestConfirm)
    );

    // Update state to simulate it playing
    const state = vi.mocked(usePlayerBus)();
    state.scope = 'preview';
    state.audioUrl = `/preview.wav?t=${result.current.cacheBuster}`;
    state.playing = true;

    act(() => {
      result.current.handleGeneratePreview({ stopPropagation: vi.fn() } as any);
    });

    expect(pause).toHaveBeenCalled();
    expect(onTest).toHaveBeenCalledWith('Test Voice');
  });

  it('routes sample playback through the player bus (scope=preview, sample url)', () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    act(() => {
      result.current.handlePlaySample('sample1.wav');
    });

    expect(loadAndPlay).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'preview',
      audioUrl: expect.stringContaining('sample1.wav'),
    }));
  });

  it('pauses via bus when toggling the same playing sample', () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    // Simulate the bus state after first play
    const state = vi.mocked(usePlayerBus)();
    const baseUrl = `/out/voices/${encodeURIComponent('Test Voice')}`;
    const sampleUrl = `${baseUrl}/${encodeURIComponent('sample1.wav')}`;

    act(() => {
      result.current.handlePlaySample('sample1.wav');
    });

    // Set bus state to reflect sample is now playing
    state.scope = 'preview';
    state.playing = true;
    // The url will have a ?t= timestamp; match on the base
    state.audioUrl = `${sampleUrl}?t=1`;

    // Re-render to pick up new state
    const { result: result2 } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));
    // Simulate same sample playing by setting state.audioUrl to match what handlePlaySample would produce
    // (We can't know the exact timestamp, so verify pause is called when the url matches)
    vi.mocked(loadAndPlay).mockImplementationOnce((opts) => {
      state.scope = opts.scope;
      state.audioUrl = opts.audioUrl;
      state.playing = true;
    });

    act(() => {
      result2.current.handlePlaySample('sample1.wav');
    });

    // After first call audioUrl is now set; call again to toggle off
    act(() => {
      result2.current.handlePlaySample('sample1.wav');
    });

    expect(pause).toHaveBeenCalled();
  });

  it('handles speed change', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    await act(async () => {
      result.current.handleSpeedChange(1.2);
    });

    // Advance effectively triggers the setTimeout in handleSpeedChange
    await act(async () => {
      vi.advanceTimersByTime(300);
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/speed'), expect.objectContaining({
      method: 'POST',
      body: expect.any(URLSearchParams),
    }));
    expect(onRefresh).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('handles sample deletion with confirmation', async () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    act(() => {
      result.current.handleDeleteSample('sample1.wav');
    });

    expect(requestConfirm).toHaveBeenCalled();
    const onConfirm = requestConfirm.mock.calls[0][0].onConfirm;

    await act(async () => {
      await onConfirm();
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/samples/sample1.wav'), {
      method: 'DELETE',
    });
    expect(onRefresh).toHaveBeenCalled();
  });

  it('handles file uploads', async () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));
    const files = [new File([''], 'test.wav')];

    await act(async () => {
      await result.current.uploadFiles(files);
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/samples/upload'), expect.objectContaining({
      method: 'POST',
      body: expect.any(FormData),
    }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
