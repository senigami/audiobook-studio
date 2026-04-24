import { useState, useCallback, useRef, useEffect } from 'react';
import type { SpeakerProfile } from '../types';

export function useVariantActions(
    profile: SpeakerProfile, 
    onRefresh: () => void,
    onTest: (name: string) => void,
    requestConfirm: (config: { title: string; message: string; onConfirm: () => void; isDestructive?: boolean; isAlert?: boolean }) => void
) {
    const [localSpeed, setLocalSpeed] = useState<number | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playingSample, setPlayingSample] = useState<string | null>(null);
    const [cacheBuster, setCacheBuster] = useState(Date.now());
    
    const audioRef = useRef<HTMLAudioElement>(null);
    const sampleAudioRef = useRef<HTMLAudioElement>(null);

    const speedTimeoutRef = useRef<any>(null);

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
        if (pendingPlay && profile.preview_url && audioRef.current) {
            setPendingPlay(false);
            
            // Wait a tiny bit for the browser to register the new audio source if needed
            const playAudio = async () => {
                try {
                    if (audioRef.current) {
                        audioRef.current.load(); // Force load new source
                        // Small delay helps browser stabilize the new source before playing
                        setTimeout(async () => {
                            try {
                                if (audioRef.current) {
                                    await audioRef.current.play();
                                    setIsPlaying(true);
                                }
                            } catch (err) {
                                console.error("Delayed auto-play failed", err);
                            }
                        }, 200);
                    }
                } catch (err) {
                    console.error("Auto-play setup failed", err);
                }
            };
            playAudio();
        }
    }, [profile.preview_url, pendingPlay, audioRef, setIsPlaying]);

    const handlePlayClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!profile.preview_url) {
            setPendingPlay(true);
            
            // "Warm up" the audio element to capture the user gesture.
            // This makes the browser more likely to allow the auto-play later 
            // even after the 10-20s build time.
            if (audioRef.current) {
                audioRef.current.play().catch(() => {
                    // Expect failure since src is likely empty/invalid, 
                    // but the click event is now linked to this element.
                });
            }

            onTest(profile.name);
            return;
        }

        if (playingSample) {
            sampleAudioRef.current?.pause();
            setPlayingSample(null);
        }

        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
                setIsPlaying(false);
            } else {
                audioRef.current.play();
                setIsPlaying(true);
            }
        }
    }, [profile.preview_url, profile.name, onTest, playingSample, isPlaying, setIsPlaying]);

    const handleGeneratePreview = useCallback((e?: React.MouseEvent) => {
        e?.stopPropagation();
        setPendingPlay(false);

        if (audioRef.current && !audioRef.current.paused) {
            audioRef.current.pause();
        }
        setIsPlaying(false);

        onTest(profile.name);
    }, [onTest, profile.name, setIsPlaying]);

    const handlePlaySample = useCallback((s: string) => {
        if (playingSample === s) {
            sampleAudioRef.current?.pause();
            setPlayingSample(null);
            return;
        }

        if (isPlaying) {
            audioRef.current?.pause();
            setIsPlaying(false);
        }

        setPlayingSample(s);
        if (sampleAudioRef.current) {
            const baseUrl = profile.asset_base_url || `/out/voices/${encodeURIComponent(profile.name)}`;
            sampleAudioRef.current.src = `${baseUrl}/${encodeURIComponent(s)}?t=${Date.now()}`;
            sampleAudioRef.current.play().catch(err => {
                console.error("Playback failed", err);
                setPlayingSample(null);
            });
        }
    }, [profile.name, profile.asset_base_url, playingSample, isPlaying]);

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
        setPlayingSample,
        cacheBuster,
        setCacheBuster,
        audioRef,
        sampleAudioRef,
        handlePlayClick,
        handleGeneratePreview,
        handlePlaySample,
        handleSpeedChange,
        handleDeleteSample,
        uploadFiles
    };
}
