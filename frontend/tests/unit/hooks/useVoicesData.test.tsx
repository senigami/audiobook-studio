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
import type { Speaker, SpeakerProfile, TtsEngine, VoiceMetadata } from '@/types';

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

    // ---------------------------------------------------------------------------
    // Array-based class/gender/age/tag filters — task 005 (catalog filter bar):
    // OR-within-facet (any selected value in a facet matches), AND-across-facets
    // (class/gender/age/tags/search/engine must all match).
    // ---------------------------------------------------------------------------
    describe('OR-within-facet / AND-across-facets filter semantics', () => {
        const speakers: Speaker[] = [
            { id: 's1', name: 'Alice', default_profile_name: 'Alice - Default', created_at: 0, updated_at: 0 },
            { id: 's2', name: 'Bob', default_profile_name: 'Bob - Default', created_at: 0, updated_at: 0 },
            { id: 's3', name: 'Rex', default_profile_name: 'Rex - Default', created_at: 0, updated_at: 0 },
        ];
        const activeSpeakerProfiles: SpeakerProfile[] = [
            { name: 'Alice - Default', wav_count: 1, speed: 1, is_default: true, speaker_id: 's1', variant_name: 'Default', preview_url: null },
            { name: 'Bob - Default', wav_count: 1, speed: 1, is_default: true, speaker_id: 's2', variant_name: 'Default', preview_url: null },
            { name: 'Rex - Default', wav_count: 1, speed: 1, is_default: true, speaker_id: 's3', variant_name: 'Default', preview_url: null },
        ] as SpeakerProfile[];
        const voiceMetadataMap = new Map<string, VoiceMetadata>([
            ['s1', { id: 's1', name: 'Alice', is_untagged: false, attributes: { class: 'human', gender: 'feminine', age: 'adult' }, tags: ['raspy'] }],
            ['s2', { id: 's2', name: 'Bob', is_untagged: false, attributes: { class: 'human', gender: 'masculine', age: 'adult' }, tags: ['warm'] }],
            ['s3', { id: 's3', name: 'Rex', is_untagged: false, attributes: { class: 'creature', gender: 'not-applicable', age: 'ageless' }, tags: ['raspy', 'gravelly'] }],
        ]);

        it('OR-within class facet: selecting human + creature matches either', () => {
            const { result } = renderHook(() => useVoicesData({
                speakers, activeSpeakerProfiles, disabledSpeakerProfiles: [], engines,
                searchQuery: '', engineFilter: 'all', exportVoiceName: null,
                voiceMetadataMap, classFilter: ['human', 'creature'],
            }));
            expect(result.current.filteredVoices.map(v => v.name).sort()).toEqual(['Alice', 'Bob', 'Rex']);
        });

        it('AND-across facets: class + gender narrows to voices matching both', () => {
            const { result } = renderHook(() => useVoicesData({
                speakers, activeSpeakerProfiles, disabledSpeakerProfiles: [], engines,
                searchQuery: '', engineFilter: 'all', exportVoiceName: null,
                voiceMetadataMap, classFilter: ['human'], genderFilter: ['masculine'],
            }));
            expect(result.current.filteredVoices.map(v => v.name)).toEqual(['Bob']);
        });

        it('tag filter is OR-within and AND-across with the other facets', () => {
            const { result } = renderHook(() => useVoicesData({
                speakers, activeSpeakerProfiles, disabledSpeakerProfiles: [], engines,
                searchQuery: '', engineFilter: 'all', exportVoiceName: null,
                voiceMetadataMap, tagFilter: ['raspy', 'gravelly'],
            }));
            expect(result.current.filteredVoices.map(v => v.name).sort()).toEqual(['Alice', 'Rex']);
        });

        it('combining class filter with tag filter is AND-across', () => {
            const { result } = renderHook(() => useVoicesData({
                speakers, activeSpeakerProfiles, disabledSpeakerProfiles: [], engines,
                searchQuery: '', engineFilter: 'all', exportVoiceName: null,
                voiceMetadataMap, classFilter: ['creature'], tagFilter: ['raspy'],
            }));
            expect(result.current.filteredVoices.map(v => v.name)).toEqual(['Rex']);
        });

        it('empty filter arrays match everything (no facet applied)', () => {
            const { result } = renderHook(() => useVoicesData({
                speakers, activeSpeakerProfiles, disabledSpeakerProfiles: [], engines,
                searchQuery: '', engineFilter: 'all', exportVoiceName: null,
                voiceMetadataMap, classFilter: [], genderFilter: [], ageFilter: [], tagFilter: [],
            }));
            expect(result.current.filteredVoices.map(v => v.name).sort()).toEqual(['Alice', 'Bob', 'Rex']);
        });
    });
});
