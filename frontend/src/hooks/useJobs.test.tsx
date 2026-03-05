import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useJobs } from './useJobs'

vi.mock('../api', () => ({
    api: {
        fetchJobs: vi.fn().mockResolvedValue([
            { id: 'job1', chapter_file: 'c1.txt', status: 'done', progress: 1.0 }
        ])
    }
}))

describe('useJobs', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('fetches initial jobs', async () => {
        const { result } = renderHook(() => useJobs())
        
        expect(result.current.loading).toBe(true)

        await waitFor(() => {
            expect(result.current.loading).toBe(false)
        })

        expect(result.current.jobs).toBeDefined()
        expect(result.current.jobs['job1']).toBeDefined()
        expect(result.current.jobs['job1'].id).toBe('job1')
    })
})
