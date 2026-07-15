import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Book, Clock, User, FolderOpen, Trash2, Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ProjectStatusPill } from '@/components/ui/ProjectStatusPill';
import { usePlayerBus, play, pause } from '@/store/playerBus';
import { buildChapterQueue, playBookContinuous, useAutoSaveResumePosition } from '@/store/bookContinuousPlayback';
import { api } from '@/api';
import type { Project, Chapter } from '@/types';

interface ProjectCardProps {
    project: Project;
    isHovered: boolean;
    onHover: (id: string | null) => void;
    onClick: (id: string) => void;
    onOpenDetails: (id: string) => void;
    onDelete: (id: string, name: string) => void;
    formatDate: (timestamp: number) => string;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
    project,
    isHovered,
    onHover,
    onClick,
    onOpenDetails,
    onDelete,
    formatDate
}) => {
    // Lazily discover this project's rendered chapters so the hover-play
    // overlay can drive chapter-by-chapter continuous playback. Fetched
    // once, the first time the card is hovered (matches the hover-reveal
    // affordance rather than an upfront N-project fan-out on library load).
    const [chapters, setChapters] = useState<Chapter[] | null>(null);
    const fetchedRef = useRef(false);

    useEffect(() => {
        if (!isHovered || fetchedRef.current) return;
        fetchedRef.current = true;
        api.fetchChapters(project.id)
            .then((data: Chapter[]) => setChapters(data || []))
            .catch(() => setChapters([]));
    }, [isHovered, project.id]);

    const queue = useMemo(() => buildChapterQueue(chapters ?? []), [chapters]);
    const playerBus = usePlayerBus();
    const isThisBookLoaded = playerBus.scope === 'chapter' && playerBus.bookId === project.id;
    const isThisBookPlaying = isThisBookLoaded && playerBus.playing;

    useAutoSaveResumePosition(project.id, queue);

    const handlePlayClick = (event: React.MouseEvent) => {
        event.stopPropagation();
        if (queue.length === 0) return;
        if (isThisBookLoaded) {
            if (isThisBookPlaying) {
                pause();
            } else {
                play();
            }
        } else {
            playBookContinuous(project.id, project.name, queue);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onMouseEnter={() => onHover(project.id)}
            onMouseLeave={() => onHover(null)}
            whileHover={{ y: -4, boxShadow: 'var(--shadow-lg)' }}
            onClick={() => onClick(project.id)}
            style={{ 
                cursor: 'pointer',
                display: 'flex', 
                flexDirection: 'column',
                overflow: 'hidden',
                padding: 0,
                position: 'relative',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-card)',
                boxShadow: 'var(--shadow-sm)'
            }}
        >
            <div style={{ 
                aspectRatio: '2/3', 
                background: 'linear-gradient(135deg, var(--surface-alt) 0%, var(--surface) 100%)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                borderBottom: '1px solid var(--border)',
                position: 'relative',
                overflow: 'hidden'
            }}>
                {project.cover_image_path ? (
                    <>
                        {/* Background Layer (Blurred Bleed) */}
                        <img 
                            src={project.cover_image_path} 
                            alt="" 
                            style={{ 
                                position: 'absolute',
                                width: '120%', 
                                height: '120%', 
                                objectFit: 'cover',
                                filter: 'blur(15px) saturate(2) brightness(1.1) contrast(1.5)',
                                opacity: 0.22,
                                zIndex: 0
                            }} 
                        />
                        
                        {/* Glass Highlight Overlay */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to bottom, rgba(255,255,255,0.15) 0%, transparent 40%)',
                            zIndex: 1
                        }} />

                        {/* Gradient Overlay for Vignette Effect */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.1) 100%)',
                            zIndex: 2
                        }} />

                        {/* Foreground Layer (Contain) */}
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            padding: '12px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            zIndex: 3
                        }}>
                            <img 
                                src={project.cover_image_path} 
                                alt={project.name} 
                                style={{ 
                                    maxWidth: '100%', 
                                    maxHeight: '100%', 
                                    objectFit: 'contain',
                                    filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.2))',
                                    borderRadius: '4px',
                                    border: '1px solid rgba(255,255,255,0.2)'
                                }} 
                            />
                        </div>
                    </>
                ) : (
                    <div style={{
                        width: '100%',
                        height: 'calc(100% - 16px)',
                        margin: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        background: 'var(--surface-alt)',
                        border: '1px dashed var(--border)',
                        borderRadius: '6px'
                    }}>
                        <Book size={40} color="var(--text-muted)" style={{ opacity: 0.4 }} />
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, opacity: 0.7, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                            Add cover
                        </div>
                    </div>
                )}
                
                <motion.div 
                    initial={{ opacity: 0, y: -20, scale: 0.9 }}
                    animate={{ 
                        opacity: isHovered ? 1 : 0,
                        y: isHovered ? 0 : -20,
                        scale: isHovered ? 1 : 0.9
                    }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    style={{ 
                        position: 'absolute', 
                        top: '12px', 
                        right: '12px', 
                        zIndex: 20,
                        pointerEvents: isHovered ? 'auto' : 'none'
                    }}
                >
                    <ActionMenu items={[
                        { label: 'Open', icon: FolderOpen, onClick: () => onClick(project.id) },
                        { label: 'Delete', icon: Trash2, onClick: () => onDelete(project.id, project.name), isDestructive: true }
                    ]} />
                </motion.div>

                {/* Hover-reveal play control. A ▶ here must mean "play audio" —
                    when nothing is assembled yet it renders disabled with a
                    tooltip rather than silently redirecting to Publish. */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{
                        opacity: isHovered ? 1 : 0,
                        scale: isHovered ? 1 : 0.9
                    }}
                    transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 15,
                        pointerEvents: isHovered ? 'auto' : 'none'
                    }}
                >
                    {chapters !== null && (() => {
                        const canPlay = queue.length > 0;
                        return (
                            <button
                                type="button"
                                onClick={handlePlayClick}
                                disabled={!canPlay}
                                aria-label={`Play ${project.name}`}
                                title={canPlay ? undefined : 'Nothing rendered yet'}
                                style={{
                                    width: '48px',
                                    height: '48px',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    border: canPlay ? 'none' : '1px solid var(--border)',
                                    background: canPlay ? 'var(--accent)' : 'var(--surface-glass-white)',
                                    color: canPlay ? 'var(--text-on-accent)' : 'var(--text-muted)',
                                    boxShadow: canPlay ? 'var(--shadow-md)' : 'none',
                                    backdropFilter: canPlay ? undefined : 'blur(4px)',
                                    cursor: canPlay ? 'pointer' : 'not-allowed',
                                    opacity: canPlay ? 1 : 0.6
                                }}
                            >
                                {isThisBookPlaying ? <Pause size={20} /> : <Play size={20} style={{ transform: 'translateX(2px)' }} />}
                            </button>
                        );
                    })()}
                </motion.div>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--surface)', zIndex: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', rowGap: '0.35rem' }}>
                    <h3
                        style={{
                            flex: '1 1 auto',
                            minWidth: '80px',
                            fontSize: '1rem',
                            fontWeight: 700,
                            overflow: 'hidden',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            lineHeight: 1.3,
                            color: 'var(--text-primary)'
                        }}
                        title={project.name}
                    >
                        {project.name}
                    </h3>
                    {project.status && <ProjectStatusPill status={project.status} />}
                </div>
                {project.author && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                        <User size={14} opacity={0.7} /> {project.author}
                    </p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                        <Clock size={14} opacity={0.7} /> Updated {formatDate(project.updated_at)}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.9rem' }}>
                    <button
                        type="button"
                        className="btn-ghost"
                        onClick={(event) => {
                            event.stopPropagation();
                            onOpenDetails(project.id);
                        }}
                        style={{ flex: 1, padding: '0.55rem 0.75rem', fontSize: '0.8rem' }}
                    >
                        Details
                    </button>
                </div>
            </div>
        </motion.div>
    );
};
