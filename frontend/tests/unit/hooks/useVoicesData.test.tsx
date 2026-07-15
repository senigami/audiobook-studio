/**
 * useVoicesData.test.tsx
 *
 * Regression test for the "All" filter-chip count discrepancy: the chip
 * counted variant profiles (speaker_profiles rows) instead of distinct
 * voices/speakers, so it could read "All (10)" while the grid rendered only
 * 5 voice cards (one card per speaker, grouping all of that speaker's
 * variant profiles together).
 */
import { renderHook } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useVoicesData } from '@/hooks/useVoicesData';
import type { Speaker, SpeakerProfile, TtsEngine } from '@/types';

describe('useVoicesData', () => {
    const engines: TtsEngine[] = [];

    it('"All" chip count matches the number of voice cards rendered, not the number of variant profiles', () => {
        // 2 speakers, each with 2 variant profiles => 4 profiles, 2 voices.
        const speakers: Speaker[] = [
            { id: 's1', name: 'Alice', default_profile_name: 'Alice - Default', created_at: 0, updated_at: 0 },
            { id: 's2', name: 'Bob', default_profile_name: 'Bob - Default', created_at: 0, updated_at: 0 },
        ];
        const activeSpeakerProfiles: SpeakerProfile[] = [
            { name: 'Alice - Default', wav_count: 1, speed: 1, is_default: true, speaker_id: 's1', variant_name: 'Default', preview_url: null },
            { name: 'Alice - Alt', wav_count: 1, speed: 1, is_default: false, speaker_id: 's1', variant_name: 'Alt', preview_url: null },
            { name: 'Bob - Default', wav_count: 1, speed: 1, is_default: true, speaker_id: 's2', variant_name: 'Default', preview_url: null },
            { name: 'Bob - Alt', wav_count: 1, speed: 1, is_default: false, speaker_id: 's2', variant_name: 'Alt', preview_url: null },
        ] as SpeakerProfile[];

        const { result } = renderHook(() => useVoicesData({
            speakers,
            activeSpeakerProfiles,
            disabledSpeakerProfiles: [],
            engines,
            searchQuery: '',
            engineFilter: 'all',
            exportVoiceName: null,
        }));

        // Grid renders one card per voice group (speaker), not per profile.
        expect(result.current.activeVoices).toHaveLength(2);

        const allOption = result.current.engineFilterOptions.find(o => o.key === 'all');
        expect(allOption?.label).toBe('All (2)');
    });
});
