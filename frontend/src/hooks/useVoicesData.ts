import { useMemo, useCallback } from 'react';
import type { Speaker, SpeakerProfile, VoiceEngine, TtsEngine, VoiceMetadata } from '@/types';
import { formatVoiceEngineLabel, getVariantDisplayName, getVoiceProfileEngine } from '@/utils/voiceProfiles';

interface UseVoicesDataProps {
    speakers: Speaker[];
    activeSpeakerProfiles: SpeakerProfile[];
    disabledSpeakerProfiles: SpeakerProfile[];
    engines: TtsEngine[];
    searchQuery: string;
    engineFilter: 'all' | 'disabled' | VoiceEngine;
    exportVoiceName: string | null;
    voiceMetadataMap?: Map<string, VoiceMetadata>;
    classFilter?: string[];
    genderFilter?: string[];
    ageFilter?: string[];
    tagFilter?: string[];
}

export function useVoicesData({
    speakers,
    activeSpeakerProfiles,
    disabledSpeakerProfiles,
    engines,
    searchQuery,
    engineFilter,
    exportVoiceName,
    voiceMetadataMap,
    classFilter = [],
    genderFilter = [],
    ageFilter = [],
    tagFilter = [],
}: UseVoicesDataProps) {
    const buildVoiceGroups = useCallback((profiles: SpeakerProfile[]) => {
        const groupedVoices = (speakers || []).map(speaker => {
            const pList = profiles.filter(p => p.speaker_id === speaker.id);
            if (pList.length === 0) return null;
            return {
                id: speaker.id,
                name: speaker.name,
                profiles: pList
            };
        }).filter(Boolean) as Array<{ id: string; name: string; profiles: SpeakerProfile[] }>;

        const unassigned = profiles.filter(p => !p.speaker_id || !speakers.some(s => s.id === p.speaker_id));
        const unassignedGroups: Record<string, SpeakerProfile[]> = {};
        unassigned.forEach(p => {
            let groupKey = p.speaker_id || '';
            const looksLikeUuid = groupKey.length === 36 && groupKey.includes('-');
            if (!groupKey || looksLikeUuid) {
                groupKey = p.name.includes(' - ') ? p.name.split(' - ')[0] : p.name.split('_')[0];
            }
            if (!unassignedGroups[groupKey]) unassignedGroups[groupKey] = [];
            unassignedGroups[groupKey].push(p);
        });

        const unassignedVoices = Object.entries(unassignedGroups).map(([groupKey, groupedProfiles]) => ({
            id: `unassigned-${groupKey}`,
            name: groupKey,
            profiles: groupedProfiles,
            isUnassigned: true
        }));

        return [...groupedVoices, ...unassignedVoices];
    }, [speakers]);

    const activeVoices = useMemo(() => buildVoiceGroups(activeSpeakerProfiles), [buildVoiceGroups, activeSpeakerProfiles]);
    const disabledVoices = useMemo(() => buildVoiceGroups(disabledSpeakerProfiles), [buildVoiceGroups, disabledSpeakerProfiles]);
    
    const allVoices = activeVoices;
    
    const exportVoiceOptions = useMemo(() => {
        const options = activeVoices
            .filter(voice => !(voice as any).isUnassigned)
            .map(voice => ({
                value: voice.name,
                label: voice.name
            }))
            .filter((option, index, self) => self.findIndex(candidate => candidate.value === option.value) === index);
        
        if (exportVoiceName && !options.some(option => option.value === exportVoiceName)) {
            options.unshift({
                value: exportVoiceName,
                label: exportVoiceName
            });
        }
        return options;
    }, [activeVoices, exportVoiceName]);

    const voices = engineFilter === 'disabled' ? disabledVoices : activeVoices;

    const filteredVoices = useMemo(() => {
        return voices.filter(v => {
            const query = searchQuery.toLowerCase();
            const meta = voiceMetadataMap?.get(v.id);
            const matchesSearch = query === '' || (
                v.name.toLowerCase().includes(query) ||
                v.profiles.some((p: SpeakerProfile) => getVariantDisplayName(p).toLowerCase().includes(query)) ||
                (meta?.description?.toLowerCase().includes(query) ?? false) ||
                (meta?.tags?.some(t => t.toLowerCase().includes(query)) ?? false)
            );
            const matchesEngine = engineFilter === 'all' || engineFilter === 'disabled' || v.profiles.some((p: SpeakerProfile) => getVoiceProfileEngine(p) === engineFilter);
            const attrs = meta?.attributes;
            // OR-within-facet (any selected value in a facet matches), AND-across-facets
            // (search/engine/class/gender/age/tags must all match) — task 005.
            const matchesClass = classFilter.length === 0 || (attrs?.class ? classFilter.includes(attrs.class) : false);
            const matchesGender = genderFilter.length === 0 || (attrs?.gender ? genderFilter.includes(attrs.gender) : false);
            const matchesAge = ageFilter.length === 0 || (attrs?.age ? ageFilter.includes(attrs.age) : false);
            const matchesTags = tagFilter.length === 0 || (meta?.tags?.some(t => tagFilter.includes(t)) ?? false);
            return matchesSearch && matchesEngine && matchesClass && matchesGender && matchesAge && matchesTags;
        }).sort((a, b) => a.name.localeCompare(b.name));
    }, [voices, searchQuery, engineFilter, voiceMetadataMap, classFilter, genderFilter, ageFilter, tagFilter]);

    const engineFilterOptions = useMemo(() => {
        const engineCounts = activeSpeakerProfiles.reduce((acc, profile) => {
            const engine = getVoiceProfileEngine(profile) || 'unknown';
            acc[engine] = (acc[engine] || 0) + 1;
            return acc;
        }, {} as Record<string, number>);

        const disabledCount = disabledSpeakerProfiles.length;

        return [
            // "All" mirrors the grid, which renders one card per voice group
            // (speaker), not one per variant profile — count activeVoices,
            // not the flat profile list, or this chip overcounts whenever a
            // voice has more than one variant.
            { key: 'all' as const, label: `All (${activeVoices.length})` },
            ...engines.filter(e => e.enabled && e.status === 'ready').map(e => ({
                key: e.engine_id as VoiceEngine,
                label: `${e.display_name || formatVoiceEngineLabel(e.engine_id)} (${engineCounts[e.engine_id as VoiceEngine] || 0})`
            })),
            ...(disabledCount > 0 ? [{ key: 'disabled' as const, label: `Disabled (${disabledCount})` }] : [])
        ];
    }, [activeVoices, activeSpeakerProfiles, disabledSpeakerProfiles, engines]);

    return {
        activeVoices,
        disabledVoices,
        filteredVoices,
        engineFilterOptions,
        exportVoiceOptions,
        allVoices
    };
}
