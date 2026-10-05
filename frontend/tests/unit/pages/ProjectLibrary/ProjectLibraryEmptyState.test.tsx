import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the hook so we can control the projects list
const mockHook = vi.fn()
vi.mock('@/hooks/useProjectLibrary', () => ({
  useProjectLibrary: () => mockHook(),
}))

// Stub sub-components that make API calls
vi.mock('@/pages/ProjectDetail/components/ProjectCard', () => ({
  ProjectCard: () => <div data-testid="project-card" />,
}))
vi.mock('@/pages/ProjectLibrary/components/LibraryControls', () => ({
  LibraryControls: () => <div />,
}))
vi.mock('@/pages/ProjectLibrary/components/ProjectListView', () => ({
  ProjectListView: () => <div />,
}))

import { ProjectLibrary } from '@/pages/ProjectLibrary/ProjectLibraryPage'

function baseHookReturn(overrides = {}) {
  return {
    projects: [],
    loading: false,
    showModal: false,
    setShowModal: vi.fn(),
    title: '',
    setTitle: vi.fn(),
    series: '',
    setSeries: vi.fn(),
    author: '',
    setAuthor: vi.fn(),
    coverPreview: null,
    submitting: false,
    isDragging: false,
    fileInputRef: { current: null },
    hoveredProjectId: null,
    setHoveredProjectId: vi.fn(),
    deleteModal: { isOpen: false, projectId: null, projectName: null },
    setDeleteModal: vi.fn(),
    handleCoverChange: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
    handleCreateProject: vi.fn(),
    handleDeleteClick: vi.fn(),
    confirmDelete: vi.fn(),
    viewMode: 'grid' as const,
    setViewMode: vi.fn(),
    sortOption: 'recent' as const,
    setSortOption: vi.fn(),
    sortedProjects: [],
    statusFilter: 'all' as const,
    setStatusFilter: vi.fn(),
    filteredProjects: [],
    ...overrides,
  }
}

function wrap(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

describe('ProjectLibrary empty-state branch (Q12)', () => {
  beforeEach(() => {
    mockHook.mockReset()
  })

  it('shows only the centered empty state (no greeting header) when projects is empty', () => {
    mockHook.mockReturnValue(baseHookReturn({ projects: [] }))
    wrap(<ProjectLibrary />)
    // Empty state CTA present
    expect(screen.getByRole('button', { name: /new project/i })).toBeTruthy()
    // Populated-state greeting header absent in the empty state
    expect(screen.queryByText(/Good (morning|afternoon|evening)/i)).toBeNull()
  })

  it('shows the greeting header when projects exist', () => {
    const project = { id: 'p1', title: 'Test', created_at: 0, updated_at: 0, chapters: [], characters: [] }
    mockHook.mockReturnValue(baseHookReturn({ projects: [project], sortedProjects: [project], filteredProjects: [project] }))
    wrap(<ProjectLibrary />)
    expect(screen.getByText(/Good (morning|afternoon|evening)/i)).toBeTruthy()
  })

  it('opens the create modal when the empty-state CTA is clicked', () => {
    const setShowModal = vi.fn()
    mockHook.mockReturnValue(baseHookReturn({ projects: [], setShowModal }))
    wrap(<ProjectLibrary />)
    fireEvent.click(screen.getByRole('button', { name: /new project/i }))
    expect(setShowModal).toHaveBeenCalledWith(true)
  })
})
