import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useVariantActions } from './useVariantActions';
import type { SpeakerProfile } from '../types';

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
    
    // Mock Audio
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
  });

  it('handles play/pause for main preview', () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    // Manually set up audioRef for testing
    const mockAudio = {
      play: vi.fn(),
      pause: vi.fn(),
    };
    (result.current.audioRef as any).current = mockAudio;

    act(() => {
      result.current.handlePlayClick({ stopPropagation: vi.fn() } as any);
    });

    expect(mockAudio.play).toHaveBeenCalled();

    act(() => {
      result.current.setIsPlaying(true);
    });

    act(() => {
      result.current.handlePlayClick({ stopPropagation: vi.fn() } as any);
    });

    expect(mockAudio.pause).toHaveBeenCalled();
  });

  it('triggers onTest if no preview_url exists', () => {
    const profileNoPreview: any = { ...mockProfile, preview_url: null };
    const { result } = renderHook(() => useVariantActions(profileNoPreview, onRefresh, onTest, requestConfirm));

    act(() => {
      result.current.handlePlayClick({ stopPropagation: vi.fn() } as any);
    });

    expect(onTest).toHaveBeenCalledWith('Test Voice');
  });

  it('handles sample playback', () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    const mockSampleAudio: any = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      src: '',
    };
    (result.current.sampleAudioRef as any).current = mockSampleAudio;

    act(() => {
      result.current.handlePlaySample('sample1.wav');
    });

    expect(result.current.playingSample).toBe('sample1.wav');
    expect(mockSampleAudio.src).toContain('sample1.wav');
    expect(mockSampleAudio.play).toHaveBeenCalled();
  });

  it('handles speed change', async () => {
    const { result } = renderHook(() => useVariantActions(mockProfile, onRefresh, onTest, requestConfirm));

    await act(async () => {
      await result.current.handleSpeedChange(1.2);
    });

    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/speed'), expect.objectContaining({
      method: 'POST',
      body: expect.any(URLSearchParams),
    }));
    expect(onRefresh).toHaveBeenCalled();
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
