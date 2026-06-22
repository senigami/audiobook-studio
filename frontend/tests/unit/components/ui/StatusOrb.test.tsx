import { render, screen } from '@testing-library/react'
import { StatusOrb } from '@/components/ui/StatusOrb'
import { describe, it, expect } from 'vitest'
import type { Chapter, Job } from '@/types'

describe('StatusOrb', () => {
  const baseChapter: Chapter = {
    id: 'ch-1',
    project_id: 'p-1',
    title: 'Test Chapter',
    text_content: 'Test content',
    speaker_profile_name: null,
    sort_order: 1,
    audio_status: 'unprocessed',
    audio_file_path: null,
    text_last_modified: 1000,
    audio_generated_at: 500,
    char_count: 100,
    word_count: 20,
    sent_count: 2,
    predicted_audio_length: 10,
    audio_length_seconds: 0
  }

  it('has role=img and a descriptive aria-label (A8)', () => {
    const chap = { ...baseChapter, audio_status: 'done' as const, has_wav: true, audio_generated_at: 2000 }
    render(<StatusOrb chap={chap} />)
    const orb = screen.getByRole('img')
    expect(orb).toBeTruthy()
    expect(orb.getAttribute('aria-label')).toBeTruthy()
    expect(orb.getAttribute('aria-label')).toContain('WAV rendered')
  })

  it('renders correct tooltip with M4A status', () => {
    const chap = { ...baseChapter, has_m4a: true, has_mp3: false }
    const { container } = render(<StatusOrb chap={chap} />)
    const orb = container.firstChild as HTMLElement
    
    expect(orb.getAttribute('title')).toContain('M4A cached: yes')
    expect(orb.getAttribute('title')).not.toContain('MP3 available')
  })

  it('renders ring with correct opacity based on presence', () => {
    const chap = {
      ...baseChapter,
      has_m4a: true,
      has_mp3: false,
      audio_generated_at: 2000 // Ensure not stale (2000 > 1000)
    }
    const { container } = render(<StatusOrb chap={chap} />)

    // Find circles with ringRadius 10.2 in SVG
    const circles = container.querySelectorAll('circle')
    const rings = Array.from(circles).filter(c => c.getAttribute('r') === '10.2')

    expect(rings.length).toBe(1)

    // P3: M4A ring uses --status-cached-ring token
    const m4aRing = rings.find(a => a.getAttribute('stroke')?.includes('var(--status-cached-ring)'))

    expect(m4aRing?.getAttribute('style')).toContain('opacity: 0.8')
  })

  it('renders success ring when complete (P3: fill is tint, ring is --success)', () => {
    const chap: Chapter = { ...baseChapter, audio_status: 'done', has_wav: true, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} />)
    const baseOrb = container.querySelector('circle[r="8"]')

    // P3: orb fill is a subtle tint; the ring stroke carries the success color
    expect(baseOrb?.getAttribute('fill')).toBe('rgba(22,163,74,.10)')
    expect(baseOrb?.getAttribute('stroke')).toBe('var(--success)')
  })

  it('renders queued state instead of interrupted when a chapter is waiting to attach a live job', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'processing' as const, audio_generated_at: null }
    const { container } = render(<StatusOrb chap={chap} />)

    // P3: queued now uses Clock (not RefreshCw/animate-spin) — Clock is static, not spinning
    expect(container.querySelector('[data-testid="orb-icon-queued"]')).toBeTruthy()
    const orb = container.firstChild as HTMLElement
    expect(orb.getAttribute('aria-label')).toContain('Queued for rendering')
  })

  it('renders partial progress even when a wav already exists during rebuild', () => {
    const chap = { ...baseChapter, has_wav: true, audio_status: 'unprocessed' as const, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} doneSegments={9} totalSegments={10} />)

    expect(container.querySelector('circle[r="8"][stroke="var(--accent)"]')).toBeTruthy()
  })

  it('renders a full ring when all segments are rendered but no wav exists yet', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'unprocessed' as const, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} doneSegments={10} totalSegments={10} />)

    const progressArc = container.querySelector('circle[r="8"][stroke="var(--accent)"]')
    expect(progressArc).toBeTruthy()
    expect(progressArc?.getAttribute('stroke-dashoffset')).toBe('0')
  })

  // P3 icon-inset tests (INV-4: state conveyed by icon + color, not color alone)
  it('P3: queued state renders Clock icon (not RefreshCw)', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'processing' as const, audio_generated_at: null }
    const { container } = render(<StatusOrb chap={chap} />)
    // Clock icon renders as SVG; query by data-testid set on the icon wrapper
    const iconWrapper = container.querySelector('[data-testid="orb-icon-queued"]')
    expect(iconWrapper).toBeTruthy()
  })

  it('P3: running state renders Loader2 icon', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'processing' as const, audio_generated_at: null }
    const activeJob = { id: 'j1', status: 'processing', progress: 0.5 } as unknown as Job
    const { container } = render(<StatusOrb chap={chap} activeJob={activeJob} />)
    const iconWrapper = container.querySelector('[data-testid="orb-icon-running"]')
    expect(iconWrapper).toBeTruthy()
  })

  it('P3: done state renders Check icon', () => {
    const chap: Chapter = { ...baseChapter, audio_status: 'done', has_wav: true, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} />)
    const iconWrapper = container.querySelector('[data-testid="orb-icon-done"]')
    expect(iconWrapper).toBeTruthy()
  })

  it('P3: error state renders X icon (not ! span)', () => {
    const chap: Chapter = { ...baseChapter, audio_status: 'error' as const }
    const { container } = render(<StatusOrb chap={chap} />)
    const iconWrapper = container.querySelector('[data-testid="orb-icon-error"]')
    expect(iconWrapper).toBeTruthy()
    // Must NOT render the old "!" text span (the icon wrapper span is allowed)
    const allSpans = Array.from(container.querySelectorAll('span'))
    const bangSpan = allSpans.find(s => s.textContent === '!' && !s.dataset.testid)
    expect(bangSpan).toBeUndefined()
  })
})
