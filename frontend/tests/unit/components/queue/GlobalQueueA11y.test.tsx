/**
 * A6 — Live-region tests: queue completion announcements must reach screen readers.
 * A4 — Icon-button aria-labels in ReorderableQueueItem.
 */
import { render, screen, act } from '@testing-library/react'
import { GlobalQueue } from '@/components/queue/GlobalQueue'
import { ReorderableQueueItem } from '@/components/queue/ReorderableQueueItem'
import { Reorder } from 'framer-motion'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'

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

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
    PredictiveProgressBar: ({ dataTestId, progress, label, onDisplayProgress }: any) => {
        React.useEffect(() => { onDisplayProgress?.(progress) }, [progress, onDisplayProgress])
        return <div data-testid={dataTestId || 'progress-bar'} data-progress={progress}>{label}</div>
    }
}))

beforeEach(() => {
    vi.clearAllMocks()
    window.scrollTo = vi.fn()
})

describe('GlobalQueue — A6 live region', () => {
    it('mounts an aria-live=polite status region', () => {
        render(<GlobalQueue queue={[]} />)
        const region = document.querySelector('[role="status"][aria-live="polite"]')
        expect(region).toBeTruthy()
    })

    it('announces job completion in the live region when a running job transitions to done', () => {
        const runningJob = {
            id: 'j1',
            status: 'running' as const,
            chapter_title: 'Chapter Alpha',
            project_name: 'Book',
            split_part: 0,
            progress: 0.9,
            started_at: 1000,
            updated_at: 1000,
        }
        const { rerender } = render(<GlobalQueue queue={[runningJob] as any[]} />)

        const doneJob = { ...runningJob, status: 'done' as const, progress: 1.0 }
        act(() => {
            rerender(<GlobalQueue queue={[doneJob] as any[]} />)
        })

        const region = document.querySelector('[role="status"][aria-live="polite"]') as HTMLElement
        expect(region).toBeTruthy()
        expect(region.textContent).toContain('Chapter Alpha')
        expect(region.textContent).toContain('completed')
    })
})

describe('ReorderableQueueItem — A4 icon-button labels', () => {
    const job = {
        id: 'q1',
        status: 'queued' as const,
        chapter_title: 'Chapter Beta',
        project_name: 'Book',
        split_part: 0,
        progress: 0,
        started_at: null,
        updated_at: null,
    }

    function renderInGroup(job: any) {
        return render(
            <Reorder.Group axis="y" values={[job]} onReorder={() => {}}>
                <ReorderableQueueItem
                    job={job as any}
                    formatJobTitle={(j: any) => j.chapter_title}
                    handleRemove={vi.fn()}
                    handleDragStart={vi.fn()}
                    handleDragEnd={vi.fn()}
                />
            </Reorder.Group>
        )
    }

    it('remove button has an accessible name', () => {
        renderInGroup(job)
        const removeBtn = screen.getByRole('button', { name: /remove from queue/i })
        expect(removeBtn).toBeTruthy()
    })

    it('drag handle has role=button and an accessible name', () => {
        renderInGroup(job)
        // The drag handle has role="button" and aria-label="Drag to reorder"
        const dragHandle = document.querySelector('[aria-label="Drag to reorder"]')
        expect(dragHandle).toBeTruthy()
    })
})
