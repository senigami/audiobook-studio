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
                            // Noon UTC on distinct known dates so the formatted output is
                            // stable across local timezones and Created/Updated map to
                            // visibly different, verifiable calendar dates.
                            created_at: 1709985600, // 2024-03-09T12:00:00Z
                            updated_at: 1713182400, // 2024-04-15T12:00:00Z
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

        // Ties the displayed text to the actual formatted values of the fixture's
        // created_at/updated_at unix timestamps, so a broken formatDate call (e.g.
        // wrong field, missing *1000) would be caught rather than just checking labels exist.
        expect(screen.getByText('Created Mar 9, 2024')).toBeTruthy()
        expect(screen.getByText('Updated Apr 15, 2024')).toBeTruthy()
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
