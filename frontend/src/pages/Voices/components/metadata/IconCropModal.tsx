import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

// D2 (design-docs/plans/active/final_release/04_voice_metadata_and_tagging.md):
// "1:1 image upload with crop UI (or error if non-square)". The backend still
// enforces 1:1 server-side (defense in depth) — this modal just gives the
// user a way to produce a square crop client-side instead of hitting that
// 422 for every non-square source image.

const VIEWPORT_SIZE = 280;
const OUTPUT_SIZE = 512;
const MAX_ZOOM_MULTIPLIER = 3;

interface IconCropModalProps {
    file: File;
    onCancel: () => void;
    onCropped: (file: File) => void;
}

export const IconCropModal: React.FC<IconCropModalProps> = ({ file, onCancel, onCropped }) => {
    const dialogRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement>(null);
    useFocusTrap(dialogRef, true);

    const [imgUrl, setImgUrl] = useState<string | null>(null);
    const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
    const [coverScale, setCoverScale] = useState(1);
    const [zoomMultiplier, setZoomMultiplier] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const dragState = useRef<{ startX: number; startY: number; startOffsetX: number; startOffsetY: number } | null>(null);

    useEffect(() => {
        const url = URL.createObjectURL(file);
        setImgUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const scale = coverScale * zoomMultiplier;

    const clampOffset = useCallback((next: { x: number; y: number }, currentScale: number, size: { w: number; h: number }) => {
        const minX = VIEWPORT_SIZE - size.w * currentScale;
        const minY = VIEWPORT_SIZE - size.h * currentScale;
        return {
            x: Math.min(0, Math.max(minX, next.x)),
            y: Math.min(0, Math.max(minY, next.y)),
        };
    }, []);

    const handleImageLoad = () => {
        const img = imgRef.current;
        if (!img) return;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        const cover = Math.max(VIEWPORT_SIZE / w, VIEWPORT_SIZE / h);
        setNaturalSize({ w, h });
        setCoverScale(cover);
        setZoomMultiplier(1);
        setOffset({ x: (VIEWPORT_SIZE - w * cover) / 2, y: (VIEWPORT_SIZE - h * cover) / 2 });
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        (e.target as Element).setPointerCapture(e.pointerId);
        dragState.current = { startX: e.clientX, startY: e.clientY, startOffsetX: offset.x, startOffsetY: offset.y };
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        if (!dragState.current || !naturalSize) return;
        const dx = e.clientX - dragState.current.startX;
        const dy = e.clientY - dragState.current.startY;
        setOffset(clampOffset(
            { x: dragState.current.startOffsetX + dx, y: dragState.current.startOffsetY + dy },
            scale,
            naturalSize,
        ));
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        (e.target as Element).releasePointerCapture(e.pointerId);
        dragState.current = null;
    };

    const handleZoomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!naturalSize) return;
        const nextMultiplier = parseFloat(e.target.value);
        const nextScale = coverScale * nextMultiplier;
        setZoomMultiplier(nextMultiplier);
        setOffset((prev) => clampOffset(prev, nextScale, naturalSize));
    };

    const handleEscape = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onCancel();
    }, [onCancel]);

    const handleApply = () => {
        const img = imgRef.current;
        if (!img || !naturalSize) return;

        const srcX = -offset.x / scale;
        const srcY = -offset.y / scale;
        const srcSize = VIEWPORT_SIZE / scale;

        const canvas = document.createElement('canvas');
        canvas.width = OUTPUT_SIZE;
        canvas.height = OUTPUT_SIZE;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, srcX, srcY, srcSize, srcSize, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

        canvas.toBlob((blob) => {
            if (!blob) return;
            onCropped(new File([blob], 'icon.png', { type: 'image/png' }));
        }, 'image/png');
    };

    return (
        <AnimatePresence>
            <div
                style={{
                    position: 'fixed', inset: 0, zIndex: 2100,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
                }}
                onKeyDown={handleEscape}
            >
                <motion.div
                    initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    onClick={onCancel} aria-hidden="true"
                    style={{ position: 'absolute', inset: 0, background: 'var(--overlay-backdrop)', backdropFilter: 'blur(8px)' }}
                />
                <motion.div
                    ref={dialogRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="icon-crop-modal-title"
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                    style={{
                        position: 'relative', width: '100%', maxWidth: '360px',
                        background: 'var(--surface)', borderRadius: 'var(--radius-card)',
                        boxShadow: 'var(--shadow-xl)', border: '1px solid var(--border)',
                        padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 id="icon-crop-modal-title" style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                            Crop icon
                        </h3>
                        <button onClick={onCancel} aria-label="Cancel crop" className="modal-close-btn">
                            <X size={18} />
                        </button>
                    </div>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
                        Voice icons must be square. Drag to reposition, use the slider to zoom.
                    </p>

                    <div
                        style={{
                            width: VIEWPORT_SIZE, height: VIEWPORT_SIZE, margin: '0 auto',
                            overflow: 'hidden', borderRadius: 'var(--radius-card)',
                            border: '1px solid var(--border)', position: 'relative',
                            touchAction: 'none', cursor: naturalSize ? 'grab' : 'default',
                            background: 'var(--surface-alt)',
                        }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                    >
                        {imgUrl && (
                            <img
                                ref={imgRef}
                                src={imgUrl}
                                alt=""
                                draggable={false}
                                onLoad={handleImageLoad}
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    width: naturalSize ? naturalSize.w * scale : undefined,
                                    height: naturalSize ? naturalSize.h * scale : undefined,
                                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                                    userSelect: 'none',
                                    pointerEvents: 'none',
                                }}
                            />
                        )}
                    </div>

                    <label style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        Zoom
                        <input
                            type="range"
                            min={1}
                            max={MAX_ZOOM_MULTIPLIER}
                            step={0.01}
                            value={zoomMultiplier}
                            onChange={handleZoomChange}
                            disabled={!naturalSize}
                            aria-label="Zoom"
                        />
                    </label>

                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={onCancel} className="btn-ghost" style={{ flex: 1, padding: '0.65rem', borderRadius: 'var(--radius-button)' }}>
                            Cancel
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={!naturalSize}
                            className="btn-primary"
                            style={{ flex: 1, padding: '0.65rem', borderRadius: 'var(--radius-button)', border: 'none', fontWeight: 600, cursor: 'pointer' }}
                        >
                            Apply crop
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
