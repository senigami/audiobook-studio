import { useState, useEffect, useCallback, useRef } from 'react';
import type { Speaker, SpeakerProfile, Job, VoiceEngine } from '../types';

export function useVoiceManagement(
    onRefresh: () => void, 
    speakerProfiles: SpeakerProfile[],
    requestConfirm: (config: { 
        title: string; 
        message: string; 
        onConfirm: () => void; 
        isDestructive?: boolean; 
        isAlert?: boolean; 
    }) => void,
    jobs: Record<string, Job> = {}
) {
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    // Map of profileName -> jobId for in-flight build jobs
    const [buildingProfiles, setBuildingProfiles] = useState<Record<string, string | true>>({});
    const hasSeenJobSnapshot = useRef(false);

    // Keep the local "building" map in sync with the authoritative jobs snapshot.
    // We preserve optimistic local entries until the server confirms completion,
    // but clear everything once an established job snapshot goes empty.
    useEffect(() => {
        const jobValues = Object.values(jobs);
        const snapshotIsEmpty = jobValues.length === 0;

        setBuildingProfiles(prev => {
            if (snapshotIsEmpty) {
                if (hasSeenJobSnapshot.current && Object.keys(prev).length > 0) {
                    return {};
                }
                return prev;
            }

            hasSeenJobSnapshot.current = true;

            const updated = { ...prev };
            let changed = false;

            for (const job of jobValues) {
                if (
                    job.engine === 'voice_build' &&
                    job.speaker_profile &&
                    (job.status === 'queued' || job.status === 'preparing' || job.status === 'running')
                ) {
                    if (updated[job.speaker_profile] !== job.id) {
                        updated[job.speaker_profile] = job.id;
                        changed = true;
                    }
                }
            }

            for (const [profileName, jobId] of Object.entries(prev)) {
                if (typeof jobId !== 'string') continue;

                const job = jobs[jobId];
                if (job && (job.status === 'done' || job.status === 'failed' || job.status === 'cancelled' || job.status === 'error')) {
                    delete updated[profileName];
                    changed = true;
                }
            }

            return changed ? updated : prev;
        });
    }, [jobs]);

    // Watch jobs map: when a tracked build job completes, clear the buildingProfiles entry
    useEffect(() => {
        setBuildingProfiles(prev => {
            const updated = { ...prev };
            let changed = false;
            for (const [profileName, jobId] of Object.entries(prev)) {
                if (typeof jobId === 'string') {
                    const job = jobs[jobId];
                    if (job && (job.status === 'done' || job.status === 'failed')) {
                        delete updated[profileName];
                        changed = true;
                        // Refresh profile list so rebuilt status is shown
                        onRefresh();
                    }
                }
            }
            return changed ? updated : prev;
        });

    }, [jobs, onRefresh]);

    const fetchSpeakers = useCallback(async () => {
        try {
            const resp = await fetch('/api/speakers', { cache: 'no-store' });
            if (resp.ok) {
                const data = await resp.json();
                if (Array.isArray(data)) {
                    setSpeakers(data);
                }
            }
        } catch (e) {
            console.error('Failed to fetch speakers', e);
        }
    }, []);

    useEffect(() => {
        fetchSpeakers();
    }, [fetchSpeakers, speakerProfiles]);

    const formatError = (err: any, fallback: string) => {
        if (!err) return fallback;
        if (err.message) return err.message;
        if (err.detail) {
            if (Array.isArray(err.detail)) {
                return err.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
            }
            return typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
        }
        return fallback;
    };

    const handleSetDefault = async (profileName: string) => {
        try {
            const formData = new URLSearchParams();
            formData.append('name', profileName);
            const resp = await fetch('/api/settings/default-speaker', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                fetchSpeakers();
                onRefresh();
            }
        } catch (error) {
            console.error('Failed to set default voice:', error);
        }
    };

    const handleTest = useCallback(async (name: string) => {
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/test`, {
                method: 'POST',
            });
            const result = await resp.json();
            if (result.status === 'ok' || result.status === 'success') {
                if (result.job_id) {
                    setBuildingProfiles(prev => ({ ...prev, [name]: result.job_id }));
                }
            } else {
                requestConfirm({
                    title: 'Test Failed',
                    message: formatError(result, 'An unknown error occurred during the test.'),
                    onConfirm: () => {},
                    isAlert: true
                });
            }
        } catch (err) {
            console.error('Test failed', err);
        }
    }, [requestConfirm]);

    const handleBuildNow = useCallback(async (
        name: string, 
        newFiles: File[], 
        speakerId?: string, 
        variantName?: string
    ) => {
        const formData = new FormData();
        formData.append('name', name);
        if (speakerId) formData.append('speaker_id', speakerId);
        if (variantName) formData.append('variant_name', variantName);
        newFiles.forEach(f => formData.append('files', f));
        
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/build`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                const result = await resp.json();
                const jobId = result.job_id;
                // Track the build job by ID — buildingProfiles will be cleared when the
                // WebSocket signals that job_id is done/failed (watched in the useEffect above)
                setBuildingProfiles(prev => ({ ...prev, [name]: jobId || true }));
                fetchSpeakers();
                return true;
            } else {
                let errorMsg = 'An unknown error occurred during the rebuild process.';
                try {
                    const err = await resp.json();
                    errorMsg = formatError(err, errorMsg);
                } catch (e) {
                    console.error('Failed to parse error response', e);
                }
                
                requestConfirm({
                    title: 'Rebuild Failed',
                    message: errorMsg,
                    onConfirm: () => {},
                    isAlert: true
                });
                return false;
            }
        } catch (e) {
            console.error('Rebuild failed', e);
            return false;
        }
    }, [fetchSpeakers, requestConfirm]);

    const handleDelete = async (name: string) => {
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}`, {
                method: 'DELETE',
            });
            if (resp.ok) onRefresh();
        } catch (err) {
            console.error('Failed to delete profile', err);
        }
    };

    const handleUpdateEngine = useCallback(async (name: string, engine: VoiceEngine) => {
        try {
            const formData = new URLSearchParams();
            formData.append('engine', engine);
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/engine`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                onRefresh();
                return true;
            }
        } catch (err) {
            console.error('Failed to update profile engine', err);
        }
        return false;
    }, [onRefresh]);

    const handleUpdateReferenceSample = useCallback(async (name: string, sampleName: string | null) => {
        try {
            const formData = new URLSearchParams();
            formData.append('sample_name', sampleName || '');
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/reference-sample`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                onRefresh();
                return true;
            }
        } catch (err) {
            console.error('Failed to update reference sample', err);
        }
        return false;
    }, [onRefresh]);

    const handleUpdateVoxtralVoiceId = useCallback(async (name: string, voiceId: string) => {
        try {
            const formData = new URLSearchParams();
            formData.append('voice_id', voiceId || '');
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/voxtral-voice-id`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                onRefresh();
                return true;
            }
        } catch (err) {
            console.error('Failed to update Voxtral voice id', err);
        }
        return false;
    }, [onRefresh]);

    const handleUpdateSettings = useCallback(async (name: string, settings: Record<string, any>) => {
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(name)}/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (resp.ok) {
                onRefresh();
                return true;
            }
        } catch (err) {
            console.error('Failed to update profile settings', err);
        }
        return false;
    }, [onRefresh]);

    // Expose a boolean-compatible version of buildingProfiles for consumers
    const buildingProfilesBool: Record<string, boolean> = Object.fromEntries(
        Object.keys(buildingProfiles).map(k => [k, true])
    );

    return {
        speakers,
        buildingProfiles: buildingProfilesBool,
        fetchSpeakers,
        handleSetDefault,
        handleTest,
        handleBuildNow,
        handleDelete,
        handleUpdateEngine,
        handleUpdateReferenceSample,
        handleUpdateVoxtralVoiceId,
        handleUpdateSettings,
        formatError
    };
}
