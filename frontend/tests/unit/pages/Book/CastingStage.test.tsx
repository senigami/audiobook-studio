import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CastingStage } from '@/pages/Book/stages/CastingStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import type { SpeakerProfile, TtsEngine } from '@/types';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/components/CharactersTab', () => ({
  CharactersTab: () => <section aria-label="Character roster">Characters & Voices</section>,
}));

const profiles: SpeakerProfile[] = [
  {
    name: 'Narrator',
    wav_count: 1,
    speed: 1,
    is_default: true,
    engine: 'xtts',
  },
  {
    name: 'Alternate',
    wav_count: 1,
    speed: 1,
    is_default: false,
    engine: 'xtts',
  },
];

const engines: TtsEngine[] = [
  {
    engine_id: 'xtts',
    display_name: 'XTTS',
    status: 'ready',
    verified: true,
    enabled: true,
    version: '1',
    local: true,
    cloud: false,
    network: false,
    languages: ['en'],
    capabilities: [],
    resource: {},
    author: '',
    homepage: '',
    settings_schema: {},
  },
];

describe('CastingStage', () => {
  const handleProjectVoiceChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useBookDataContext).mockReturnValue({
      actions: {
        handleProjectVoiceChange,
      },
      bookId: 'book-1',
      effectiveProjectVoice: 'Narrator',
      engines,
      mergedVoices: profiles.map((profile) => ({
        id: profile.name,
        name: profile.name,
        value: profile.name,
        is_speaker: false,
      })),
      projectDefaultVoiceLabel: 'Default Speaker (Narrator)',
      projectVoiceStatus: { enabled: true, message: null },
      speakerProfiles: profiles,
      speakers: [],
    } as any);
  });

  it('renders the pinned Narrator row before the character roster and updates the project default voice', () => {
    render(<CastingStage />);

    const narratorRow = screen.getByLabelText('Narrator default voice');
    expect(within(narratorRow).getByText('Narrator (default)')).toBeInTheDocument();
    expect(within(narratorRow).getByText('fallback for any unassigned line')).toBeInTheDocument();

    const roster = screen.getByRole('region', { name: 'Character roster' });
    expect(narratorRow.compareDocumentPosition(roster) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    fireEvent.change(within(narratorRow).getByRole('combobox'), { target: { value: 'Alternate' } });
    expect(handleProjectVoiceChange).toHaveBeenCalledWith('Alternate');
  });

  it('surfaces the project voice engine warning when unavailable', () => {
    vi.mocked(useBookDataContext).mockReturnValue({
      actions: { handleProjectVoiceChange },
      bookId: 'book-1',
      effectiveProjectVoice: 'Missing',
      engines,
      mergedVoices: [],
      projectDefaultVoiceLabel: 'Default Speaker',
      projectVoiceStatus: { enabled: false, message: 'XTTS is disabled.' },
      speakerProfiles: profiles,
      speakers: [],
    } as any);

    render(<CastingStage />);

    expect(screen.getByRole('alert')).toHaveTextContent('Project Default Voice Engine Unavailable');
    expect(screen.getByRole('alert')).toHaveTextContent('XTTS is disabled.');
  });
});
