import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectLibrary } from '@/pages/ProjectLibrary/ProjectLibraryPage'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ProjectLibrary Controls', () => {
    const mockProjects = [
        {
            id: 'project-a',
            name: 'Project Alpha',
            series: 'Series A',
            author: 'Author A',
            created_at: 1000,
            updated_at: 1000,
            cover_image_path: null
        },
        {
            id: 'project-z',
            name: 'Project Zulu',
            series: 'Series Z',
            author: 'Author Z',
            created_at: 2000,
            updated_at: 2000,
            cover_image_path: null
        }
    ];

    beforeEach(() => {
        global.fetch = vi.fn((url) => {
            if (url === '/api/projects') {
                return Promise.resolve({
                    json: () => Promise.resolve(mockProjects)
                })
            }
            return Promise.resolve({
                json: () => Promise.resolve({})
            })
        }) as any
    })

    it('toggles between grid and list view', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByText('Project Alpha'))

        const listToggle = screen.getByLabelText(/List View/i)
        const gridToggle = screen.getByLabelText(/Grid View/i)

        expect(gridToggle).toHaveClass('active')
        expect(listToggle).not.toHaveClass('active')

        fireEvent.click(listToggle)

        expect(listToggle).toHaveClass('active')
        expect(gridToggle).not.toHaveClass('active')
        
        // Confirm list view specific elements or structure
        // In list view we expect a table-like structure or specific class
        expect(screen.getByRole('list')).toHaveClass('project-list-view')
    })

    it('shows created and updated columns in list view', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByText('Project Alpha'))

        fireEvent.click(screen.getByLabelText(/List View/i))

        expect(screen.getByRole('columnheader', { name: /Created/i })).toBeTruthy()
        expect(screen.getByRole('columnheader', { name: /Updated/i })).toBeTruthy()
    })

    it('sorts projects by title A-Z and Z-A', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByText('Project Alpha'))

        const sortSelect = screen.getByLabelText(/Sort Projects/i)
        
        // Default should be Recently Updated (Zulu first because it has updated_at 2000)
        let projectNames = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
        expect(projectNames[0]).toBe('Project Zulu')
        expect(projectNames[1]).toBe('Project Alpha')

        // Sort Title A-Z
        fireEvent.change(sortSelect, { target: { value: 'title-asc' } })
        projectNames = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
        expect(projectNames[0]).toBe('Project Alpha')
        expect(projectNames[1]).toBe('Project Zulu')

        // Sort Title Z-A
        fireEvent.change(sortSelect, { target: { value: 'title-desc' } })
        projectNames = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
        expect(projectNames[0]).toBe('Project Zulu')
        expect(projectNames[1]).toBe('Project Alpha')
    })

    it('sorts projects by updated_at', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByText('Project Alpha'))

        const sortSelect = screen.getByLabelText(/Sort Projects/i)
        
        // Sort Title A-Z first to change order
        fireEvent.change(sortSelect, { target: { value: 'title-asc' } })
        
        // Now sort by Recently Updated
        fireEvent.change(sortSelect, { target: { value: 'updated-desc' } })
        const projectNames = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
        expect(projectNames[0]).toBe('Project Zulu') // 2000 > 1000
        expect(projectNames[1]).toBe('Project Alpha')
    })

    it('sorts projects by created_at', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await waitFor(() => screen.getByText('Project Alpha'))

        const sortSelect = screen.getByLabelText(/Sort Projects/i)
        
        // Sort Title A-Z first to change order
        fireEvent.change(sortSelect, { target: { value: 'title-asc' } })
        
        // Now sort by Newest First
        fireEvent.change(sortSelect, { target: { value: 'created-desc' } })
        const projectNames = screen.getAllByRole('heading', { level: 3 }).map(h => h.textContent)
        expect(projectNames[0]).toBe('Project Zulu') // 2000 > 1000
        expect(projectNames[1]).toBe('Project Alpha')
    })
})
