import React from 'react';
import { Book, Clock, User } from 'lucide-react';
import { motion } from 'framer-motion';
import { ActionMenu } from '../ActionMenu';
import type { Project } from '../../types';

interface ProjectCardProps {
    project: Project;
    isHovered: boolean;
    onHover: (id: string | null) => void;
    onClick: (id: string) => void;
    onDelete: (id: string, name: string) => void;
    formatDate: (timestamp: number) => string;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
    project,
    isHovered,
    onHover,
    onClick,
    onDelete,
    formatDate
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            onMouseEnter={() => onHover(project.id)}
            onMouseLeave={() => onHover(null)}
            whileHover={{ y: -4, boxShadow: '0 12px 24px -10px rgba(0,0,0,0.15)' }}
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
                        height: '100%', 
                        display: 'flex', 
                        flexDirection: 'column',
                        alignItems: 'center', 
                        justifyContent: 'center',
                        gap: '12px',
                        background: 'linear-gradient(135deg, var(--as-info-tint) 0%, var(--surface) 100%)'
                    }}>
                        <div style={{
                            position: 'absolute',
                            inset: 0,
                            opacity: 0.08,
                            background: `repeating-linear-gradient(45deg, var(--accent) 0, var(--accent) 1px, transparent 0, transparent 4px)`,
                            backgroundSize: '8px 8px'
                        }} />
                        <Book size={48} color="var(--accent)" style={{ opacity: 0.25, position: 'relative', zIndex: 1 }} />
                        <div style={{ position: 'relative', zIndex: 1, fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 700, opacity: 0.6, letterSpacing: '0.05em' }}>
                            ADD COVER
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
                    <ActionMenu onDelete={() => {
                        onDelete(project.id, project.name);
                    }} />
                </motion.div>
            </div>
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--surface)', zIndex: 11 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)' }} title={project.name}>
                    {project.name}
                </h3>
                {project.author ? (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                        <User size={14} opacity={0.7} /> {project.author}
                    </p>
                ) : (
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        No author specified
                    </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                        <Clock size={14} opacity={0.7} /> {formatDate(project.updated_at)}
                    </p>
                </div>
            </div>
        </motion.div>
    );
};
