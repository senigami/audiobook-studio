import { useState, useEffect, useCallback } from 'react';
import type { Speaker, SpeakerProfile } from '../types';

export function useVoiceManagement(
    onRefresh: () => void, 
    speakerProfiles: SpeakerProfile[],
    requestConfirm: (config: { 
        title: string; 
        message: string; 
        onConfirm: () => void; 
        isDestructive?: boolean; 
        isAlert?: boolean; 
    }) => void
) {
    const [speakers, setSpeakers] = useState<Speaker[]>([]);
    const [testingProfile, setTestingProfile] = useState<string | null>(null);
    const [buildingProfiles, setBuildingProfiles] = useState<Record<string, boolean>>({});

    const fetchSpeakers = useCallback(async () => {
        try {
            const resp = await fetch('/api/speakers');
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
        setTestingProfile(name);
        try {
            const resp = await fetch('/api/speaker-profiles/test', {
                method: 'POST',
                body: new URLSearchParams({ name }),
            });
            const result = await resp.json();
            if (result.status === 'ok') {
                onRefresh();
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
        } finally {
            setTestingProfile(null);
        }
    }, [onRefresh, requestConfirm]);

    const handleBuildNow = useCallback(async (
        name: string, 
        newFiles: File[], 
        speakerId?: string, 
        variantName?: string
    ) => {
        setBuildingProfiles(prev => ({ ...prev, [name]: true }));
        const formData = new FormData();
        formData.append('name', name);
        if (speakerId) formData.append('speaker_id', speakerId);
        if (variantName) formData.append('variant_name', variantName);
        newFiles.forEach(f => formData.append('files', f));
        
        try {
            const resp = await fetch('/api/speaker-profiles/build', {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                onRefresh();
                fetchSpeakers();
                await handleTest(name);
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
        } finally {
            setBuildingProfiles(prev => {
                const updated = { ...prev };
                delete updated[name];
                return updated;
            });
        }
    }, [onRefresh, fetchSpeakers, handleTest, requestConfirm]);

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

    return {
        speakers,
        testingProfile,
        buildingProfiles,
        fetchSpeakers,
        handleSetDefault,
        handleTest,
        handleBuildNow,
        handleDelete,
        formatError
    };
}
