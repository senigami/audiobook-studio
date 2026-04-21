import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { GlobalQueue } from './GlobalQueue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api'

// Mock the API
vi.mock('../api', () => ({
    api: {
        reorderProcessingQueue: vi.fn(),
        removeProcessingQueue: vi.fn().mockResolvedValue({}),
        clearProcessingQueue: vi.fn().mockResolvedValue({}),
        clearCompletedJobs: vi.fn().mockResolvedValue({}),
        toggleQueuePause: vi.fn().mockResolvedValue({}),
        cancelChapterGeneration: vi.fn().mockResolvedValue({}),
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
        window.scrollTo = vi.fn()
    })

    it('renders loading state when loading prop is true', () => {
        render(<GlobalQueue queue={[]} loading={true} />)
        expect(screen.getByText(/Loading Queue\.\.\./i)).toBeTruthy()
    })

    it('renders the queue sections correctly', async () => {
        render(<GlobalQueue queue={mockJobs as any[]} />)
        
        expect(await screen.findByText(/Processing Now/i)).toBeTruthy()
        expect(screen.getByText(/Up Next/i)).toBeTruthy()
        expect(screen.getByText(/Completed \/ Failed History/i)).toBeTruthy()
        
        expect(screen.getByText('Chapter 1')).toBeTruthy()
        expect(screen.getByText('Chapter 2')).toBeTruthy()
    })

    it('prefers custom titles over raw chapter titles when present', async () => {


        const customItem = {
            id: 'job-seg',
            status: 'running',
            chapter_title: 'overview',
            custom_title: 'overview * Part 5: segment #7',
            project_name: 'Project A',
            split_part: 0,
            progress: 0.5
        };

        render(<GlobalQueue queue={[customItem] as any[]} />)

        expect(await screen.findByText('overview * Part 5: segment #7')).toBeTruthy()
        expect(screen.queryByText(/^overview$/i)).toBeNull()
    })

    it('toggles pause state', async () => {
        // Now relying on the api mock instead of fetch
        render(<GlobalQueue paused={false} queue={mockJobs as any[]} />)
        
        const pauseBtn = await screen.findByText(/Pause All Jobs/i)
        fireEvent.click(pauseBtn)
        
        expect(api.toggleQueuePause).toHaveBeenCalledWith(true)
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


        render(<GlobalQueue queue={mockJobsWithTime as any[]} />)
        
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
        render(<GlobalQueue queue={mockJobs as any[]} />)
        
        const menuBtn = await screen.findByRole('button', { name: /more actions/i }) // The kebab button
        fireEvent.click(menuBtn)
        
        const clearCompletedBtn = await screen.findByText(/Clear Completed/i)
        fireEvent.click(clearCompletedBtn)
        
        expect(api.clearCompletedJobs).toHaveBeenCalled()
    })

    it('calls removeProcessingQueue when a queued job is cancelled', async () => {
        render(<GlobalQueue queue={mockJobs as any[]} />)
        
        const removeBtns = await screen.findAllByRole('button', { name: /Cancel Job/i })
        // Click the first one (assume the first row's remove button)
        fireEvent.click(removeBtns[0])
        
        expect(api.removeProcessingQueue).toHaveBeenCalled()
    })

    it('calls clearProcessingQueue after confirmation', async () => {
        render(<GlobalQueue queue={mockJobs as any[]} />)
        
        const menuBtn = await screen.findByRole('button', { name: /more actions/i })
        fireEvent.click(menuBtn)
        
        const clearAllBtn = await screen.findByText(/Clear All/i)
        fireEvent.click(clearAllBtn)

        expect(await screen.findByText(/Are you sure you want to clear all/i)).toBeTruthy()
        
        // Find and click the confirm button in the modal
        const confirmBtn = await screen.findByText('Clear All', { selector: 'button' })
        await act(async () => {
            fireEvent.click(confirmBtn)
        })
        
        await waitFor(() => {
            expect(api.clearProcessingQueue).toHaveBeenCalled()
        })
    })

    it('trusts merged queue status as authoritative even if legacy liveJob is stale', async () => {
        const mergedQueue = [
            { id: 'job-1', status: 'running', chapter_title: 'Authoritative Chapter', progress: 0.5 } as any
        ];
        // Legacy job says finalizing (Priority 4) but authoritative queue says running (Priority 3)
        const legacyJobs = {
            'job-1': { id: 'job-1', status: 'finalizing', progress: 1.0 } as any
        };

        render(<GlobalQueue queue={mergedQueue} jobs={legacyJobs} />)
        
        // Should show 'Processing Now (1)' because it trusts 'running' status
        expect(await screen.findByText(/Processing Now \(1\)/i)).toBeTruthy();
        
        // PredictiveProgressBar label for running is "Processing..."
        expect(screen.getByText(/Processing\.\.\./i)).toBeTruthy();
        expect(screen.queryByText(/Finalizing\.\.\./i)).toBeNull();
    })
})
