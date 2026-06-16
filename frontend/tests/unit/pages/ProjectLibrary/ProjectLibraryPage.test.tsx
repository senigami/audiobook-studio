import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectLibrary } from '@/pages/ProjectLibrary/ProjectLibraryPage'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'

describe('ProjectLibrary', () => {
    beforeEach(() => {
        global.fetch = vi.fn((url, options) => {
            if (url === '/api/projects') {
                if (options?.method === 'POST') {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({ status: 'success', project_id: '123' })
                    })
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([
                        {
                            id: 'project-1',
                            name: 'Test Project',
                            series: 'Test Series',
                            author: 'Test Author',
                            created_at: 1000,
                            updated_at: 2000,
                            cover_image_path: null
                        }
                    ])
                })
            }
            if (url.startsWith('/api/projects/project-1')) {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({ status: 'success' })
                })
            }
            return Promise.resolve({
                ok: true,
                json: () => Promise.resolve({})
            })
        }) as any
    })

    it('renders the library greeting header and projects', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        // The marketing hero was replaced by a time-based greeting header.
        expect(await screen.findByText(/Good (morning|afternoon|evening)/i)).toBeTruthy()

        await waitFor(() => {
            expect(screen.getByText('Test Project')).toBeTruthy()
        })
    })

    it('shows created and updated dates in the default grid view', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await screen.findByText('Test Project')

        expect(screen.getByText(/^Created/i)).toBeTruthy()
        expect(screen.getByText(/^Updated/i)).toBeTruthy()
    })

    it('opens create modal', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )
        const createBtn = await screen.findByText(/New Project/i)
        fireEvent.click(createBtn)

        expect(screen.getByText('Title *')).toBeTruthy()
    })

    it('does not contain hardcoded XTTS-v2 copy', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        // Wait for page to load
        await screen.findByText(/Good (morning|afternoon|evening)/i)

        // Assert that the static model label is gone
        expect(screen.queryByText(/Model: XTTS-v2/i)).toBeNull()
    })
})
