/**
 * voicePhase.test.ts — R5-T2
 * Table-driven unit tests covering every getStatusInfo/getVoicePhase/getPrimaryCta branch.
 * Does NOT mock voicePhase itself (R2 rule).
 */
import { describe, it, expect } from 'vitest';
import { getStatusInfo, getVoicePhase, getPrimaryCta } from '@/pages/Voices/voicePhase';
import type { SpeakerProfile, TtsEngine } from '@/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const readyEngine: TtsEngine = {
    engine_id: 'xtts',
    enabled: true,
    status: 'ready',
    display_name: 'XTTS',
    verified: false,
    capabilities: ['voice_build'],
} as TtsEngine;

const disabledEngine: TtsEngine = {
    engine_id: 'disabled_engine',
    enabled: false,
    status: 'not_ready',
    display_name: 'Disabled',
    verified: false,
    capabilities: [],
} as TtsEngine;

const baseProfile: SpeakerProfile = {
    name: 'Voice - Default',
    wav_count: 0,
    speed: 1.0,
    is_default: true,
    speaker_id: 'sp-1',
    variant_name: 'Default',
    engine: 'xtts',
    preview_url: null,
    is_rebuild_required: false,
    rebuild_reasons: [],
    is_ready: false,
    has_latent: false,
    voice_asset_id: null,
    reference_sample: null,
    samples: [],
};

const noBuildMaterial: SpeakerProfile = { ...baseProfile, wav_count: 0, samples: [] };
const hasBuildMaterial: SpeakerProfile = { ...baseProfile, wav_count: 3 };
const hasPreview: SpeakerProfile = { ...baseProfile, wav_count: 3, preview_url: '/preview.mp3' };

// ---------------------------------------------------------------------------
// getStatusInfo — table driven
// ---------------------------------------------------------------------------

describe('getStatusInfo', () => {
    const engines = [readyEngine];
    const building: Record<string, boolean> = {};

    it('returns NO SAMPLES for undefined profile', () => {
        expect(getStatusInfo(undefined, engines, building).label).toBe('NO SAMPLES');
    });

    it('returns NOT READY when no build material and no preview', () => {
        expect(getStatusInfo(noBuildMaterial, engines, building).label).toBe('NOT READY');
    });

    it('returns BUILD TO TEST when has build material but no preview', () => {
        expect(getStatusInfo(hasBuildMaterial, engines, building).label).toBe('BUILD TO TEST');
    });

    it('returns READY when preview_url is present', () => {
        expect(getStatusInfo(hasPreview, engines, building).label).toBe('READY');
    });

    it('returns BUILDING... when profile is in buildingProfiles', () => {
        const b = { 'Voice - Default': true };
        expect(getStatusInfo(hasBuildMaterial, engines, b).label).toBe('BUILDING...');
    });

    it('returns DISABLED when engine is not selectable', () => {
        const profile: SpeakerProfile = { ...hasPreview, engine: 'disabled_engine' };
        expect(getStatusInfo(profile, [disabledEngine], building).label).toBe('DISABLED');
    });

    it('returns NEW SAMPLES when rebuild reason is new_samples', () => {
        const profile: SpeakerProfile = {
            ...hasPreview,
            is_rebuild_required: true,
            rebuild_reasons: ['new_samples'],
        };
        expect(getStatusInfo(profile, engines, building).label).toBe('NEW SAMPLES');
    });

    it('returns SETTINGS CHANGED when rebuild reason is settings_changed', () => {
        const profile: SpeakerProfile = {
            ...hasPreview,
            is_rebuild_required: true,
            rebuild_reasons: ['settings_changed'],
        };
        expect(getStatusInfo(profile, engines, building).label).toBe('SETTINGS CHANGED');
    });

    it('returns SAMPLES MISSING when rebuild reason is samples_missing', () => {
        const profile: SpeakerProfile = {
            ...hasPreview,
            is_rebuild_required: true,
            rebuild_reasons: ['samples_missing'],
        };
        expect(getStatusInfo(profile, engines, building).label).toBe('SAMPLES MISSING');
    });

    it('returns REBUILD REQUIRED for build-capable engine with no specific reason', () => {
        const profile: SpeakerProfile = {
            ...hasPreview,
            is_rebuild_required: true,
            rebuild_reasons: [],
        };
        expect(getStatusInfo(profile, engines, building).label).toBe('REBUILD REQUIRED');
    });

    it('returns PREVIEW STALE for non-build engine', () => {
        const nonBuildEngine: TtsEngine = { ...readyEngine, capabilities: [] };
        const profile: SpeakerProfile = {
            ...hasPreview,
            is_rebuild_required: true,
            rebuild_reasons: [],
        };
        expect(getStatusInfo(profile, [nonBuildEngine], building).label).toBe('PREVIEW STALE');
    });

    it('returns BUILD TO TEST when rebuild reason is no_preview', () => {
        const profile: SpeakerProfile = {
            ...baseProfile,
            is_rebuild_required: true,
            rebuild_reasons: ['no_preview'],
        };
        expect(getStatusInfo(profile, engines, building).label).toBe('BUILD TO TEST');
    });
});

