import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IconUpload } from '@/pages/Voices/components/metadata/IconUpload';
import { buildIconPrompt } from '@/pages/VoiceLab/iconPrompt';
import type { VoiceMetadata } from '@/types';

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

  describe('drag and drop', () => {
    function dropZone(container: HTMLElement) {
      return container.querySelector('.metadata-icon-upload__row') as HTMLElement;
    }

    it('uploads a dropped square image the same way as a picked one', async () => {
      FakeImage.behavior = 'square';
      (api.uploadVoiceIcon as any).mockResolvedValue({ image: 'icon.png' });
      const onSuccess = vi.fn();

      const { container } = render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={onSuccess} onError={vi.fn()} />);

      fireEvent.drop(dropZone(container), { dataTransfer: { files: [makeFile()] } });

      await waitFor(() => {
        expect(api.uploadVoiceIcon).toHaveBeenCalledWith('v1', expect.any(File));
      });
      expect(onSuccess).toHaveBeenCalledWith('icon.png');
    });

    it('opens the crop modal for a dropped non-square image', async () => {
      FakeImage.behavior = 'nonsquare';

      const { container } = render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={vi.fn()} onError={vi.fn()} />);

      fireEvent.drop(dropZone(container), { dataTransfer: { files: [makeFile()] } });

      await waitFor(() => {
        expect(screen.getByRole('dialog', { name: /crop icon/i })).toBeInTheDocument();
      });
      expect(api.uploadVoiceIcon).not.toHaveBeenCalled();
    });

    it('shows a drag-active hint while a file is dragged over, and clears it on drag-leave', () => {
      const { container } = render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={vi.fn()} onError={vi.fn()} />);

      const zone = dropZone(container);
      expect(screen.queryByText('Drop to upload')).toBeNull();

      fireEvent.dragOver(zone, { dataTransfer: { files: [] } });
      expect(screen.getByText('Drop to upload')).toBeInTheDocument();

      fireEvent.dragLeave(zone);
      expect(screen.queryByText('Drop to upload')).toBeNull();
    });

    it('rejects a dropped non-image file with an error, without touching the upload API', async () => {
      const onError = vi.fn();
      const { container } = render(<IconUpload voiceId="v1" currentImagePath={undefined} onSuccess={vi.fn()} onError={onError} />);

      fireEvent.drop(dropZone(container), {
        dataTransfer: { files: [new File(['not an image'], 'notes.txt', { type: 'text/plain' })] },
      });

      await waitFor(() => {
        expect(onError).toHaveBeenCalledWith('Drop an image file (PNG, JPEG, or WebP).');
      });
      expect(api.uploadVoiceIcon).not.toHaveBeenCalled();
    });
  });

  describe('copy icon prompt', () => {
    const meta: VoiceMetadata = {
      id: 'v1',
      name: 'Dracula',
      is_untagged: false,
      description: 'A menacing count.',
      attributes: { class: 'monster', gender: 'male', age: 'ancient' },
      tags: ['gothic'],
    };

    it('reveals the built prompt as a tooltip on the copy-prompt button', () => {
      render(
        <IconUpload
          voiceId="v1"
          currentImagePath={undefined}
          metadata={meta}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      const button = screen.getByRole('button', { name: 'Copy icon generation prompt' });
      expect(button).toHaveAttribute('title', buildIconPrompt(meta));
    });

    it('copies the exact buildIconPrompt output to the clipboard on click', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.assign(navigator, { clipboard: { writeText } });

      render(
        <IconUpload
          voiceId="v1"
          currentImagePath={undefined}
          metadata={meta}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy icon generation prompt' }));

      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(buildIconPrompt(meta));
      });
    });

    it('surfaces a visible error when the clipboard write is rejected, instead of failing silently', async () => {
      const writeText = vi.fn().mockRejectedValue(new Error('denied'));
      Object.assign(navigator, { clipboard: { writeText } });

      render(
        <IconUpload
          voiceId="v1"
          currentImagePath={undefined}
          metadata={meta}
          onSuccess={vi.fn()}
          onError={vi.fn()}
        />
      );

      fireEvent.click(screen.getByRole('button', { name: 'Copy icon generation prompt' }));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(/could not copy/i);
      });
    });
  });
});
