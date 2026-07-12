/**
 * WaveformStrip.test.tsx
 *
 * Tests for frontend/src/app/layout/WaveformStrip.tsx.
 *
 * Mocks: wavesurfer.js (external library — audio decoding/rendering engine,
 * outside the unit under test). Does NOT mock WaveformStrip itself.
 *
 * Contract under test:
 *   - WaveformStrip renders the container div with class "waveform-strip".
 *   - On mount it lazy-imports wavesurfer, creates an instance with the
 *     passed-in audio element (media option), and calls load(audioUrl).
 *   - On unmount it calls destroy() to clean up the wavesurfer instance.
 *   - On audioUrl change it destroys the old instance and creates a new one.
 */

import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WaveformStrip } from '@/app/layout/WaveformStrip';

// ---------------------------------------------------------------------------
// Mock wavesurfer.js (the external library) — boundary mock only
// ---------------------------------------------------------------------------

const mockDestroy = vi.fn();
const mockLoad = vi.fn(() => Promise.resolve());
const mockCreate = vi.fn(() => ({ destroy: mockDestroy, load: mockLoad }));

vi.mock('wavesurfer.js', () => ({
  default: { create: mockCreate },
}));

// ---------------------------------------------------------------------------

describe('WaveformStrip', () => {
  let audioEl: HTMLAudioElement;

  beforeEach(() => {
    vi.clearAllMocks();
    audioEl = document.createElement('audio');
  });

  it('renders a div with class "waveform-strip"', async () => {
    render(<WaveformStrip audioEl={audioEl} audioUrl="https://example.com/audio.mp3" />);
    // The container is always rendered synchronously
    expect(document.querySelector('.waveform-strip')).not.toBeNull();
  });

  it('creates a wavesurfer instance passing the audioEl as media and calls load(audioUrl)', async () => {
    render(<WaveformStrip audioEl={audioEl} audioUrl="https://example.com/seg1.mp3" />);

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

    const createArg = mockCreate.mock.calls[0][0];
    // Single-owner: must bind to the passed-in audio element
    expect(createArg.media).toBe(audioEl);
    // Must decode peaks from the URL
    expect(mockLoad).toHaveBeenCalledWith('https://example.com/seg1.mp3');
  });

  it('destroys the wavesurfer instance on unmount', async () => {
    const { unmount } = render(
      <WaveformStrip audioEl={audioEl} audioUrl="https://example.com/audio.mp3" />,
    );

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

    act(() => {
      unmount();
    });

    expect(mockDestroy).toHaveBeenCalled();
  });

  it('destroys old instance and creates a new one when audioUrl changes', async () => {
    const { rerender } = render(
      <WaveformStrip audioEl={audioEl} audioUrl="https://example.com/first.mp3" />,
    );

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

    act(() => {
      rerender(<WaveformStrip audioEl={audioEl} audioUrl="https://example.com/second.mp3" />);
    });

    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(2));
    // Old instance destroyed before new one created
    expect(mockDestroy).toHaveBeenCalled();
    expect(mockLoad).toHaveBeenLastCalledWith('https://example.com/second.mp3');
  });

  it('swallows AbortError from load() rejecting after destroy() tears down mid-load', async () => {
    // Simulates unmounting (e.g. `showWave` flipping false once the real
    // duration arrives) before wavesurfer's async load() resolves — destroy()
    // aborts the in-flight fetch, which wavesurfer surfaces as a rejected
    // load() promise. This must not become an uncaught rejection.
    let rejectLoad: (err: Error) => void = () => {};
    mockLoad.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectLoad = reject;
      }),
    );
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = render(
      <WaveformStrip audioEl={audioEl} audioUrl="https://example.com/audio.mp3" />,
    );
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

    act(() => {
      unmount();
    });

    const abortError = new Error('signal is aborted without reason');
    abortError.name = 'AbortError';
    await act(async () => {
      rejectLoad(abortError);
      await Promise.resolve();
    });

    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it('logs a non-abort load() failure to the console', async () => {
    let rejectLoad: (err: Error) => void = () => {};
    mockLoad.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectLoad = reject;
      }),
    );
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<WaveformStrip audioEl={audioEl} audioUrl="https://example.com/audio.mp3" />);
    await waitFor(() => expect(mockCreate).toHaveBeenCalledTimes(1));

    const networkError = new Error('network error');
    await act(async () => {
      rejectLoad(networkError);
      await Promise.resolve();
    });

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'WaveformStrip: failed to load audio for waveform',
      networkError,
    );
    consoleErrorSpy.mockRestore();
  });
});
