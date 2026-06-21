import React from 'react';
import { Plus, Book, ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { ProjectCard } from '@/pages/ProjectDetail/components/ProjectCard';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { LibraryControls } from './components/LibraryControls';
import { ProjectListView } from './components/ProjectListView';

interface ProjectLibraryProps {
    onSelectProject?: (projectId: string) => void;
}

export const ProjectLibrary: React.FC<ProjectLibraryProps> = ({ onSelectProject }) => {
    const {
        projects,
        loading,
        showModal,
        setShowModal,
        title,
        setTitle,
        series,
        setSeries,
        author,
        setAuthor,
        coverPreview,
        submitting,
        isDragging,
        fileInputRef,
        hoveredProjectId,
        setHoveredProjectId,
        deleteModal,
        setDeleteModal,
        handleCoverChange,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        handleCreateProject,
        handleDeleteClick,
        confirmDelete,
        viewMode,
        setViewMode,
        sortOption,
        setSortOption,
        sortedProjects
    } = useProjectLibrary(onSelectProject);

    const formatDate = (timestamp: number) => {
        return new Date(timestamp * 1000).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        });
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Loader2 className="animate-spin" size={32} color="var(--accent)" />
            </div>
        );
    }

    // When the library is empty, render only a centered empty state with one CTA
    if (projects.length === 0) {
        return (
            <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
                <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '6rem 2rem',
                    textAlign: 'center',
                    gap: '1.5rem'
                }}>
                    <Book size={56} style={{ opacity: 0.25, color: 'var(--text-muted)' }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <p style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)' }}>No projects yet</p>
                        <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Create a project to start turning text into audio.</p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="btn-primary"
                        style={{ padding: '0.85rem 2.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
                    >
                        <Plus size={20} strokeWidth={2.5} /> New Project
                    </button>
                </div>

                {/* Create Project Modal */}
                {showModal && (
                    <div style={{
                        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--overlay-backdrop)', backdropFilter: 'blur(4px)'
                    }}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            style={{
                                width: '100%',
                                maxWidth: '520px',
                                padding: '2.5rem',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '2rem',
                                background: 'var(--surface)',
                                borderRadius: '24px',
                                boxShadow: 'var(--shadow-lg)',
                                border: '1px solid var(--border)'
                            }}
                        >
                            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Create New Project</h3>
                            <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        className="hover-lift"
                                        style={{
                                            width: '120px', height: '120px', flexShrink: 0,
                                            borderRadius: '8px',
                                            border: isDragging ? '2px solid var(--accent)' : '2px dashed var(--border)',
                                            background: isDragging ? 'var(--accent-glow)' : 'var(--surface)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', overflow: 'hidden', position: 'relative', transition: 'all 0.2s ease'
                                        }}
                                    >
                                        {coverPreview ? (
                                            <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                                <img src={coverPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Cover Preview" />
                                            </div>
                                        ) : (
                                            <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                                                <ImageIcon size={24} style={{ margin: '0 auto 0.25rem auto', opacity: isDragging ? 1 : 0.5, color: isDragging ? 'var(--accent)' : 'inherit' }} />
                                                <p style={{ fontSize: '0.65rem', color: isDragging ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                                    {isDragging ? 'Drop Image' : 'Add Cover'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <input type="file" ref={fileInputRef} onChange={handleCoverChange} accept="image/*" style={{ display: 'none' }} />
                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Title *</label>
                                            <input
                                                autoFocus
                                                required
                                                value={title}
                                                onChange={e => setTitle(e.target.value)}
                                                placeholder="Enter project title"
                                                style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.9rem', width: '100%' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Author</label>
                                            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Optional" style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.9rem', width: '100%' }} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Series</label>
                                            <input value={series} onChange={e => setSeries(e.target.value)} placeholder="Optional" style={{ background: 'var(--surface-light)', border: '1px solid var(--border)', color: 'var(--text-primary)', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.9rem', width: '100%' }} />
                                        </div>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                                    <button type="button" onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: '0.6rem 1.25rem' }}>Cancel</button>
                                    <button disabled={submitting || !title} type="submit" className="btn-primary" style={{ padding: '0.6rem 1.25rem', width: '120px', display: 'flex', justifyContent: 'center' }}>
                                        {submitting ? <Loader2 className="animate-spin" size={16} /> : 'Create'}
                                    </button>
                                </div>
                            </form>
                        </motion.div>
                    </div>
                )}

                <ConfirmModal
                    isOpen={deleteModal.isOpen}
                    title="Delete project?"
                    message=""
                    projectName={deleteModal.projectName || ''}
                    confirmText="Delete"
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteModal({ isOpen: false, projectId: null, projectName: null })}
                    isDestructive={true}
                />
            </div>
        );
    }

    return (
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', minHeight: '100%' }}>
            <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                Library
            </h1>
            {/* Page header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '1rem',
                flexWrap: 'wrap'
            }}>
                <div>
                    <h2 style={{
                        fontSize: '1.75rem',
                        fontWeight: 700,
                        letterSpacing: '-0.02em',
                        color: 'var(--text-primary)',
                        lineHeight: 1.2,
                        margin: 0
                    }}>
                        {getGreeting()}
                    </h2>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginTop: '0.25rem', margin: '0.25rem 0 0 0' }}>
                        Your audiobook projects
                    </p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn-primary"
                    style={{ padding: '0.6rem 1.25rem', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                >
                    <Plus size={16} strokeWidth={2.5} /> New Project
                </button>
            </header>

            {projects.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '5rem', color: 'var(--text-muted)' }}>
                    <Book size={48} style={{ margin: '0 auto 1rem auto', opacity: 0.3 }} />
                    <p style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>No projects found</p>
                    <p style={{ fontSize: '0.85rem', opacity: 0.7 }}>Create a new project to get started translating text into audio.</p>
                </div>
            ) : (
                <>
                    <LibraryControls
                        viewMode={viewMode}
                        onViewModeChange={setViewMode}
                        sortOption={sortOption}
                        onSortOptionChange={setSortOption}
                    />

                    {viewMode === 'grid' ? (
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                            gap: '1.5rem'
                        }}>
                            {sortedProjects.map(project => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    isHovered={hoveredProjectId === project.id}
                                    onHover={setHoveredProjectId}
                                    onClick={(id) => onSelectProject?.(id)}
                                    onDelete={handleDeleteClick}
                                    formatDate={formatDate}
                                />
                            ))}
                        </div>
                    ) : (
                        <ProjectListView
                            projects={sortedProjects}
                            onSelect={(id) => onSelectProject?.(id)}
                            onDelete={handleDeleteClick}
                            formatDate={formatDate}
                        />
                    )}
                </>
            )}

            {/* Create Project Modal */}
            <AnimatePresence>
            {showModal && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'var(--overlay-backdrop)', backdropFilter: 'blur(4px)'
                    }}
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        style={{
                            width: '100%', 
                            maxWidth: '520px', 
                            padding: '2.5rem', 
                            display: 'flex', 
                            flexDirection: 'column', 
                            gap: '2rem', 
                            background: 'var(--surface)',
                            borderRadius: '24px',
                            boxShadow: 'var(--shadow-lg)',
                            border: '1px solid var(--border)'
                        }}
                    >
                        <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Create New Project</h3>
                        <form onSubmit={handleCreateProject} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                            <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className="hover-lift"
                                    style={{
                                        width: '120px',
                                        height: '120px',
                                        flexShrink: 0,
                                        borderRadius: '8px',
                                        border: isDragging ? '2px solid var(--accent)' : '2px dashed var(--border)',
                                        background: isDragging ? 'var(--accent-glow)' : 'var(--surface)',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        cursor: 'pointer',
                                        overflow: 'hidden',
                                        position: 'relative',
                                        transition: 'all 0.2s ease'
                                    }}
                                >
                                    {coverPreview ? (
                                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                                            <img src={coverPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Cover Preview" />
                                            {isDragging && (
                                                <div style={{ position: 'absolute', inset: 0, background: 'var(--accent-glow)', opacity: 0.8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                    <ImageIcon size={32} color="white" />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ textAlign: 'center', padding: '0.5rem' }}>
                                            <ImageIcon size={24} style={{ margin: '0 auto 0.25rem auto', opacity: isDragging ? 1 : 0.5, color: isDragging ? 'var(--accent)' : 'inherit' }} />
                                            <p style={{ fontSize: '0.65rem', color: isDragging ? 'var(--accent)' : 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                                                {isDragging ? 'Drop Image' : 'Add Cover'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <input type="file" ref={fileInputRef} onChange={handleCoverChange} accept="image/*" style={{ display: 'none' }} />

                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Title *</label>
                                        <input
                                            autoFocus
                                            required
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            placeholder="Enter project title"
                                            style={{
                                                background: 'var(--surface-light)',
                                                border: '1px solid var(--border)',
                                                color: 'var(--text-primary)',
                                                padding: '0.6rem 0.8rem',
                                                borderRadius: '6px',
                                                outline: 'none',
                                                fontSize: '0.9rem',
                                                width: '100%'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Author</label>
                                        <input
                                            value={author}
                                            onChange={e => setAuthor(e.target.value)}
                                            placeholder="Optional"
                                            style={{
                                                background: 'var(--surface-light)',
                                                border: '1px solid var(--border)',
                                                color: 'var(--text-primary)',
                                                padding: '0.6rem 0.8rem',
                                                borderRadius: '6px',
                                                outline: 'none',
                                                fontSize: '0.9rem',
                                                width: '100%'
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, display: 'block', marginBottom: '0.25rem' }}>Series</label>
                                        <input
                                            value={series}
                                            onChange={e => setSeries(e.target.value)}
                                            placeholder="Optional"
                                            style={{
                                                background: 'var(--surface-light)',
                                                border: '1px solid var(--border)',
                                                color: 'var(--text-primary)',
                                                padding: '0.6rem 0.8rem',
                                                borderRadius: '6px',
                                                outline: 'none',
                                                fontSize: '0.9rem',
                                                width: '100%'
                                            }}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '0.5rem' }}>
                                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost" style={{ padding: '0.6rem 1.25rem' }}>
                                    Cancel
                                </button>
                                <button disabled={submitting || !title} type="submit" className="btn-primary" style={{ padding: '0.6rem 1.25rem', width: '120px', display: 'flex', justifyContent: 'center' }}>
                                    {submitting ? <Loader2 className="animate-spin" size={16} /> : 'Create'}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </motion.div>
            )}
            </AnimatePresence>

            <ConfirmModal
                isOpen={deleteModal.isOpen}
                title="Delete project?"
                message=""
                projectName={deleteModal.projectName || ''}
                confirmText="Delete"
                onConfirm={confirmDelete}
                onCancel={() => setDeleteModal({ isOpen: false, projectId: null, projectName: null })}
                isDestructive={true}
            />
        </div>
    );
};
