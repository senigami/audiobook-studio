import { useState, useCallback, useRef, useEffect } from 'react';
import type { SpeakerProfile } from '@/types';
import { usePlayerBus, loadAndPlay, play, pause } from '@/store/playerBus';

export function useVariantActions(
    profile: SpeakerProfile, 
    onRefresh: () => void,
    onTest: (name: string) => void,
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void
) {
    const [localSpeed, setLocalSpeed] = useState<number | null>(null);
    const [cacheBuster, setCacheBuster] = useState(Date.now());

    const speedTimeoutRef = useRef<any>(null);

    const playerBus = usePlayerBus();
    const previewUrl = profile.preview_url ? `${profile.preview_url}?t=${cacheBuster}` : '';
    const isPlaying = playerBus.scope === 'preview' && playerBus.audioUrl === previewUrl && playerBus.playing;
    const setIsPlaying = (val: boolean) => {
        if (val) {
            play();
        } else {
            pause();
        }
    };

    // Derive which sample filename is "playing" from bus state so we have
    // a single audio owner (ADR-0010). A sample URL has the form:
    //   <baseUrl>/<encodedSampleName>?t=<timestamp>
    // We extract the filename portion to compare with bare sample names.
    const baseUrl = profile.asset_base_url || `/out/voices/${encodeURIComponent(profile.name)}`;
    const playingSample: string | null = (() => {
        if (playerBus.scope !== 'preview' || !playerBus.playing || !playerBus.audioUrl) return null;
        const url = playerBus.audioUrl.split('?')[0]; // strip ?t=
        const prefix = `${baseUrl}/`;
        if (!url.startsWith(prefix)) return null;
        return decodeURIComponent(url.slice(prefix.length));
    })();

    useEffect(() => {
        return () => {
            if (speedTimeoutRef.current) clearTimeout(speedTimeoutRef.current);
        };
    }, []);

    useEffect(() => {
        if (localSpeed !== null && Math.abs(profile.speed - localSpeed) < 0.005) {
            setLocalSpeed(null);
        }
    }, [profile.speed, localSpeed]);

    const [pendingPlay, setPendingPlay] = useState(false);

    useEffect(() => {
        if (pendingPlay && profile.preview_url) {
            setPendingPlay(false);
            loadAndPlay({
                scope: 'preview',
                title: profile.variant_name || 'Default Variant',
                subtitle: profile.name,
                audioUrl: `${profile.preview_url}?t=${cacheBuster}`,
            });
        }
    }, [profile.preview_url, pendingPlay, cacheBuster, profile.variant_name, profile.name]);

    const handlePlayClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!profile.preview_url) {
            setPendingPlay(true);
            onTest(profile.name);
            return;
        }

        const currentPreviewUrl = `${profile.preview_url}?t=${cacheBuster}`;
        if (playerBus.scope === 'preview' && playerBus.audioUrl === currentPreviewUrl) {
            if (playerBus.playing) {
                pause();
            } else {
                play();
            }
        } else {
            loadAndPlay({
                scope: 'preview',
                title: profile.variant_name || 'Default Variant',
                subtitle: profile.name,
                audioUrl: currentPreviewUrl,
            });
        }
    }, [profile.preview_url, profile.name, onTest, playerBus.scope, playerBus.audioUrl, playerBus.playing, cacheBuster, profile.variant_name]);

    const handleGeneratePreview = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setPendingPlay(false);

        const currentPreviewUrl = profile.preview_url ? `${profile.preview_url}?t=${cacheBuster}` : '';
        if (playerBus.scope === 'preview' && playerBus.audioUrl === currentPreviewUrl && playerBus.playing) {
            pause();
        }

        onTest(profile.name);
    }, [onTest, profile.name, profile.preview_url, cacheBuster, playerBus.scope, playerBus.audioUrl, playerBus.playing]);

    const handlePlaySample = useCallback((s: string) => {
        const sampleUrl = `${baseUrl}/${encodeURIComponent(s)}?t=${Date.now()}`;
        if (playingSample === s) {
            // Toggle off — the bus owns the element so just pause it
            pause();
            return;
        }
        loadAndPlay({
            scope: 'preview',
            title: s,
            subtitle: profile.name,
            audioUrl: sampleUrl,
        });
    }, [profile.name, baseUrl, playingSample]);

    const handleSpeedChange = useCallback((val: number) => {
        if (speedTimeoutRef.current) clearTimeout(speedTimeoutRef.current);
        
        speedTimeoutRef.current = setTimeout(async () => {
            try {
                const formData = new URLSearchParams();
                formData.append('speed', val.toString());
                const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/speed`, {
                    method: 'POST',
                    body: formData
                });
                if (resp.ok) {
                    onRefresh();
                }
            } catch (e) {
                console.error('Failed to update profile speed', e);
                setLocalSpeed(null);
            }
        }, 300);
    }, [profile.name, onRefresh]);

    const handleDeleteSample = useCallback((sampleName: string) => {
        requestConfirm({
            title: 'Remove Sample',
            message: `Are you sure you want to remove "${sampleName}"? A voice rebuild will be required to apply this change.`,
            isDestructive: true,
            onConfirm: async () => {
                try {
                    const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/samples/${encodeURIComponent(sampleName)}`, {
                        method: 'DELETE'
                    });
                    if (resp.ok) {
                        onRefresh();
                    }
                } catch (err) {
                    console.error('Failed to remove sample', err);
                }
            }
        });
    }, [profile.name, onRefresh, requestConfirm]);

    const uploadFiles = useCallback(async (files: FileList | File[]) => {
        const formData = new FormData();
        Array.from(files).forEach(f => formData.append('files', f));
        
        try {
            const resp = await fetch(`/api/speaker-profiles/${encodeURIComponent(profile.name)}/samples/upload`, {
                method: 'POST',
                body: formData
            });
            if (resp.ok) {
                onRefresh();
            }
        } catch (err) {
            console.error('Failed to upload samples', err);
        }
    }, [profile.name, onRefresh]);

    return {
        localSpeed,
        setLocalSpeed,
        isPlaying,
        setIsPlaying,
        playingSample,
        cacheBuster,
        setCacheBuster,
        handlePlayClick,
        handleGeneratePreview,
        handlePlaySample,
        handleSpeedChange,
        handleDeleteSample,
        uploadFiles
    };
}
