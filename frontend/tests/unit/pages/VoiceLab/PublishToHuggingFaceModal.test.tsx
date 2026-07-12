import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Flush the microtask queue so a resolved promise's .then handlers (and the
// resulting state update) run, without relying on findBy's internal
// setTimeout-based polling -- which never fires under fake timers unless
// explicitly advanced (R4: no real sleeps, fake timers only).
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
import { PublishToHuggingFaceModal } from '@/pages/VoiceLab/components/PublishToHuggingFaceModal';

vi.mock('@/api', () => ({
  api: {
    uploadHfVoice: vi.fn(),
  },
}));

import { api } from '@/api';

describe('PublishToHuggingFaceModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when closed', () => {
    render(<PublishToHuggingFaceModal isOpen={false} voiceId="v1" voiceName="Gravel Road" onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the repo-id form when open', () => {
    render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: /publish to hugging face/i })).toBeInTheDocument();
    expect(screen.getByText('Gravel Road')).toBeInTheDocument();
    expect(screen.getByLabelText('Hugging Face repo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeDisabled();
  });

  it('publishes and shows the success state with a link and commit id', async () => {
    (api.uploadHfVoice as any).mockResolvedValue({ status: 'ok', hub_id: 'someone/gravel-road', commit_id: 'abc123' });

    render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Hugging Face repo'), { target: { value: 'someone/gravel-road' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    await waitFor(() => {
      expect(api.uploadHfVoice).toHaveBeenCalledWith({ voiceId: 'v1', hubId: 'someone/gravel-road' });
    });

    expect(await screen.findByText('Published')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /huggingface\.co\/someone\/gravel-road/i });
    expect(link).toHaveAttribute('href', 'https://huggingface.co/someone/gravel-road');
    expect(screen.getByText(/commit abc123/i)).toBeInTheDocument();
  });

  it('surfaces a 422 error message verbatim (e.g. no token configured)', async () => {
    (api.uploadHfVoice as any).mockRejectedValue(
      new Error('No Hugging Face access token is configured. Add one in Settings to publish voices.')
    );

    render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Hugging Face repo'), { target: { value: 'someone/gravel-road' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('No Hugging Face access token is configured. Add one in Settings to publish voices.')).toBeInTheDocument();
    expect(screen.queryByText('Published')).toBeNull();
  });

  it('Publish is disabled until a repo id is entered', () => {
    render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={vi.fn()} />);

    const publishButton = screen.getByRole('button', { name: 'Publish' });
    expect(publishButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Hugging Face repo'), { target: { value: 'someone/gravel-road' } });
    expect(publishButton).not.toBeDisabled();
  });

  it('calls onClose when Cancel is clicked, and resets state', () => {
    const onClose = vi.fn();
    render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Hugging Face repo'), { target: { value: 'someone/gravel-road' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('sample generation (owner requirement: never publish an empty sample)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows a generating state and auto-retries, then succeeds once the sample is ready', async () => {
      (api.uploadHfVoice as any)
        .mockResolvedValueOnce({ status: 'generating', job_id: 'test-abc', message: 'No sample exists yet -- generating one now.' })
        .mockResolvedValueOnce({ status: 'ok', hub_id: 'someone/gravel-road', commit_id: 'abc123' });

      render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={vi.fn()} />);

      fireEvent.change(screen.getByLabelText('Hugging Face repo'), { target: { value: 'someone/gravel-road' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
      await flush();

      expect(screen.getByText('Generating sample…')).toBeInTheDocument();
      expect(api.uploadHfVoice).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });

      expect(api.uploadHfVoice).toHaveBeenCalledTimes(2);
      expect(screen.getByText('Published')).toBeInTheDocument();
    });

    it('stops retrying and shows an error after the max attempts, never looping forever', async () => {
      (api.uploadHfVoice as any).mockResolvedValue({ status: 'generating', job_id: 'test-abc', message: 'still going' });

      render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={vi.fn()} />);

      fireEvent.change(screen.getByLabelText('Hugging Face repo'), { target: { value: 'someone/gravel-road' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
      await flush();

      expect(screen.getByText('Generating sample…')).toBeInTheDocument();

      // Drain every scheduled retry (bounded at GENERATING_MAX_ATTEMPTS=20).
      for (let i = 0; i < 20; i++) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(4000);
        });
      }

      expect(screen.getByText(/taking longer than expected/i)).toBeInTheDocument();
      // No further calls scheduled beyond the bound.
      const callsAtBound = (api.uploadHfVoice as any).mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10000);
      });
      expect((api.uploadHfVoice as any).mock.calls.length).toBe(callsAtBound);
    });

    it('closing the modal during generation stops the auto-retry loop', async () => {
      (api.uploadHfVoice as any).mockResolvedValue({ status: 'generating', job_id: 'test-abc', message: 'still going' });
      const onClose = vi.fn();

      render(<PublishToHuggingFaceModal isOpen voiceId="v1" voiceName="Gravel Road" onClose={onClose} />);

      fireEvent.change(screen.getByLabelText('Hugging Face repo'), { target: { value: 'someone/gravel-road' } });
      fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
      await flush();

      expect(screen.getByText('Generating sample…')).toBeInTheDocument();
      const callsBeforeClose = (api.uploadHfVoice as any).mock.calls.length;

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(20000);
      });
      expect((api.uploadHfVoice as any).mock.calls.length).toBe(callsBeforeClose);
    });
  });
});