// ---------------------------------------------------------------------------
// getVoicePhase
// ---------------------------------------------------------------------------

describe('getVoicePhase', () => {
    const engines = [readyEngine];
    const building: Record<string, boolean> = {};

    it('returns "samples" for empty profiles', () => {
        expect(getVoicePhase([], engines, building)).toBe('samples');
    });

    it('returns "samples" for NOT READY profile', () => {
        expect(getVoicePhase([noBuildMaterial], engines, building)).toBe('samples');
    });

    it('returns "build" for BUILD TO TEST profile', () => {
        expect(getVoicePhase([hasBuildMaterial], engines, building)).toBe('build');
    });

    it('returns "building" for BUILDING... profile (distinct in-flight phase, not the idle "build" phase)', () => {
        const b = { 'Voice - Default': true };
        expect(getVoicePhase([hasBuildMaterial], engines, b)).toBe('building');
    });

    it('returns "test" for PREVIEW STALE profile', () => {
        const nonBuildEngine: TtsEngine = { ...readyEngine, capabilities: [] };
        const profile: SpeakerProfile = {
            ...hasPreview,
            is_rebuild_required: true,
            rebuild_reasons: [],
        };
        expect(getVoicePhase([profile], [nonBuildEngine], building)).toBe('test');
    });

    it('returns "ready" for READY profile', () => {
        expect(getVoicePhase([hasPreview], engines, building)).toBe('ready');
    });

    it('returns "ready" for DISABLED profile', () => {
        const profile: SpeakerProfile = { ...hasPreview, engine: 'disabled_engine' };
        expect(getVoicePhase([profile], [disabledEngine], building)).toBe('ready');
    });
});

// ---------------------------------------------------------------------------
// getPrimaryCta
// ---------------------------------------------------------------------------

describe('getPrimaryCta', () => {
    it('returns "Add samples" for samples phase', () => {
        const cta = getPrimaryCta('samples');
        expect(cta.label).toBe('Add samples');
        expect(cta.intent).toBe('navigate');
    });

    it('returns "Build voice" for build phase', () => {
        const cta = getPrimaryCta('build');
        expect(cta.label).toBe('Build voice');
        expect(cta.intent).toBe('build');
    });

    it('returns "Building…" for the in-flight building phase', () => {
        const cta = getPrimaryCta('building');
        expect(cta.label).toBe('Building…');
        expect(cta.intent).toBe('build');
    });

    it('returns "Test voice" for test phase', () => {
        const cta = getPrimaryCta('test');
        expect(cta.label).toBe('Test voice');
        expect(cta.intent).toBe('test');
    });

    it('returns "Edit voice" for ready phase', () => {
        const cta = getPrimaryCta('ready');
        expect(cta.label).toBe('Edit voice');
        expect(cta.intent).toBe('edit');
    });
});
