import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IconUpload } from '@/pages/Voices/components/metadata/IconUpload';

vi.mock('@/api', () => ({
  api: {
    uploadVoiceIcon: vi.fn(),
  },
}));

import { api } from '@/api';

/**
 * jsdom doesn't decode real images. IconUpload probes dimensions via a
 * plain `new Image()` + onload, so we replace the global Image constructor
 * with a stub whose onload/onerror we control per test — the same seam a
 * real browser would resolve async via actual decode.
 */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  private _src = '';
  static behavior: 'square' | 'nonsquare' | 'error' = 'square';

  set src(_value: string) {
    this._src = _value;
    queueMicrotask(() => {
      if (FakeImage.behavior === 'error') {
        this.onerror?.();
        return;
      }
      this.naturalWidth = 400;
      this.naturalHeight = FakeImage.behavior === 'square' ? 400 : 300;
      this.onload?.();
    });
  }
  get src() {
    return this._src;
  }
}

function makeFile(name = 'photo.png', type = 'image/png') {
  return new File(['fake-bytes'], name, { type });
}

describe('IconUpload', () => {
  const originalImage = global.Image;

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).Image = FakeImage;
    global.URL.createObjectURL = vi.fn(() => 'blob:fake');
    global.URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    (global as any).Image = originalImage;
  });

  it('uploads a square image directly, without opening the crop modal', async () => {
    FakeImage.behavior = 'square';
    (api.uploadVoiceIcon as any).mockResolvedValue({ image: 'icon.png' });
    const onSuccess = vi.fn();

    render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={onSuccess} onError={vi.fn()} />);

    const input = screen.getByLabelText('Upload voice icon') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(api.uploadVoiceIcon).toHaveBeenCalledWith('v1', expect.any(File));
    });
    expect(onSuccess).toHaveBeenCalledWith('icon.png');
    expect(screen.queryByRole('dialog', { name: /crop icon/i })).toBeNull();
  });

  it('opens the crop modal for a non-square image instead of uploading it directly', async () => {
    FakeImage.behavior = 'nonsquare';

    render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={vi.fn()} onError={vi.fn()} />);

    const input = screen.getByLabelText('Upload voice icon') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /crop icon/i })).toBeInTheDocument();
    });
    expect(api.uploadVoiceIcon).not.toHaveBeenCalled();
  });

  it('falls back to a direct upload attempt if the dimension probe fails', async () => {
    FakeImage.behavior = 'error';
    (api.uploadVoiceIcon as any).mockResolvedValue({ image: 'icon.png' });
    const onSuccess = vi.fn();

    render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={onSuccess} onError={vi.fn()} />);

    const input = screen.getByLabelText('Upload voice icon') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(api.uploadVoiceIcon).toHaveBeenCalledWith('v1', expect.any(File));
    });
    expect(onSuccess).toHaveBeenCalledWith('icon.png');
  });

  it('surfaces the server error message verbatim on a rejected upload', async () => {
    FakeImage.behavior = 'square';
    (api.uploadVoiceIcon as any).mockRejectedValue(new Error('Icon must be square (1:1 aspect ratio). Got 400×300.'));
    const onError = vi.fn();

    render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={vi.fn()} onError={onError} />);

    const input = screen.getByLabelText('Upload voice icon') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith('Icon must be square (1:1 aspect ratio). Got 400×300.');
    });
  });
});
