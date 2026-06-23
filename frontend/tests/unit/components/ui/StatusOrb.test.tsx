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

  it('renders M4A exported tooltip for M4A-only state', () => {
    // audio_generated_at > text_last_modified to avoid the isStale branch taking priority
    const chap = { ...baseChapter, has_m4a: true, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} />)
    const orb = container.firstChild as HTMLElement

    // M4A state now encoded visually (gold fill); tooltip says 'M4A exported'
    expect(orb.getAttribute('title')).toContain('M4A exported')
  })

  it('renders gold orb fill when M4A is present', () => {
    const chap = {
      ...baseChapter,
      has_m4a: true,
      audio_generated_at: 2000 // Ensure not stale (2000 > 1000)
    }
    const { container } = render(<StatusOrb chap={chap} />)

    // M4A state: gold fill + darker gold border on the base orb (r=8)
    const baseOrb = container.querySelector('circle[r="8"]')
    expect(baseOrb?.getAttribute('fill')).toBe('var(--status-m4a)')
    expect(baseOrb?.getAttribute('stroke')).toBe('var(--status-m4a-border)')
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

    expect(container.querySelector('circle[r="9.5"][stroke="var(--accent)"]')).toBeTruthy()
  })

  it('renders a full ring when all segments are rendered but no wav exists yet', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'unprocessed' as const, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} doneSegments={10} totalSegments={10} />)

    const progressArc = container.querySelector('circle[r="9.5"][stroke="var(--accent)"]')
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

  it('renders partial arc at actual segment percentage, not forced to 100%', () => {
    // R1: before fix, isPartial forced percent=100 → dashoffset=0 (full ring shown at 50%)
    // After fix: dashoffset reflects actual 50% — half the circumference (2π×8 × 0.5 ≈ 25.13)
    const chap = { ...baseChapter, has_wav: false, audio_status: 'unprocessed' as const, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} doneSegments={5} totalSegments={10} />)

    const arc = container.querySelector('circle[r="9.5"][stroke="var(--accent)"]')
    expect(arc).toBeTruthy()

    const dashoffset = parseFloat(arc?.getAttribute('stroke-dashoffset') ?? '0')
    // r=9.5 → circumference ≈ 59.69; 50% → dashoffset ≈ 29.85
    expect(dashoffset).toBeGreaterThan(29)
    expect(dashoffset).toBeLessThan(31)
  })

  it('renders gold orb with black check icon for WAV + M4A state', () => {
    const chap = { ...baseChapter, audio_status: 'done' as const, has_wav: true, has_m4a: true, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} />)

    const baseOrb = container.querySelector('circle[r="8"]')
    expect(baseOrb?.getAttribute('fill')).toBe('var(--status-m4a)')
    expect(container.querySelector('[data-testid="orb-icon-gold-done"]')).toBeTruthy()
  })

  it('renders no center icon for M4A-only state (just gold fill)', () => {
    const chap = { ...baseChapter, has_m4a: true, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} />)

    // No check mark, no archive icon — gold fill communicates the state
    expect(container.querySelector('[data-testid="orb-icon-gold-done"]')).toBeNull()
    expect(container.querySelector('[data-testid="orb-icon-cached"]')).toBeNull()
    const baseOrb = container.querySelector('circle[r="8"]')
    expect(baseOrb?.getAttribute('fill')).toBe('var(--status-m4a)')
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
