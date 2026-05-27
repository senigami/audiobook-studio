import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import { GlobalQueue } from '@/components/queue/GlobalQueue'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '@/api'

// Mock the API
vi.mock('@/api', () => ({
    api: {
        reorderProcessingQueue: vi.fn(),
        removeProcessingQueue: vi.fn().mockResolvedValue({}),
        clearProcessingQueue: vi.fn().mockResolvedValue({}),
        clearCompletedJobs: vi.fn().mockResolvedValue({}),
        toggleQueuePause: vi.fn().mockResolvedValue({}),
        cancelChapterGeneration: vi.fn().mockResolvedValue({}),
    }
}))

// Mock predictive progress bar
vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({
    progress,
    label,
    dataTestId
  }: any) => (
    <div
      data-testid={dataTestId || "progress-bar"}
      data-progress={progress}
    >
      {label}
    </div>
  )
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
            custom_title: 'overview * Part 5: Custom Title',
            project_name: 'Project A',
            split_part: 0,
            progress: 0.5
        };

        render(<GlobalQueue queue={[customItem] as any[]} />)

        expect(await screen.findByText('overview * Part 5: Custom Title')).toBeTruthy()
        expect(screen.queryByText(/^overview$/i)).toBeNull()
    })

    it('does not render segment-scoped overlay jobs as separate active items', () => {
        const segmentItem = {
            id: 'job-seg-1',
            status: 'running',
            chapter_title: 'overview',
            custom_title: 'overview * Part 5: segment #7',
            project_name: 'Project A',
            split_part: 0,
            progress: 0.5,
            segment_ids: ['seg-1']
        };

        render(<GlobalQueue queue={[segmentItem] as any[]} />)

        // Queue is empty because segment jobs are filtered out
        expect(screen.queryByText('overview * Part 5: segment #7')).toBeNull()
        expect(screen.getByText(/Queue is empty/i)).toBeTruthy()
    })

    it('chapter-scoped jobs still render in the main queue', async () => {
        const chapterItem = {
            id: 'job-chap-1',
            status: 'running',
            chapter_title: 'Chapter 1',
            project_name: 'Project A',
            split_part: 0,
            progress: 0.5
        };

        render(<GlobalQueue queue={[chapterItem] as any[]} />)

        expect(await screen.findByText('Chapter 1')).toBeTruthy()
        expect(screen.queryByText(/Queue is empty/i)).toBeNull()
    })

    it('keeps grouped chapter jobs visible after active segment progress starts', async () => {
        const groupedChapterItem = {
            id: 'job-grouped-chap-1',
            status: 'running',
            chapter_title: 'Chapter 1',
            project_name: 'Project A',
            split_part: 0,
            progress: 0.5,
            render_group_count: 2,
            active_segment_id: 'seg-1',
            active_segment_progress: 0.2,
        };

        render(<GlobalQueue queue={[groupedChapterItem] as any[]} />)

        expect(await screen.findByText('Chapter 1')).toBeTruthy()
        expect(screen.queryByText(/Queue is empty/i)).toBeNull()
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

    it('shows a timestamp for failed history jobs without a start time', async () => {
        const failedAt = 1710000060;
        const queue = [
            {
                id: 'job-failed',
                status: 'failed',
                chapter_title: 'Failed Chapter',
                project_name: 'Project A',
                split_part: 0,
                progress: 1,
                finished_at: failedAt,
                completed_at: failedAt,
                updated_at: failedAt,
                error: 'Mixed synthesis returned failed',
            },
        ];

        render(<GlobalQueue queue={queue as any[]} />)

        fireEvent.click(await screen.findByText(/Completed \/ Failed History/i))

        expect(await screen.findByText('Failed Chapter')).toBeTruthy()
        expect(screen.getByText('failed')).toBeTruthy()
        expect(screen.getByText(/Reason:/i)).toBeTruthy()
        expect(screen.getByText(/Mixed synthesis returned failed/i)).toBeTruthy()
        expect(screen.getByText((content) => content.includes('2024') || content.includes('Mar'))).toBeTruthy()
    })

    it('shows completed output metadata in history when available', async () => {
        const queue = [
            {
                id: 'job-done-metadata',
                status: 'done',
                chapter_title: 'Chapter With Metadata',
                project_name: 'Project A',
                split_part: 0,
                produced_audio_length: 75.4,
                produced_chars: 1234,
                produced_segment_count: 5,
            },
        ];

        render(<GlobalQueue queue={queue as any[]} />)

        fireEvent.click(await screen.findByText(/Completed \/ Failed History/i))

        expect(await screen.findByText('Chapter With Metadata')).toBeTruthy()
        expect(screen.getByText('1m 15s')).toBeTruthy()
        expect(screen.getByText('1,234 chars • 5 segments')).toBeTruthy()
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
            'job-1': { id: 'job-1', status: 'finalizing', progress: 0.5 } as any
        };

        render(<GlobalQueue queue={mergedQueue} jobs={legacyJobs} />)
        
        // Should show 'Processing Now (1)' because it trusts 'running' status
        expect(await screen.findByText(/Processing Now \(1\)/i)).toBeTruthy();
        
        // PredictiveProgressBar label for running is "Processing..."
        expect(screen.getByText(/Processing\.\.\./i)).toBeTruthy();
        expect(screen.queryByText(/Finalizing\.\.\./i)).toBeNull();
    })

    it('does not resurrect stale progress from liveJob when the merged queue row is queued or preparing', () => {
        const mergedQueue = [
            { id: 'job-stale-progress', status: 'preparing', progress: 0, chapter_title: 'Preparing Chapter' } as any
        ];
        // liveJob says running and progress is 0.77 (stale)
        const legacyJobs = {
            'job-stale-progress': { id: 'job-stale-progress', status: 'running', progress: 0.77 } as any
        };

        render(<GlobalQueue queue={mergedQueue} jobs={legacyJobs} />);

        // The job status is preparing, so its progress should be 0 (not 0.77)
        // The display label should be "Preparing..."
        expect(screen.getByText('Preparing...')).toBeTruthy();
        expect(screen.getByTestId('queue-item-progress-bar')).toHaveAttribute('data-progress', '0');
    });

    it('identifies chapter jobs without engine-name heuristics', () => {
        const queue = [
            {
                id: 'job-custom-engine',
                status: 'running',
                progress: 0.5,
                chapter_title: 'Custom Engine Chapter',
                engine: 'my-custom-plugin-tts', // Not xtts or mixed
            } as any
        ];
        render(<GlobalQueue queue={queue} />);

        // It should identify it as a chapter-scoped job and render it in the processing now section
        expect(screen.getByText('Custom Engine Chapter')).toBeTruthy();
        expect(screen.queryByText(/Queue is empty/i)).toBeNull();
    });
})
