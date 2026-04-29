import { describe, it, expect } from 'vitest';
import { buildVoiceOptions } from './voiceProfiles';
import type { SpeakerProfile, Speaker, Character, TtsEngine } from '../types';

describe('voiceProfiles - buildVoiceOptions grouping', () => {
  const mockProfiles: SpeakerProfile[] = [
    { name: 'V1', speaker_id: 's1', is_default: true } as any,
    { name: 'V2', speaker_id: 's2', is_default: false } as any,
    { name: 'Orphan1' } as any,
  ];

  const mockSpeakers: Speaker[] = [
    { id: 's1', name: 'Speaker 1' } as any,
    { id: 's2', name: 'Speaker 2' } as any,
  ];

  const mockEngines: TtsEngine[] = [
    { engine_id: 'xtts', enabled: true, status: 'ready' } as any,
  ];

  it('returns a flat list when no characters are provided', () => {
    const options = buildVoiceOptions(mockProfiles, mockSpeakers, mockEngines);
    // Should have 3 options: Speaker 1, Speaker 2, Orphan1
    expect(options.length).toBe(3);
    expect(options.map(o => o.name)).toContain('Speaker 1');
    expect(options.map(o => o.name)).toContain('Speaker 2');
    expect(options.map(o => o.name)).toContain('Orphan1');
    // No separator
    expect(options.find(o => o.id === 'separator-line')).toBeUndefined();
  });

  it('prioritizes character-assigned voices and adds a separator', () => {
    const characters: Character[] = [
      { name: 'Wizard', speaker_profile_name: 'V2' } as any,
    ];

    const options = buildVoiceOptions(mockProfiles, mockSpeakers, mockEngines, characters);

    // Order should be: Speaker 2, Separator, Speaker 1, Orphan1
    expect(options.length).toBe(4);
    expect(options[0].name).toBe('Wizard');
    expect(options[1].id).toBe('separator-line');
    expect(options[2].name).toBe('Speaker 1');
    expect(options[3].name).toBe('Orphan1');
  });

  it('works with orphan voices assigned to characters', () => {
    const characters: Character[] = [
      { name: 'Narrator', speaker_profile_name: 'Orphan1' } as any,
    ];

    const options = buildVoiceOptions(mockProfiles, mockSpeakers, mockEngines, characters);

    // Order should be: Orphan1, Separator, Speaker 1, Speaker 2
    expect(options.length).toBe(4);
    expect(options[0].name).toBe('Narrator');
    expect(options[1].id).toBe('separator-line');
    expect(options[2].name).toBe('Speaker 1');
    expect(options[3].name).toBe('Speaker 2');
  });

  it('shows no separator if all voices are assigned', () => {
    const characters: Character[] = [
      { name: 'Wizard', speaker_profile_name: 'V1' } as any,
      { name: 'Witch', speaker_profile_name: 'V2' } as any,
      { name: 'Elf', speaker_profile_name: 'Orphan1' } as any,
    ];

    const options = buildVoiceOptions(mockProfiles, mockSpeakers, mockEngines, characters);

    expect(options.length).toBe(3);
    expect(options.find(o => o.id === 'separator-line')).toBeUndefined();
  });

  it('shows no separator if no voices are assigned', () => {
    const characters: Character[] = [
      { name: 'Wizard', speaker_profile_name: 'Unknown' } as any,
    ];

    const options = buildVoiceOptions(mockProfiles, mockSpeakers, mockEngines, characters);

    expect(options.length).toBe(3);
    expect(options.find(o => o.id === 'separator-line')).toBeUndefined();
  });

  it('appends 🚫 to assigned voices if they are disabled', () => {
    const characters: Character[] = [
      { name: 'Wizard', speaker_profile_name: 'V1' } as any,
    ];
    // Disable all engines so V1 becomes disabled
    const disabledEngines: TtsEngine[] = [
      { engine_id: 'xtts', enabled: false, status: 'ready' } as any,
    ];
    
    const options = buildVoiceOptions(mockProfiles, mockSpeakers, disabledEngines, characters);
    
    expect(options[0].name).toBe('Wizard 🚫');
    expect(options[0].disabled).toBe(true);
  });
});
