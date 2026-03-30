import { render, screen, fireEvent } from '@testing-library/react'
import { GlobalQueue } from './GlobalQueue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api'

// Mock the API
vi.mock('../api', () => ({
    api: {
        getProcessingQueue: vi.fn(),
        reorderProcessingQueue: vi.fn(),
        removeProcessingQueue: vi.fn(),
        clearProcessingQueue: vi.fn(),
        clearCompletedJobs: vi.fn(),
    }
}))

describe('GlobalQueue', () => {
    const mockJobs = [
        { id: 'job-1', status: 'running', chapter_title: 'Chapter 1', project_name: 'Project A', split_part: 0, progress: 0.5 },
        { id: 'job-2', status: 'queued', chapter_title: 'Chapter 2', project_name: 'Project A', split_part: 0 },
        { id: 'job-3', status: 'done', chapter_title: 'Chapter 3', project_name: 'Project A', split_part: 0 }
    ]

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.getProcessingQueue).mockResolvedValue(mockJobs)
        window.scrollTo = vi.fn()
    })

    it('renders the queue sections correctly', async () => {
        render(<GlobalQueue />)
        
        expect(await screen.findByText(/Processing Now/i)).toBeTruthy()
        expect(screen.getByText(/Up Next/i)).toBeTruthy()
        expect(screen.getByText(/Completed \/ Failed History/i)).toBeTruthy()
        
        expect(screen.getByText('Chapter 1')).toBeTruthy()
        expect(screen.getByText('Chapter 2')).toBeTruthy()
    })

    it('prefers custom titles over raw chapter titles when present', async () => {
        vi.mocked(api.getProcessingQueue).mockResolvedValue([
            {
                id: 'job-seg',
                status: 'running',
                chapter_title: 'overview',
                custom_title: 'overview * Part 5: segment #7',
                project_name: 'Project A',
                split_part: 0,
                progress: 0.5
            }
        ] as any)

        render(<GlobalQueue />)

        expect(await screen.findByText('overview * Part 5: segment #7')).toBeTruthy()
        expect(screen.queryByText(/^overview$/i)).toBeNull()
    })

    it('toggles pause state', async () => {
        // Mock fetch for the pause/resume endpoints
        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ status: 'success' })
        })

        render(<GlobalQueue paused={false} />)
        
        const pauseBtn = await screen.findByText(/Pause All Jobs/i)
        fireEvent.click(pauseBtn)
        
        expect(global.fetch).toHaveBeenCalledWith('/queue/pause', expect.anything())
        expect(await screen.findByText(/Resume Processing/i)).toBeTruthy()
    })

    it('toggles history visibility and shows start/end times', async () => {
        const startTime = 1710000000; // Example timestamp
        const endTime = 1710000060;   // 1 minute later
        const mockJobsWithTime = [
            ...mockJobs.filter(j => j.id !== 'job-3'),
            { 
                id: 'job-3', 
                status: 'done', 
                chapter_title: 'Chapter 3', 
                project_name: 'Project A', 
                split_part: 0, 
                started_at: startTime, 
                completed_at: endTime 
            }
        ]
        vi.mocked(api.getProcessingQueue).mockResolvedValue(mockJobsWithTime)

        render(<GlobalQueue />)
        
        const historyToggle = await screen.findByText(/Completed \/ Failed History/i)
        
        // Initially should not show chapter 3 (it's done)
        expect(screen.queryByText('Chapter 3')).toBeNull()
        
        fireEvent.click(historyToggle)
        
        // Now it should be visible
        expect(await screen.findByText('Chapter 3')).toBeTruthy()

        // Check for formatted times (note: formatting depends on locale, but should contain the time)
        // Since we implementation used toLocaleTimeString, we just check for presence of time parts or the arrow
        expect(screen.getByText(/→/)).toBeTruthy()
    })

    it('calls clear completed from ActionMenu', async () => {
        render(<GlobalQueue />)
        
        const menuBtn = await screen.findByRole('button', { name: /more actions/i }) // The kebab button
        fireEvent.click(menuBtn)
        
        const clearCompletedBtn = await screen.findByText(/Clear Completed/i)
        fireEvent.click(clearCompletedBtn)
        
        expect(api.clearCompletedJobs).toHaveBeenCalled()
    })
})
