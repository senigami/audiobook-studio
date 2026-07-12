import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IconCropModal } from '@/pages/Voices/components/metadata/IconCropModal';

function makeFile(name = 'photo.png', type = 'image/png') {
  return new File(['fake-bytes'], name, { type });
}

/** Fires the <img>'s load event with jsdom-unsupported naturalWidth/Height stubbed in first. */
function loadImage(img: HTMLImageElement, w: number, h: number) {
  Object.defineProperty(img, 'naturalWidth', { value: w, configurable: true });
  Object.defineProperty(img, 'naturalHeight', { value: h, configurable: true });
  fireEvent.load(img);
}

// jsdom has no createObjectURL/revokeObjectURL or canvas drawing support.
// Stubbed once for the whole file (not reverted per-test) so effect cleanup
// on unmount — which testing-library runs on its own schedule between
// tests — never calls into an undefined jsdom API.
global.URL.createObjectURL = vi.fn(() => 'blob:fake');
global.URL.revokeObjectURL = vi.fn();

describe('IconCropModal', () => {
  let drawImageSpy: ReturnType<typeof vi.fn>;
  let toBlobSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    drawImageSpy = vi.fn();
    toBlobSpy = vi.fn((cb: BlobCallback) => cb(new Blob(['cropped'], { type: 'image/png' })));

    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({ drawImage: drawImageSpy })) as any;
    HTMLCanvasElement.prototype.toBlob = toBlobSpy as any;
  });

  it('renders the crop dialog with the source image', () => {
    render(<IconCropModal file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /crop icon/i })).toBeInTheDocument();
  });

  it('produces a square PNG File via canvas on Apply, once the image has loaded', () => {
    const onCropped = vi.fn();
    const { container } = render(<IconCropModal file={makeFile()} onCancel={vi.fn()} onCropped={onCropped} />);

    const img = container.querySelector('img') as HTMLImageElement;
    loadImage(img, 800, 600);

    fireEvent.click(screen.getByRole('button', { name: /apply crop/i }));

    expect(drawImageSpy).toHaveBeenCalledTimes(1);
    expect(onCropped).toHaveBeenCalledTimes(1);
    const [croppedFile] = onCropped.mock.calls[0];
    expect(croppedFile).toBeInstanceOf(File);
    expect(croppedFile.type).toBe('image/png');
    expect(croppedFile.name).toBe('icon.png');
  });

  it('Apply is a no-op until the image has actually loaded (no dimensions yet)', () => {
    const onCropped = vi.fn();
    render(<IconCropModal file={makeFile()} onCancel={vi.fn()} onCropped={onCropped} />);

    // Button is disabled before onLoad fires.
    expect(screen.getByRole('button', { name: /apply crop/i })).toBeDisabled();
    expect(onCropped).not.toHaveBeenCalled();
  });

  it('calls onCancel when the close button is clicked', () => {
    const onCancel = vi.fn();
    render(<IconCropModal file={makeFile()} onCancel={onCancel} onCropped={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel crop/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel on Escape', () => {
    const onCancel = vi.fn();
    render(<IconCropModal file={makeFile()} onCancel={onCancel} onCropped={vi.fn()} />);

    fireEvent.keyDown(screen.getByRole('dialog', { name: /crop icon/i }), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('the zoom slider is enabled only once the image has loaded', () => {
    const { container } = render(<IconCropModal file={makeFile()} onCancel={vi.fn()} onCropped={vi.fn()} />);

    const slider = screen.getByLabelText('Zoom') as HTMLInputElement;
    expect(slider).toBeDisabled();

    const img = container.querySelector('img') as HTMLImageElement;
    loadImage(img, 800, 600);

    expect(slider).not.toBeDisabled();
  });
});
