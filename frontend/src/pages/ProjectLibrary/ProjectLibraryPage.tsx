import React from 'react';
import { Plus, Book, ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { ProjectCard } from '@/pages/ProjectDetail/components/ProjectCard';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { LibraryControls } from './components/LibraryControls';
import { ProjectListView } from './components/ProjectListView';
import './ProjectLibraryPage.css';

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
        seriesPosition,
        setSeriesPosition,
        setSeriesPositionTouched,
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
        handleOpenProjectDetails,
        confirmDelete,
        viewMode,
        setViewMode,
        sortOption,
        setSortOption,
        sortedProjects,
        existingSeries
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
            <div className="project-library-loading">
                <Loader2 className="animate-spin" size={32} color="var(--accent)" />
            </div>
        );
    }

    // When the library is empty, render only a centered empty state with one CTA
    if (projects.length === 0) {
        return (
            <div className="animate-in project-library-empty-page">
                <div className="project-library-empty-content">
                    <Book size={56} className="project-library-empty-icon" />
                    <div className="project-library-empty-copy">
                        <p className="project-library-empty-title">No projects yet</p>
                        <p className="project-library-empty-subtitle">Create a project to start turning text into audio.</p>
                    </div>
                    <button
                        onClick={() => setShowModal(true)}
                        className="btn-primary project-library-empty-cta"
                    >
                        <Plus size={20} strokeWidth={2.5} /> New Project
                    </button>
                </div>

                {/* Create Project Modal */}
                {showModal && (
                    <div className="project-library-modal-backdrop">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="project-library-modal-panel"
                        >
                            <h3 className="project-library-modal-heading">Create New Project</h3>
                            <form onSubmit={handleCreateProject} className="project-library-modal-form">
                                <div className="project-library-form-row">
                                    <div
                                        onClick={() => fileInputRef.current?.click()}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        className="hover-lift project-library-cover-dropzone"
                                        style={{
                                            border: isDragging ? '2px solid var(--accent)' : '2px dashed var(--border)',
                                            background: isDragging ? 'var(--accent-glow)' : 'var(--surface)'
                                        }}
                                    >
                                        {coverPreview ? (
                                            <div className="project-library-cover-preview">
                                                <img src={coverPreview} className="project-library-cover-preview-img" alt="Cover Preview" />
                                            </div>
                                        ) : (
                                            <div className="project-library-cover-placeholder">
                                                <ImageIcon size={24} className="project-library-cover-icon" style={{ opacity: isDragging ? 1 : 0.5, color: isDragging ? 'var(--accent)' : 'inherit' }} />
                                                <p className="project-library-cover-label" style={{ color: isDragging ? 'var(--accent)' : 'var(--text-muted)' }}>
                                                    {isDragging ? 'Drop Image' : 'Add Cover'}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                    <input type="file" ref={fileInputRef} onChange={handleCoverChange} accept="image/*" style={{ display: 'none' }} />
                                    <div className="project-library-form-fields">
                                        <div>
                                            <label className="label-uppercase-sm">Title *</label>
                                            <input
                                                autoFocus
                                                required
                                                value={title}
                                                onChange={e => setTitle(e.target.value)}
                                                placeholder="Enter project title"
                                                className="project-library-form-input"
                                            />
                                        </div>
                                        <div>
                                            <label className="label-uppercase-sm">Author</label>
                                            <input value={author} onChange={e => setAuthor(e.target.value)} placeholder="Optional" className="project-library-form-input" />
                                        </div>
                                        <div>
                                            <label className="label-uppercase-sm">Series</label>
                                            <input
                                                value={series}
                                                onChange={e => setSeries(e.target.value)}
                                                list="project-series-suggestions"
                                                placeholder="Optional"
                                                className="project-library-form-input"
                                            />
                                            <datalist id="project-series-suggestions">
                                                {existingSeries.map((item) => <option key={item} value={item} />)}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="label-uppercase-sm">Series position</label>
                                            <input
                                                value={seriesPosition}
                                                onChange={e => { setSeriesPositionTouched(true); setSeriesPosition(e.target.value); }}
                                                placeholder={series ? (seriesPosition ? `Suggested ${seriesPosition}` : 'Optional') : 'Optional'}
                                                inputMode="numeric"
                                                className="project-library-form-input"
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="project-library-modal-actions">
                                    <button type="button" onClick={() => setShowModal(false)} className="btn-ghost project-library-btn-cancel">Cancel</button>
                                    <button disabled={submitting || !title} type="submit" className="btn-primary project-library-btn-submit">
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
        <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', minHeight: '100%' }}>
            <h1 style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>
                Library
            </h1>
            {/* Page header */}
            <header style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 'var(--space-4)',
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
                    <p style={{ fontSize: 'var(--type-callout)', color: 'var(--text-muted)', marginTop: 'var(--space-1)', margin: 'var(--space-1) 0 0 0' }}>
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
                    <Book size={48} style={{ margin: '0 auto var(--space-4) auto', opacity: 0.3 }} />
                    <p style={{ fontSize: '1.1rem', marginBottom: 'var(--space-2)' }}>No projects found</p>
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
                            gap: 'var(--space-5)'
                        }}>
                            {sortedProjects.map(project => (
                                <ProjectCard
                                    key={project.id}
                                    project={project}
                                    isHovered={hoveredProjectId === project.id}
                                    onHover={setHoveredProjectId}
                                    onClick={(id) => onSelectProject?.(id)}
                                    onOpenDetails={handleOpenProjectDetails}
                                    onDelete={handleDeleteClick}
                                    formatDate={formatDate}
                                />
                            ))}
                        </div>
                    ) : (
                        <ProjectListView
                            projects={sortedProjects}
                            onSelect={(id) => onSelectProject?.(id)}
                            onOpenDetails={handleOpenProjectDetails}
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
                    className="project-library-modal-backdrop"
                >
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                        className="project-library-modal-panel"
                    >
                        <h3 className="project-library-modal-heading">Create New Project</h3>
                        <form onSubmit={handleCreateProject} className="project-library-modal-form">
                            <div className="project-library-form-row">
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    onDragOver={handleDragOver}
                                    onDragLeave={handleDragLeave}
                                    onDrop={handleDrop}
                                    className="hover-lift project-library-cover-dropzone"
                                    style={{
                                        border: isDragging ? '2px solid var(--accent)' : '2px dashed var(--border)',
                                        background: isDragging ? 'var(--accent-glow)' : 'var(--surface)'
                                    }}
                                >
                                    {coverPreview ? (
                                        <div className="project-library-cover-preview">
                                            <img src={coverPreview} className="project-library-cover-preview-img" alt="Cover Preview" />
                                            {isDragging && (
                                                <div className="project-library-cover-drag-overlay">
                                                    <ImageIcon size={32} color="white" />
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="project-library-cover-placeholder">
                                            <ImageIcon size={24} className="project-library-cover-icon" style={{ opacity: isDragging ? 1 : 0.5, color: isDragging ? 'var(--accent)' : 'inherit' }} />
                                            <p className="project-library-cover-label" style={{ color: isDragging ? 'var(--accent)' : 'var(--text-muted)' }}>
                                                {isDragging ? 'Drop Image' : 'Add Cover'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                                <input type="file" ref={fileInputRef} onChange={handleCoverChange} accept="image/*" style={{ display: 'none' }} />

                                <div className="project-library-form-fields">
                                    <div>
                                        <label className="label-uppercase-sm">Title *</label>
                                        <input
                                            autoFocus
                                            required
                                            value={title}
                                            onChange={e => setTitle(e.target.value)}
                                            placeholder="Enter project title"
                                            className="project-library-form-input project-library-form-input--no-outline"
                                        />
                                    </div>
                                    <div>
                                        <label className="label-uppercase-sm">Author</label>
                                        <input
                                            value={author}
                                            onChange={e => setAuthor(e.target.value)}
                                            placeholder="Optional"
                                            className="project-library-form-input project-library-form-input--no-outline"
                                        />
                                    </div>
                                    <div>
                                        <label className="label-uppercase-sm">Series</label>
                                        <input
                                            value={series}
                                            onChange={e => setSeries(e.target.value)}
                                            list="project-series-suggestions"
                                            placeholder="Optional"
                                            className="project-library-form-input project-library-form-input--no-outline"
                                        />
                                        <datalist id="project-series-suggestions">
                                            {existingSeries.map((item) => <option key={item} value={item} />)}
                                        </datalist>
                                    </div>
                                    <div>
                                        <label className="label-uppercase-sm">Series position</label>
                                        <input
                                            value={seriesPosition}
                                            onChange={e => { setSeriesPositionTouched(true); setSeriesPosition(e.target.value); }}
                                            placeholder={series ? (seriesPosition ? `Suggested ${seriesPosition}` : 'Optional') : 'Optional'}
                                            inputMode="numeric"
                                            className="project-library-form-input project-library-form-input--no-outline"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="project-library-modal-actions">
                                <button type="button" onClick={() => setShowModal(false)} className="btn-ghost project-library-btn-cancel">
                                    Cancel
                                </button>
                                <button disabled={submitting || !title} type="submit" className="btn-primary project-library-btn-submit">
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
