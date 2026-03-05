import { render, screen, fireEvent } from '@testing-library/react'
import { ChapterEditor } from './ChapterEditor'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { api } from '../api'

// Mock the API
vi.mock('../api', () => ({
  api: {
    fetchChapters: vi.fn(),
    fetchSegments: vi.fn(),
    fetchCharacters: vi.fn(),
    analyzeChapter: vi.fn(),
    updateChapter: vi.fn().mockResolvedValue({ status: 'success' }),
    generateSegments: vi.fn()
  }
}))

// Mock useWebSocket
vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ connected: true }))
}))

describe('ChapterEditor Tests', () => {
  const mockChapter = {
    id: 'chap1',
    project_id: 'proj1',
    title: 'Test Chapter',
    text_content: 'Line 1.\nLine 2.',
    audio_status: 'unprocessed',
    char_count: 100,
    word_count: 20
  }

  beforeEach(() => {
    vi.clearAllMocks()
    ;(api.fetchChapters as any).mockResolvedValue([mockChapter])
    ;(api.fetchSegments as any).mockResolvedValue([])
    ;(api.fetchCharacters as any).mockResolvedValue([])
  })

  it('highlights currently processing segments in purple', async () => {
    const mockSegments = [
      { id: 'seg1', text_content: 'Segment 1', audio_status: 'done', audio_file_path: 's1.wav', character_id: null },
      { id: 'seg2', text_content: 'Segment 2', audio_status: 'processing', audio_file_path: null, character_id: null }
    ]
    ;(api.fetchSegments as any).mockResolvedValue(mockSegments)

    render(
      <ChapterEditor 
        chapterId="chap1" 
        projectId="proj1" 
        speakerProfiles={[]} 
        speakers={[]}
        onBack={() => {}} 
        onNavigateToQueue={() => {}} 
      />
    )

    // Ensure initial load
    expect(await screen.findByDisplayValue('Test Chapter')).toBeInTheDocument()
    
    // Switch to performance tab - need to wait for it since it might re-render
    const perfTab = screen.getByText('Performance')
    fireEvent.click(perfTab)

    // Now wait for segments to appear in the DOM
    const segmentText = await screen.findByText(/Segment 1.*Segment 2/)
    
    // The segment block should have the purple processing highlight
    expect(segmentText).toHaveStyle('background: #e1bee733')
  })

  it('shows "Saved" state correctly after normalization', async () => {
    render(
      <ChapterEditor 
        chapterId="chap1" 
        projectId="proj1" 
        speakerProfiles={[]} 
        speakers={[]}
        onBack={() => {}} 
        onNavigateToQueue={() => {}} 
      />
    )

    expect(await screen.findByDisplayValue('Test Chapter')).toBeInTheDocument()
    expect(screen.getByText('Saved')).toBeInTheDocument()
  })
})
