import { vi, describe, it, expect, beforeEach } from 'vitest'
import { api } from './index'

describe('api methods', () => {
    beforeEach(() => {
        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ success: true })
        }) as any
    })

    it('projects', async () => {
        await api.fetchProjects()
        expect(global.fetch).toHaveBeenCalledWith('/api/projects')

        await api.fetchProject('1')
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/1')

        await api.createProject({ name: 'test', series: 'series', author: 'tester' })
        expect(global.fetch).toHaveBeenCalledWith('/api/projects', expect.anything())

        await api.updateProject('1', { name: 'test2' })
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/1', expect.anything())

        await api.deleteProject('1')
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/1', { method: 'DELETE' })

        await api.assembleProject('1', ['c1'])
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/1/assemble', expect.anything())
    })

    it('chapters', async () => {
        await api.fetchChapters('1')
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/1/chapters')

        await api.createChapter('1', { title: 'Chapter 1', text_content: 'hello' })
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/1/chapters', expect.anything())

        await api.updateChapter('c1', { title: 'Chapter 1' })
        expect(global.fetch).toHaveBeenCalledWith('/api/chapters/c1', expect.anything())
    })

    it('other', async () => {
        await api.fetchJobs()
        expect(global.fetch).toHaveBeenCalledWith('/api/jobs')

        await api.updateTitle('c1.txt', 'New Title')
        expect(global.fetch).toHaveBeenCalledWith('/api/job/update_title', expect.anything())

        await api.deleteAudiobook('ab1')
        expect(global.fetch).toHaveBeenCalledWith('/api/audiobook/ab1', expect.objectContaining({ method: 'DELETE' }))

        await api.deleteAudiobook('ab1', 'p1')
        expect(global.fetch).toHaveBeenCalledWith('/api/audiobook/ab1?project_id=p1', expect.objectContaining({ method: 'DELETE' }))

        await api.resetChapter('c1.txt')
        expect(global.fetch).toHaveBeenCalledWith('/api/chapters/c1.txt/reset', expect.objectContaining({ method: 'POST' }))

        await api.deleteChapter('c1.txt')
        expect(global.fetch).toHaveBeenCalledWith('/api/chapters/c1.txt', expect.objectContaining({ method: 'DELETE' }))

        await api.reorderChapters('p1', ['c1', 'c2'])
        expect(global.fetch).toHaveBeenCalledWith('/api/projects/p1/reorder_chapters', expect.objectContaining({ method: 'POST' }))

        await api.fetchActiveJob()
        expect(global.fetch).toHaveBeenCalledWith('/api/active_job')

        await api.fetchJobDetails('f1')
        expect(global.fetch).toHaveBeenCalledWith('/api/job/f1')

        await api.fetchPreview('f1', true)
        expect(global.fetch).toHaveBeenCalledWith('/api/preview/f1?processed=true')

        await api.enqueueSingle('f1', 'xtts', 'v1')
        expect(global.fetch).toHaveBeenCalledWith('/api/queue/single', expect.objectContaining({ method: 'POST' }))

        await api.cancelPending()
        expect(global.fetch).toHaveBeenCalledWith('/api/queue/cancel_pending', expect.objectContaining({ method: 'POST' }))

        await api.exportSample('f1')
        expect(global.fetch).toHaveBeenCalledWith('/api/chapter/f1/export-sample', expect.objectContaining({ method: 'POST' }))

        await api.getProcessingQueue()
        expect(global.fetch).toHaveBeenCalledWith('/api/processing_queue')

        await api.addProcessingQueue('p1', 'c1', 0, 'v1')
        expect(global.fetch).toHaveBeenCalledWith('/api/processing_queue', expect.objectContaining({ method: 'POST' }))

        await api.fetchAudiobooks()
        expect(global.fetch).toHaveBeenCalledWith('/api/audiobooks')

        await api.reorderProcessingQueue(['q1', 'q2'])
        expect(global.fetch).toHaveBeenCalledWith('/api/processing_queue/reorder', expect.objectContaining({ method: 'PUT' }))

        await api.removeProcessingQueue('q1')
        expect(global.fetch).toHaveBeenCalledWith('/api/processing_queue/q1', expect.objectContaining({ method: 'DELETE' }))

        await api.clearProcessingQueue()
        expect(global.fetch).toHaveBeenCalledWith('/api/processing_queue', expect.objectContaining({ method: 'DELETE' }))
    })
})
