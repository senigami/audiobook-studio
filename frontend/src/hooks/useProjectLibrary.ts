import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '@/types';
import { api } from '@/api';
import { emitToast } from '@/utils/toast';
import { parseSeriesPositionInput } from '@/utils/seriesPosition';

export const useProjectLibrary = (onSelectProject?: (projectId: string) => void) => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Create/Edit Modal state
    const [showModal, setShowModal] = useState(false);
    const [title, setTitle] = useState('');
    const [series, setSeries] = useState('');
    const [seriesPosition, setSeriesPosition] = useState('');
    const [seriesPositionTouched, setSeriesPositionTouched] = useState(false);
    const [author, setAuthor] = useState('');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // View and Sort state
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [sortOption, setSortOption] = useState<'updated-desc' | 'created-desc' | 'series-asc' | 'title-asc' | 'title-desc'>('updated-desc');

    // "In Progress" quick filter (task 005, north_star_screen_parity): a
    // separate filter dimension from sort — narrows to projects whose
    // derived status is 'drafting' or 'casting' (not yet fully rendered).
    // Projects without a status field (e.g. stale caches) are treated as not
    // in progress rather than always-visible or always-hidden.
    const [statusFilter, setStatusFilter] = useState<'all' | 'in-progress'>('all');

    // Hover state for cards
    const [hoveredProjectId, setHoveredProjectId] = useState<string | null>(null);

    // Delete Confirmation State
    const [deleteModal, setDeleteModal] = useState<{
        isOpen: boolean;
        projectId: string | null;
        projectName: string | null;
    }>({
        isOpen: false,
        projectId: null,
        projectName: null
    });

    const loadProjects = async () => {
        try {
            const data = await api.fetchProjects();
            setProjects(data);
        } catch (e) {
            console.error("Failed to load projects", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadProjects();
    }, []);

    const existingSeries = [...new Set(projects.map((project) => project.series).filter((series): series is string => !!series))].sort((a, b) => a.localeCompare(b));

    const suggestedSeriesPosition = (() => {
        const trimmedSeries = series.trim();
        if (!trimmedSeries) return '';
        const matchingProjects = projects.filter((project) => project.series === trimmedSeries);
        const seriesPositions = matchingProjects
            .map((project) => project.series_position)
            .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
        if (seriesPositions.length > 0) {
            return String(Math.max(...seriesPositions) + 1);
        }
        const titleSuffixes = matchingProjects
            .map((project) => project.name.match(/(\d+)\s*$/)?.[1])
            .filter((value): value is string => !!value)
            .map((value) => Number(value))
            .filter((value) => Number.isFinite(value));
        return titleSuffixes.length > 0 ? String(Math.max(...titleSuffixes) + 1) : '';
    })();

    useEffect(() => {
        if (seriesPositionTouched) return;
        setSeriesPosition(suggestedSeriesPosition);
    }, [series, seriesPositionTouched, suggestedSeriesPosition]);

    const sortedProjects = [...projects].sort((a, b) => {
        if (sortOption === 'updated-desc') {
            return (b.updated_at || 0) - (a.updated_at || 0);
        }
        if (sortOption === 'created-desc') {
            return (b.created_at || 0) - (a.created_at || 0);
        }
        if (sortOption === 'title-asc') {
            return a.name.localeCompare(b.name);
        }
        if (sortOption === 'title-desc') {
            return b.name.localeCompare(a.name);
        }
        if (sortOption === 'series-asc') {
            const seriesA = a.series || '';
            const seriesB = b.series || '';
            if (seriesA !== seriesB) {
                return seriesA.localeCompare(seriesB);
            }
            const posA = a.series_position ?? Number.POSITIVE_INFINITY;
            const posB = b.series_position ?? Number.POSITIVE_INFINITY;
            if (posA !== posB) {
                return posA - posB;
            }
            return a.name.localeCompare(b.name);
        }
        return 0;
    });

    const filteredProjects = statusFilter === 'in-progress'
        ? sortedProjects.filter((project) => project.status === 'drafting' || project.status === 'casting')
        : sortedProjects;

    const handleCoverChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelection(file);
    };

    const handleFileSelection = (file: File) => {
        setCoverFile(file);
        const reader = new FileReader();
        reader.onloadend = () => setCoverPreview(reader.result as string);
        reader.readAsDataURL(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file && file.type.startsWith('image/')) {
            handleFileSelection(file);
        }
    };

    const handleCreateProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title) return;
        const parsedSeriesPosition = parseSeriesPositionInput(seriesPosition);
        if (parsedSeriesPosition.error) {
            emitToast(parsedSeriesPosition.error);
            return;
        }
        setSubmitting(true);
        try {
            const res = await api.createProject({
                name: title,
                series,
                series_position: parsedSeriesPosition.value,
                author,
                cover: coverFile || undefined
            });
            if (res.status === 'ok' || res.status === 'success') {
                // Clear state immediately
                setTitle('');
                setSeries('');
                setSeriesPosition('');
                setSeriesPositionTouched(false);
                setAuthor('');
                setCoverFile(null);
                setCoverPreview(null);
                setShowModal(false);
                
                await loadProjects();
                onSelectProject?.(res.project_id);
                navigate(`/project/${res.project_id}`);
            }
        } catch (e) {
            console.error("Failed to create project:", e);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteClick = (id: string, name: string) => {
        setDeleteModal({
            isOpen: true,
            projectId: id,
            projectName: name
        });
    };

    const handleOpenProjectDetails = (projectId: string) => {
        navigate(`/project/${projectId}/details`);
    };

    const confirmDelete = async () => {
        if (!deleteModal.projectId) return;
        try {
            await api.deleteProject(deleteModal.projectId);
            loadProjects();
        } catch (err) {
            console.error("Delete failed", err);
        } finally {
            setDeleteModal({ isOpen: false, projectId: null, projectName: null });
        }
    };

    return {
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
        setIsDragging,
        fileInputRef,
        hoveredProjectId,
        setHoveredProjectId,
        deleteModal,
        setDeleteModal,
        handleCoverChange,
        handleFileSelection,
        handleCreateProject,
        handleDeleteClick,
        handleOpenProjectDetails,
        confirmDelete,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        loadProjects,
        viewMode,
        setViewMode,
        sortOption,
        setSortOption,
        sortedProjects,
        statusFilter,
        setStatusFilter,
        filteredProjects,
        existingSeries
    };
};
