import { useState, useEffect, useCallback } from 'react';
import { api } from '@/api';

export interface VoiceVersion {
    id: string;
    created_at: number;
    backfilled: boolean;
    engine_id: string;
    model: string | null;
    test_text: string;
    sample_count: number;
    has_artifact: boolean;
    is_active: boolean;
    artifact_url: string | null;
}

export function useVariantVersions(voiceName: string) {
    const [versions, setVersions] = useState<VoiceVersion[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.listVoiceVersions(voiceName);
            setVersions(res.versions ?? []);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load versions');
        } finally {
            setLoading(false);
        }
    }, [voiceName]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const promote = useCallback(async (versionId: string) => {
        const res = await api.promoteVoiceVersion(voiceName, versionId);
        if (res.status === 'ok') {
            await refresh();
            return true;
        }
        return false;
    }, [voiceName, refresh]);

    return { versions, loading, error, refresh, promote };
}
