import type { SpeakerProfile, Speaker } from '../types';

export interface VoiceOption {
    id: string;
    name: string;
    value: string;
    is_speaker: boolean;
}

export function getVariantDisplayName(profile?: Pick<SpeakerProfile, 'name' | 'variant_name'> | null): string {
    if (!profile) return 'Default';
    if (profile.variant_name) return profile.variant_name;
    const profileName = typeof profile.name === 'string' ? profile.name : '';
    if (profileName.includes(' - ')) {
        return profileName.split(' - ').slice(1).join(' - ').trim() || 'Default';
    }
    return 'Default';
}

export function isDefaultVoiceProfile(profile?: Pick<SpeakerProfile, 'name' | 'variant_name' | 'is_default'> | null): boolean {
    if (!profile) return false;
    const profileName = typeof profile.name === 'string' ? profile.name : '';
    return profile.is_default || profile.variant_name === 'Default' || !profileName.includes(' - ');
}

export function getDefaultVoiceProfileName(profiles: SpeakerProfile[]): string | null {
    return (
        profiles.find(isDefaultVoiceProfile)?.name ||
        profiles[0]?.name ||
        null
    );
}

export function buildVoiceOptions(speakerProfiles: SpeakerProfile[], speakers: Speaker[]): VoiceOption[] {
    const speakerMap = new Map(speakers.map(speaker => [speaker.id, speaker]));
    const groupedProfiles = new Map<string, SpeakerProfile[]>();

    for (const profile of speakerProfiles || []) {
        const speakerId = profile.speaker_id || '';
        if (!speakerId) continue;
        const group = groupedProfiles.get(speakerId) || [];
        group.push(profile);
        groupedProfiles.set(speakerId, group);
    }

    const speakerOptions: VoiceOption[] = [];
    for (const [speakerId, profiles] of groupedProfiles.entries()) {
        const speaker = speakerMap.get(speakerId);
        if (!speaker) continue;
        const sortedProfiles = [...profiles].sort((a, b) => a.name.localeCompare(b.name));
        const multiProfile = sortedProfiles.length > 1;

        for (const profile of sortedProfiles) {
            const variant = getVariantDisplayName(profile);
            const engineLabel = (profile.engine || 'xtts').toUpperCase();
            const sameVariantCount = sortedProfiles.filter(p => getVariantDisplayName(p) === variant).length;

            let label = speaker.name;
            if (multiProfile) {
                if (variant !== 'Default') {
                    label = `${speaker.name} - ${variant}`;
                }
                if (sameVariantCount > 1 || profile.engine === 'voxtral') {
                    label = `${label} (${engineLabel})`;
                }
            }

            speakerOptions.push({
                id: `${speakerId}-${profile.name}`,
                name: label,
                value: profile.name,
                is_speaker: true,
            });
        }
    }

    const orphanOptions: VoiceOption[] = (speakerProfiles || [])
        .filter(profile => !profile.speaker_id || !speakerMap.has(profile.speaker_id))
        .map(profile => ({
            id: `unassigned-${profile.name}`,
            name: profile.name,
            value: profile.name,
            is_speaker: false,
        }));

    return [...speakerOptions, ...orphanOptions];
}

export function getVoiceOptionLabel(
    value: string | null | undefined,
    speakerProfiles: SpeakerProfile[],
    speakers: Speaker[],
): string | null {
    const targetValue = (value || '').trim();
    if (!targetValue) return null;

    const match = buildVoiceOptions(speakerProfiles, speakers).find(option => option.value === targetValue);
    return match?.name || targetValue;
}
