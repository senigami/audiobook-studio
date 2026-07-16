import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ProjectLibrary } from '@/pages/ProjectLibrary/ProjectLibraryPage'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addBookmark, _resetCache } from '@/store/bookmarks'

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

    it('shows only the updated date in the default grid view (Created dropped, item 4 of the 2026-07-14 HIG review)', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await screen.findByText('Test Project')

        // Ties the displayed text to the actual formatted value of the fixture's
        // updated_at unix timestamp, so a broken formatDate call (e.g. wrong
        // field, missing *1000) would be caught rather than just checking the
        // label exists. Grid cards show one date (Updated), not both.
        expect(screen.getByText('Updated Apr 15, 2024')).toBeTruthy()
        expect(screen.queryByText(/^Created /)).toBeNull()
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

describe('ProjectLibrary library-wide bookmarks panel', () => {
    beforeEach(() => {
        localStorage.clear()
        _resetCache()
        global.fetch = vi.fn((url) => {
            if (url === '/api/projects') {
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve([
                        {
                            id: 'book-1',
                            name: 'The Whispering Vale',
                            series: null,
                            author: null,
                            created_at: 1709985600,
                            updated_at: 1713182400,
                            cover_image_path: null,
                        },
                        {
                            id: 'book-2',
                            name: 'Ashes of Meridian',
                            series: null,
                            author: null,
                            created_at: 1709985600,
                            updated_at: 1713182400,
                            cover_image_path: null,
                        },
                    ])
                })
            }
            return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
        }) as any
    })

    it('shows bookmarks from every book, each labeled with its book title', async () => {
        addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'The reveal' })
        addBookmark({ bookId: 'book-2', chapterId: 'ch-9', label: 'The ambush' })

        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        await screen.findByText('The reveal')

        expect(screen.getByText('The reveal')).toBeInTheDocument()
        expect(screen.getByText('The ambush')).toBeInTheDocument()
        // Book title shown as secondary context on each row
        expect(screen.getAllByText('The Whispering Vale').length).toBeGreaterThan(0)
        expect(screen.getAllByText('Ashes of Meridian').length).toBeGreaterThan(0)
    })

    it('collapses the bookmarks panel entirely when there are no bookmarks anywhere (item 6, 2026-07-14 HIG review)', async () => {
        render(
            <MemoryRouter>
                <ProjectLibrary onSelectProject={vi.fn()} />
            </MemoryRouter>
        )

        // Wait for the library to finish loading before asserting an absence.
        await screen.findByText(/Good (morning|afternoon|evening)/i)

        expect(screen.queryByText(/bookmarks/i)).toBeNull()
        expect(screen.queryByText(/no bookmarks yet/i)).toBeNull()
    })

    it('navigates to the bookmarked book/chapter when a row is clicked', async () => {
        addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'The reveal' })

        render(
            <MemoryRouter initialEntries={['/']}>
                <Routes>
                    <Route path="/" element={<ProjectLibrary onSelectProject={vi.fn()} />} />
                    <Route path="/book/:bookId/chapter/:chapterId" element={<div>Chapter workspace</div>} />
                </Routes>
            </MemoryRouter>
        )

        await screen.findByText('The reveal')
        fireEvent.click(screen.getByRole('listitem').querySelector('.bookmark-list__nav-btn')!)

        expect(await screen.findByText('Chapter workspace')).toBeInTheDocument()
    })
})
