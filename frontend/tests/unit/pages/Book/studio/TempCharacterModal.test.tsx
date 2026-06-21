import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TempCharacterModal } from '@/pages/Book/studio/TempCharacterModal';
import type { VoiceOption } from '@/utils/voiceProfiles';

const voices: VoiceOption[] = [
  { id: 'v1', name: 'Voice One', value: 'Voice One', is_speaker: false },
];

describe('TempCharacterModal', () => {
  it('typing a name, selecting a voice and clicking Create calls onCreate', () => {
    const onCreate = vi.fn();
    render(
      <TempCharacterModal
        isOpen
        onClose={vi.fn()}
        availableVoices={voices}
        onCreate={onCreate}
      />
    );

    const nameInput = screen.getByPlaceholderText('e.g. Innkeeper');
    fireEvent.change(nameInput, { target: { value: 'Innkeeper' } });

    fireEvent.change(screen.getByLabelText('Voice'), { target: { value: 'Voice One' } });

    fireEvent.click(screen.getByRole('button', { name: /create/i }));
    expect(onCreate).toHaveBeenCalledWith('Innkeeper', 'Voice One');
  });

  it('Create button is disabled when name is empty', () => {
    render(
      <TempCharacterModal
        isOpen
        onClose={vi.fn()}
        availableVoices={voices}
        onCreate={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: /create/i })).toBeDisabled();
  });

  it('pressing Enter in the name input with a non-empty name calls onCreate', () => {
    const onCreate = vi.fn();
    render(
      <TempCharacterModal
        isOpen
        onClose={vi.fn()}
        availableVoices={voices}
        onCreate={onCreate}
      />
    );

    const nameInput = screen.getByPlaceholderText('e.g. Innkeeper');
    fireEvent.change(nameInput, { target: { value: 'Bard' } });
    fireEvent.keyDown(nameInput, { key: 'Enter', code: 'Enter' });
    expect(onCreate).toHaveBeenCalledWith('Bard', '');
  });

  it('returns null when isOpen is false', () => {
    const { container } = render(
      <TempCharacterModal
        isOpen={false}
        onClose={vi.fn()}
        availableVoices={voices}
        onCreate={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});
