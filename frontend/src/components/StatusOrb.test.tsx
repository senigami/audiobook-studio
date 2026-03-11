import { render } from '@testing-library/react'
import { StatusOrb } from './StatusOrb'
import { describe, it, expect } from 'vitest'
import type { Chapter } from '../types'

describe('StatusOrb', () => {
  const baseChapter: Chapter = {
    id: 'ch-1',
    project_id: 'p-1',
    title: 'Test Chapter',
    text_content: 'Test content',
    sort_order: 1,
    audio_status: 'unprocessed',
    audio_file_path: null,
    text_last_modified: Date.now(),
    audio_generated_at: Date.now() - 1000,
    char_count: 100,
    word_count: 20,
    sent_count: 2,
    predicted_audio_length: 10,
    audio_length_seconds: 0
  }

  it('renders correct tooltip with M4A and MP3 status', () => {
    const chap = { ...baseChapter, has_m4a: true, has_mp3: false }
    const { container } = render(<StatusOrb chap={chap} />)
    const orb = container.firstChild as HTMLElement
    
    expect(orb.getAttribute('title')).toContain('M4A cached: yes')
    expect(orb.getAttribute('title')).toContain('MP3 available: no')
  })

  it('renders arcs with correct opacity based on presence', () => {
    const chap = { 
      ...baseChapter, 
      has_m4a: true, 
      has_mp3: false,
      audio_generated_at: Date.now() + 1000 // Ensure not stale
    }
    const { container } = render(<StatusOrb chap={chap} />)
    
    // Find circles with ringRadius 10.2 in SVG
    const circles = container.querySelectorAll('circle')
    const arcs = Array.from(circles).filter(c => c.getAttribute('r') === '10.2')
    
    expect(arcs.length).toBe(2)
    
    // Find M4A arc (left/offset based)
    const m4aArc = arcs.find(a => a.getAttribute('stroke')?.includes('var(--accent)'))
    // Find MP3 arc (right/offset based)
    const mp3Arc = arcs.find(a => a.getAttribute('stroke')?.includes('var(--border)'))
    
    expect(m4aArc?.getAttribute('style')).toContain('opacity: 0.8')
    expect(mp3Arc?.getAttribute('style')).toContain('opacity: 0.3')
  })

  it('renders success fill when complete', () => {
    const chap: Chapter = { ...baseChapter, audio_status: 'done', has_wav: true, audio_generated_at: Date.now() + 1000 }
    const { container } = render(<StatusOrb chap={chap} />)
    const baseOrb = container.querySelector('circle[r="8"]')
    
    expect(baseOrb?.getAttribute('fill')).toBe('var(--success)')
  })
})
