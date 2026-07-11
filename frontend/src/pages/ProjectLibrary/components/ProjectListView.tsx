import React from 'react';
import { Trash2, ExternalLink, Calendar, User, BookOpen } from 'lucide-react';
import type { Project } from '@/types';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { ProjectStatusPill } from '@/components/ui/ProjectStatusPill';

interface ProjectListViewProps {
    projects: Project[];
    onSelect: (projectId: string) => void;
    onOpenDetails: (projectId: string) => void;
    onDelete: (id: string, name: string) => void;
    formatDate: (timestamp: number) => string;
}

export const ProjectListView: React.FC<ProjectListViewProps> = ({
    projects,
    onSelect,
    onOpenDetails,
    onDelete,
    formatDate
}) => {
    return (
        <div 
            role="list"
            className="project-list-view"
            style={{ 
                background: 'var(--surface)', 
                borderRadius: '16px', 
                border: '1px solid var(--border)',
                overflow: 'hidden'
            }}
        >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                    <tr style={{ background: 'var(--bg-alt)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Project</th>
                        <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Status</th>
                        <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Series</th>
                        <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Created</th>
                        <th style={{ padding: '1rem 1.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Updated</th>
                        <th style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {projects.map((project, index) => (
                        <tr 
                            key={project.id}
                            style={{ 
                                borderBottom: index === projects.length - 1 ? 'none' : '1px solid var(--border)',
                                transition: 'background 0.2s ease',
                                cursor: 'pointer'
                            }}
                            className="list-row-hover"
                            onClick={() => onSelect(project.id)}
                        >
                            <td style={{ padding: '1rem 1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                    <div style={{ 
                                        width: '40px', 
                                        height: '54px', 
                                        borderRadius: '4px', 
                                        overflow: 'hidden', 
                                        background: 'var(--bg-alt)',
                                        flexShrink: 0,
                                        border: '1px solid var(--border)'
                                    }}>
                                        {project.cover_image_path ? (
                                            <img 
                                                src={project.cover_image_path} 
                                                alt={project.name}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                            />
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                                                <BookOpen size={20} />
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>{project.name}</h3>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                            <User size={12} color="var(--text-muted)" />
                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{project.author || 'Unknown Author'}</span>
                                        </div>
                                    </div>
                                </div>
                            </td>
                            <td style={{ padding: '1rem 1.5rem' }}>
                                {project.status && <ProjectStatusPill status={project.status} />}
                            </td>
                            <td style={{ padding: '1rem 1.5rem' }}>
                                <span style={{
                                    fontSize: '0.85rem',
                                    color: project.series ? 'var(--text-primary)' : 'var(--text-muted)',
                                    fontStyle: project.series ? 'normal' : 'italic'
                                }}>
                                    {project.series || 'No series'}
                                </span>
                            </td>
                            <td style={{ padding: '1rem 1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    <Calendar size={14} />
                                    {formatDate(project.created_at)}
                                </div>
                            </td>
                            <td style={{ padding: '1rem 1.5rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    <Calendar size={14} />
                                    {formatDate(project.updated_at)}
                                </div>
                            </td>
                            <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                                    <ActionMenu 
                                        onDelete={() => onDelete(project.id, project.name)}
                                        items={[
                                            { label: 'Project Details', icon: BookOpen, onClick: () => onOpenDetails(project.id) },
                                            { label: 'Open Project', icon: ExternalLink, onClick: () => onSelect(project.id) },
                                            { label: 'Delete Project', icon: Trash2, onClick: () => onDelete(project.id, project.name), isDestructive: true }
                                        ]}
                                    />
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
