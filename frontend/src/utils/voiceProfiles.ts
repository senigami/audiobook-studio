import type { SpeakerProfile } from '../types';

export function getVariantDisplayName(profile?: Pick<SpeakerProfile, 'name' | 'variant_name'> | null): string {
    if (!profile) return 'Default';
    if (profile.variant_name) return profile.variant_name;
    if (profile.name.includes(' - ')) {
        return profile.name.split(' - ').slice(1).join(' - ').trim() || 'Default';
    }
    return 'Default';
}

export function isDefaultVoiceProfile(profile?: Pick<SpeakerProfile, 'name' | 'variant_name' | 'is_default'> | null): boolean {
    if (!profile) return false;
    return profile.is_default || profile.variant_name === 'Default' || !profile.name.includes(' - ');
}

export function getDefaultVoiceProfileName(profiles: SpeakerProfile[]): string | null {
    return (
        profiles.find(isDefaultVoiceProfile)?.name ||
        profiles[0]?.name ||
        null
    );
}
