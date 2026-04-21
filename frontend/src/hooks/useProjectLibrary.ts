import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Project } from '../types';
import { api } from '../api';

export const useProjectLibrary = (onSelectProject?: (projectId: string) => void) => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Create/Edit Modal state
    const [showModal, setShowModal] = useState(false);
    const [title, setTitle] = useState('');
    const [series, setSeries] = useState('');
    const [author, setAuthor] = useState('');
    const [coverFile, setCoverFile] = useState<File | null>(null);
    const [coverPreview, setCoverPreview] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        setSubmitting(true);
        try {
            const res = await api.createProject({ name: title, series, author, cover: coverFile || undefined });
            if (res.status === 'ok' || res.status === 'success') {
                // Clear state immediately
                setTitle('');
                setSeries('');
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
        confirmDelete,
        handleDragOver,
        handleDragLeave,
        handleDrop,
        loadProjects
    };
};
