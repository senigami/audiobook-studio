import { render, screen } from '@testing-library/react'
import { ProjectView } from './ProjectView'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api'

vi.mock('../api')

describe('ProjectView', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([])
    })

    const defaultProject = {
        id: '1',
        name: 'Test Project',
        series: null,
        author: 'Test Author',
        cover_image_path: null,
        created_at: 1000,
        updated_at: 2000
    }

    it('renders project details and fetches chapters', async () => {
        vi.mocked(api.fetchProject).mockResolvedValue(defaultProject)
        vi.mocked(api.fetchChapters).mockResolvedValue([
            {
                id: 'ch-1',
                project_id: '1',
                title: 'Chapter 1',
                text_content: 'Test content',
                sort_order: 1,
                audio_status: 'unprocessed',
                audio_file_path: null,
                text_last_modified: null,
                audio_generated_at: null,
                char_count: 100,
                word_count: 20,
                sent_count: 2,
                predicted_audio_length: 10,
                audio_length_seconds: 0
            }
        ])

        render(
            <MemoryRouter initialEntries={['/project/1']}>
                <Routes>
                    <Route path="/project/:projectId" element={
                        <ProjectView jobs={{}} speakerProfiles={[]} speakers={[]} />
                    } />
                </Routes>
            </MemoryRouter>
        )

        expect(await screen.findByText('Test Project')).toBeTruthy()
        expect(await screen.findByText('Chapter 1')).toBeTruthy()
    })

    it('renders assembly history with duration and relative time', async () => {
        vi.mocked(api.fetchProject).mockResolvedValue(defaultProject)
        vi.mocked(api.fetchChapters).mockResolvedValue([])
        vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([
            {
                filename: 'test.m4b',
                title: 'Test Audiobook',
                created_at: Math.floor(Date.now() / 1000) - 3600, // 1h ago
                size_bytes: 1024 * 1024 * 10, // 10MB
                duration_seconds: 7200, // 2h
                cover_url: null
            }
        ])

        render(
            <MemoryRouter initialEntries={['/project/1']}>
                <Routes>
                    <Route path="/project/:projectId" element={
                        <ProjectView jobs={{}} speakerProfiles={[]} speakers={[]} />
                    } />
                </Routes>
            </MemoryRouter>
        )

        // screen.debug()
        expect(await screen.findByText('Assemblies (1)')).toBeTruthy()
        expect(await screen.findByText('Test Audiobook')).toBeTruthy()
        expect(await screen.findByText(/1h ago/)).toBeTruthy()
        expect(await screen.findByText(/2h 0m/)).toBeTruthy()
        expect((await screen.findAllByText(/MB/)).length).toBeGreaterThan(0)
    })

    it('renders empty state for assembly history', async () => {
        vi.mocked(api.fetchProject).mockResolvedValue(defaultProject)
        vi.mocked(api.fetchChapters).mockResolvedValue([])
        vi.mocked(api.fetchProjectAudiobooks).mockResolvedValue([])

        render(
            <MemoryRouter initialEntries={['/project/1']}>
                <Routes>
                    <Route path="/project/:projectId" element={
                        <ProjectView jobs={{}} speakerProfiles={[]} speakers={[]} />
                    } />
                </Routes>
            </MemoryRouter>
        )

        expect(await screen.findByText('No assemblies yet')).toBeTruthy()
    })
})
