import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceDropzone } from './VoiceDropzone';

describe('VoiceDropzone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    
    // Mock Audio
    global.Audio = vi.fn().mockImplementation(function(this: any) {
      const self = this;
      self.duration = 10;
      setTimeout(() => {
        if (self.onloadedmetadata) self.onloadedmetadata();
      }, 10);
      return self;
    }) as any;

    // Mock alert
    global.alert = vi.fn();
  });

  it('renders correctly', () => {
    render(<VoiceDropzone onFilesChange={vi.fn()} />);
    expect(screen.getByText(/Drop audio samples here/i)).toBeInTheDocument();
  });

  it('handles file selection via input', async () => {
    const onFilesChange = vi.fn();
    const { container } = render(<VoiceDropzone onFilesChange={onFilesChange} />);
    
    const file = new File(['audio'], 'test.wav', { type: 'audio/wav' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(screen.getByText('test.wav')).toBeInTheDocument();
    }, { timeout: 2000 });
    
    expect(onFilesChange).toHaveBeenCalledWith([file]);
  });

  it('handles drag and drop', async () => {
    const onFilesChange = vi.fn();
    render(<VoiceDropzone onFilesChange={onFilesChange} />);
    
    const dropzone = screen.getByText(/Drop audio samples here/i).closest('div')!;
    const file = new File(['audio'], 'dragged.wav', { type: 'audio/wav' });
    
    fireEvent.dragOver(dropzone);
    expect(screen.getByText(/Drop to Upload/i)).toBeInTheDocument();
    
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file]
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText('dragged.wav')).toBeInTheDocument();
    });
  });

  it('rejects non-audio files', () => {
    render(<VoiceDropzone onFilesChange={vi.fn()} />);
    const dropzone = screen.getByText(/Drop audio samples here/i).closest('div')!;
    const file = new File(['text'], 'test.txt', { type: 'text/plain' });
    
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file]
      }
    });

    expect(global.alert).toHaveBeenCalledWith(expect.stringContaining('1 file was ignored'));
  });

  it('shows warning for short files', async () => {
    (global.Audio as any).mockImplementation(function(this: any) {
      const self = this;
      self.duration = 1; // 1 second
      setTimeout(() => {
        if (self.onloadedmetadata) self.onloadedmetadata();
      }, 10);
      return self;
    });

    const onFilesChange = vi.fn();
    const { container } = render(<VoiceDropzone onFilesChange={onFilesChange} />);
    
    const file = new File(['audio'], 'short.wav', { type: 'audio/wav' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });
    
    await waitFor(() => {
      expect(screen.getByTitle(/Too short/i)).toBeInTheDocument();
    });
  });

  it('removes a file when clicking X', async () => {
    const onFilesChange = vi.fn();
    const { container } = render(<VoiceDropzone onFilesChange={onFilesChange} />);
    
    const file = new File(['audio'], 'toremove.wav', { type: 'audio/wav' });
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    
    fireEvent.change(input, { target: { files: [file] } });
    
    const removeBtn = await screen.findByRole('button', { name: '' }); // The X btn
    fireEvent.click(removeBtn);

    await waitFor(() => {
      expect(screen.queryByText('toremove.wav')).not.toBeInTheDocument();
    });
    expect(onFilesChange).toHaveBeenLastCalledWith([]);
  });
});
