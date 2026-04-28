import type { SpeakerProfile, Speaker, TtsEngine, VoiceEngine } from '../types';

export interface VoiceOption {
    id: string;
    name: string;
    value: string;
    is_speaker: boolean;
}

export function getVoiceProfileEngine(profile?: Pick<SpeakerProfile, 'engine'> | null): VoiceEngine | null {
    const engine = typeof profile?.engine === 'string' ? profile.engine.trim().toLowerCase() : '';
    return engine || null;
}

export function formatVoiceEngineLabel(engine?: string | null): string {
    const normalized = (engine || '').trim();
    if (!normalized) return 'Unavailable';
    if (normalized === 'xtts') return 'XTTS';
    if (normalized === 'voxtral') return 'Voxtral';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
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

export function isVoiceProfileSelectable(profile: SpeakerProfile, engines?: TtsEngine[]): boolean {
    if (!engines || engines.length === 0) {
        return true;
    }
    const engineId = getVoiceProfileEngine(profile);
    if (!engineId) {
        return true;
    }
    const matchingEngine = engines.find(engine => engine.engine_id === engineId);
    if (!matchingEngine) {
        return false;
    }
    return Boolean(matchingEngine.enabled && matchingEngine.status === 'ready');
}

export function buildVoiceOptions(speakerProfiles: SpeakerProfile[], speakers: Speaker[], engines?: TtsEngine[]): VoiceOption[] {
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
            const engineId = getVoiceProfileEngine(profile);
            const engineLabel = formatVoiceEngineLabel(engineId);
            const sameVariantCount = sortedProfiles.filter(p => getVariantDisplayName(p) === variant).length;

            let label = speaker.name;
            if (multiProfile) {
                if (variant !== 'Default') {
                    label = `${speaker.name} - ${variant}`;
                }
            }

            const statuses: string[] = [];
            if (multiProfile && (sameVariantCount > 1 || engineId === 'voxtral')) {
                statuses.push(engineLabel);
            }

            if (!isVoiceProfileSelectable(profile, engines)) {
                statuses.push('🚫 Unavailable');
            }

            if (statuses.length > 0) {
                label = `${label} (${statuses.join(', ')})`;
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
        .map(profile => {
            let label = profile.name;
            if (!isVoiceProfileSelectable(profile, engines)) {
                label = `${label} (🚫 Unavailable)`;
            }
            return {
                id: `unassigned-${profile.name}`,
                name: label,
                value: profile.name,
                is_speaker: false,
            };
        });

    return [...speakerOptions, ...orphanOptions];
}

export function getVoiceOptionLabel(
    value: string | null | undefined,
    speakerProfiles: SpeakerProfile[],
    speakers: Speaker[],
    engines?: TtsEngine[],
): string | null {
    const targetValue = (value || '').trim();
    if (!targetValue) return null;

    // Check all profiles, including filtered ones
    const profile = speakerProfiles.find(p => p.name === targetValue);
    if (profile) {
        const match = buildVoiceOptions(speakerProfiles, speakers, engines).find(option => option.value === targetValue);
        
        if (match) return match.name;
        const labelMatch = buildVoiceOptions(speakerProfiles, speakers, engines).find(option => option.name === targetValue);
        if (labelMatch) return labelMatch.name;
        
        // If profile exists but not selectable, show name with (🚫 Unavailable)
        const engineLabel = formatVoiceEngineLabel(getVoiceProfileEngine(profile));
        return engineLabel === 'Unavailable'
            ? `${targetValue} (🚫 Unavailable)`
            : `${targetValue} (🚫 Unavailable: ${engineLabel})`;
    }

    return targetValue;
}
