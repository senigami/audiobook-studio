import React, { useState } from 'react';
import { Plus, Book, ImageIcon, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useProjectLibrary } from '@/hooks/useProjectLibrary';
import { ProjectCard } from '@/pages/ProjectDetail/components/ProjectCard';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { LibraryControls } from './components/LibraryControls';
import { ProjectListView } from './components/ProjectListView';
import { LibraryBookmarksPanel } from './components/LibraryBookmarksPanel';
import { LibraryContinueSection } from './components/LibraryContinueSection';
import { COVER_SIZES, getStoredCoverSizeIdx, setStoredCoverSizeIdx } from './lib/coverSize';
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
        statusFilter,
        setStatusFilter,
        filteredProjects,
        existingSeries
    } = useProjectLibrary(onSelectProject);

    const [coverSizeIdx, setCoverSizeIdxState] = useState(getStoredCoverSizeIdx);
    const setCoverSizeIdx = (idx: number) => {
        setCoverSizeIdxState(idx);
        setStoredCoverSizeIdx(idx);
    };
    const coverColumnWidth = COVER_SIZES[coverSizeIdx]?.col ?? COVER_SIZES[0].col;

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
                                    <input type="file" ref={fileInputRef} onChange={handleCoverChange} accept="image/*" className="project-library-hidden-input" />
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
        <div className="animate-in project-library-page">
            <h1 className="project-library-visually-hidden-heading">
                Library
            </h1>
            {/* Page header */}
            <header className="project-library-header">
                <div>
                    <h2 className="project-library-greeting">
                        {getGreeting()}
                    </h2>
                    <p className="project-library-subtitle">
                        Your audiobook projects
                    </p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn-primary project-library-header-cta"
                >
                    <Plus size={16} strokeWidth={2.5} /> New Project
                </button>
            </header>

            <LibraryBookmarksPanel projects={projects} />

            <LibraryContinueSection
                projects={projects}
                onOpenProject={(id) => onSelectProject?.(id)}
            />

            <LibraryControls
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                sortOption={sortOption}
                onSortOptionChange={setSortOption}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
                coverSizeIdx={coverSizeIdx}
                onCoverSizeIdxChange={setCoverSizeIdx}
            />

            {viewMode === 'grid' ? (
                <div
                    className="project-library-grid"
                    style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${coverColumnWidth}px, 1fr))` }}
                >
                    {filteredProjects.map(project => (
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
                    projects={filteredProjects}
                    onSelect={(id) => onSelectProject?.(id)}
                    onOpenDetails={handleOpenProjectDetails}
                    onDelete={handleDeleteClick}
                    formatDate={formatDate}
                />
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
                                <input type="file" ref={fileInputRef} onChange={handleCoverChange} accept="image/*" className="project-library-hidden-input" />

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
