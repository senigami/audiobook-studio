/**
 * voicePhase.ts — R5-T2
 *
 * Pure helpers for voice phase derivation and primary CTA.
 * `getStatusInfo` moved verbatim from NarratorCard.tsx so both card and
 * catalog can share the same logic without duplication.
 */
import type { SpeakerProfile, TtsEngine } from '@/types';
import { getVoiceProfileEngine, isVoiceProfileSelectable } from '@/utils/voiceProfiles';

// ---------------------------------------------------------------------------
// getStatusInfo — moved verbatim from NarratorCard (line 87–131)
// ---------------------------------------------------------------------------

export interface StatusInfo {
    label: string;
    color: string;
    bg: string;
}

export function getStatusInfo(
    p: SpeakerProfile | undefined,
    engines: TtsEngine[],
    buildingProfiles: Record<string, boolean>,
): StatusInfo {
    if (!p) return { label: 'NO SAMPLES', color: 'var(--text-muted)', bg: 'var(--surface-alt)' };
    const engineId = getVoiceProfileEngine(p) || 'unknown';
    const engineInfo = engines.find(e => e.engine_id === engineId);
    const selectable = isVoiceProfileSelectable(p, engines);
    const hasBuildMaterial = Boolean(
        p.is_ready ||
        p.has_latent ||
        p.voice_asset_id ||
        p.reference_sample ||
        p.wav_count > 0 ||
        (p.samples?.length || 0) > 0,
    );

    if (buildingProfiles[p.name]) return { label: 'BUILDING...', color: 'var(--action-primary)', bg: 'var(--accent-glow)' };

    if (!selectable) {
        return { label: 'DISABLED', color: 'var(--text-muted)', bg: 'var(--surface-alt)' };
    }

    if (p.is_rebuild_required) {
        const isRebuildEngine = engineInfo?.capabilities?.includes('voice_build');
        const reasons = p.rebuild_reasons || [];

        if (reasons.includes('no_preview')) {
            return { label: 'BUILD TO TEST', color: 'var(--action-primary)', bg: 'var(--accent-glow)' };
        }

        let label = isRebuildEngine ? 'REBUILD REQUIRED' : 'PREVIEW STALE';
        if (reasons.includes('new_samples')) label = 'NEW SAMPLES';
        else if (reasons.includes('settings_changed')) label = 'SETTINGS CHANGED';
        else if (reasons.includes('samples_missing')) label = 'SAMPLES MISSING';

        return { label, color: 'var(--warning-text)', bg: 'var(--warning-tint-bg)' };
    }

    if (!p.preview_url) {
        if (!hasBuildMaterial) {
            return { label: 'NOT READY', color: 'var(--text-muted)', bg: 'var(--surface-alt)' };
        }
        return { label: 'BUILD TO TEST', color: 'var(--action-primary)', bg: 'var(--accent-glow)' };
    }
    return { label: 'READY', color: 'var(--success)', bg: 'var(--success-tint-bg)' };
}

// ---------------------------------------------------------------------------
// Phase type
// ---------------------------------------------------------------------------

export type VoicePhase = 'samples' | 'build' | 'building' | 'test' | 'ready';

// Status label → phase mapping
const LABEL_TO_PHASE: Record<string, VoicePhase> = {
    'NO SAMPLES': 'samples',
    'NOT READY': 'samples',
    'BUILD TO TEST': 'build',
    'NEW SAMPLES': 'build',
    'REBUILD REQUIRED': 'build',
    'SETTINGS CHANGED': 'build',
    'SAMPLES MISSING': 'build',
    // Distinct in-flight phase — kept separate from the idle "build" phase so
    // the catalog card's primary CTA can reflect the actual in-progress state
    // instead of continuing to read "Build voice" while a build is running.
    'BUILDING...': 'building',
    'PREVIEW STALE': 'test',
    'READY': 'ready',
    'DISABLED': 'ready',
};

/**
 * Derive a single phase label from the active/default profile's status.
 * Uses `getStatusInfo` on the profile that would be displayed as "active"
 * (first selectable, or first profile if none is selectable).
 */
export function getVoicePhase(
    profiles: SpeakerProfile[],
    engines: TtsEngine[],
    buildingProfiles: Record<string, boolean>,
): VoicePhase {
    if (!profiles || profiles.length === 0) return 'samples';

    // Use the default/first selectable profile for the phase
    const active =
        profiles.find(p => p.is_default && isVoiceProfileSelectable(p, engines)) ||
        profiles.find(p => isVoiceProfileSelectable(p, engines)) ||
        profiles[0];

    const status = getStatusInfo(active, engines, buildingProfiles);
    return LABEL_TO_PHASE[status.label] ?? 'samples';
}

// ---------------------------------------------------------------------------
// Primary CTA
// ---------------------------------------------------------------------------

export interface PrimaryCta {
    label: string;
    intent: 'navigate' | 'build' | 'test' | 'edit';
}

/**
 * Phase-appropriate primary CTA for the catalog card.
 */
export function getPrimaryCta(phase: VoicePhase): PrimaryCta {
    switch (phase) {
        case 'samples':
            return { label: 'Add samples', intent: 'navigate' };
        case 'build':
            return { label: 'Build voice', intent: 'build' };
        case 'building':
            return { label: 'Building…', intent: 'build' };
        case 'test':
            return { label: 'Test voice', intent: 'test' };
        case 'ready':
            return { label: 'Edit voice', intent: 'edit' };
    }
}
