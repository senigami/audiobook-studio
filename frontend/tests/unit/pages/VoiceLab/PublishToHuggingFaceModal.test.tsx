import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
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
});
