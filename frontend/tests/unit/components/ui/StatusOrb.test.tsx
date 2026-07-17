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

    expect(container.querySelector('circle[r="9.5"][stroke="var(--action-primary)"]')).toBeTruthy()
  })

  it('renders a full ring when all segments are rendered but no wav exists yet', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'unprocessed' as const, audio_generated_at: 2000 }
    const { container } = render(<StatusOrb chap={chap} doneSegments={10} totalSegments={10} />)

    const progressArc = container.querySelector('circle[r="9.5"][stroke="var(--action-primary)"]')
    expect(progressArc).toBeTruthy()
    expect(progressArc?.getAttribute('stroke-dashoffset')).toBe('0')
  })

  // P3 icon-inset tests (INV-4: state conveyed by icon + color, not color alone)
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

    const arc = container.querySelector('circle[r="9.5"][stroke="var(--action-primary)"]')
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

  // Preparing tier (StatusOrb parity with ScriptView §2.7): a live job in the
  // model-load window shows a distinct dimmed/pulsing orb, NOT the running spinner.
  // Preparing signal derived from the same fields useStudioChapter uses:
  // reason_code ∈ {SEGMENT_PENDING, LOADING_MODEL} || indeterminate === true.
  it('preparing job renders the preparing tier, not the running spinner (LOADING_MODEL)', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'processing' as const, audio_generated_at: null }
    const activeJob = { id: 'j1', status: 'preparing', progress: 0, reason_code: 'LOADING_MODEL' } as unknown as Job
    const { container } = render(<StatusOrb chap={chap} activeJob={activeJob} />)

    // No spinning running icon during preparing…
    expect(container.querySelector('[data-testid="orb-icon-running"]')).toBeNull()
    // …a distinct preparing marker is shown instead.
    expect(container.querySelector('[data-testid="orb-icon-preparing"]')).toBeTruthy()
    const orb = container.firstChild as HTMLElement
    expect(orb.getAttribute('aria-label')).toContain('Preparing')
  })

  it('preparing tier triggers on indeterminate flag alone', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'processing' as const, audio_generated_at: null }
    const activeJob = { id: 'j1', status: 'running', progress: 0, indeterminate: true } as unknown as Job
    const { container } = render(<StatusOrb chap={chap} activeJob={activeJob} />)
    expect(container.querySelector('[data-testid="orb-icon-running"]')).toBeNull()
    expect(container.querySelector('[data-testid="orb-icon-preparing"]')).toBeTruthy()
  })

  it('preparing tier uses a reduced-motion-safe calm pulse, not a spinner class', () => {
    const chap = { ...baseChapter, has_wav: false, audio_status: 'processing' as const, audio_generated_at: null }
    const activeJob = { id: 'j1', status: 'preparing', progress: 0, reason_code: 'SEGMENT_PENDING' } as unknown as Job
    const { container } = render(<StatusOrb chap={chap} activeJob={activeJob} />)

    // No animate-spin anywhere in the preparing orb (spinner is the running-only cue).
    expect(container.querySelector('.animate-spin')).toBeNull()
    // The pulse rides the orb-scoped .orb-is-preparing class (not bare .is-preparing,
    // which ScriptView uses on body text), which base.css re-enables under
    // prefers-reduced-motion (calm opacity breathe, no movement).
    expect(container.querySelector('.orb-is-preparing')).toBeTruthy()
    // Guard the F1 regression: the orb must NOT use the bare class that would leak
    // the global animation onto ScriptView's script-mode preparing text spans.
    expect(container.querySelector('.is-preparing')).toBeNull()
  })

  it('shows the live segment arc at real done/total while a job is actively rendering', () => {
    // The new ask: the ring reflects completed-vs-total segments DURING an active
    // render (running), not only in the idle stable state. Real counts, not fabricated.
    const chap = { ...baseChapter, has_wav: false, audio_status: 'processing' as const, audio_generated_at: null }
    const activeJob = { id: 'j1', status: 'running', progress: 0.5 } as unknown as Job
    const { container } = render(<StatusOrb chap={chap} activeJob={activeJob} doneSegments={5} totalSegments={10} />)

    const arc = container.querySelector('circle[r="9.5"][stroke="var(--accent)"]')
    expect(arc).toBeTruthy()
    const dashoffset = parseFloat(arc?.getAttribute('stroke-dashoffset') ?? '0')
    // r=9.5 → circumference ≈ 59.69; 50% done → dashoffset ≈ 29.85
    expect(dashoffset).toBeGreaterThan(29)
    expect(dashoffset).toBeLessThan(31)
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
