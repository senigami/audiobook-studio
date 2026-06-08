import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { ProgressBarTestPage } from '@/pages/DevProgressBar/DevProgressBarPage'
import { publishStudioSocketMessage } from '@/store/studioSocketBus'

describe('ProgressBarTestPage', () => {
  it('does not apply launch-state edits to the live preview until launch is clicked', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.getAllByText('25%').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'queued' } })
    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '0.67' } })

    expect(screen.getAllByText('25%').length).toBeGreaterThan(0)
    expect(screen.queryByText('67%')).toBeNull()

    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
      expect(screen.getAllByText('queued').length).toBeGreaterThan(0)
    })
  })

  it('launches from the configured initial state without resetting progress', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '0.67' } })
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[0], { target: { value: '300' } })
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Custom Run' } })

    expect(screen.getByDisplayValue('0.67')).toBeTruthy()
    expect(screen.getAllByDisplayValue('300').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('67%').length).toBeGreaterThan(0)
    })

    expect(screen.getAllByDisplayValue('300').length).toBeGreaterThan(0)
    expect(screen.getByText('Custom Run')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Progress'), { target: { value: '0.12' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('12%').length).toBeGreaterThan(0)
    })
  })

  it('launches queued and preparing runs using the selected status', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.getByTitle(/The lifecycle state being simulated/)).toBeTruthy()
    expect(screen.getAllByTitle('Set this timestamp to the current unix time.').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'queued' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('Bar status').length).toBeGreaterThan(0)
      expect(screen.getAllByText('queued').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'preparing' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    await waitFor(() => {
      expect(screen.getAllByText('preparing').length).toBeGreaterThan(0)
    })
    expect(screen.getAllByText('0%').length).toBeGreaterThan(0)
  })

  it('seeds startedAt to now when a preparing run becomes running without a handoff timestamp', async () => {
    render(<ProgressBarTestPage />)

    fireEvent.change(screen.getByLabelText('Checkpoint Mode'), { target: { value: 'default' } })
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'preparing' } })
    fireEvent.change(screen.getAllByLabelText('Progress')[0], { target: { value: '0.00' } })
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[0], { target: { value: '120' } })
    fireEvent.click(screen.getByText('Launch From Config'))

    fireEvent.change(screen.getAllByRole('slider')[1], { target: { value: '1' } })
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[1], { target: { value: '120' } })
    fireEvent.change(screen.getByLabelText('Update Status'), { target: { value: 'running' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getAllByText(/ETA:/).length).toBeGreaterThan(0)
    })
  })

  it('uses absolute live update fields instead of delta controls', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.queryByLabelText('Progress Delta %')).toBeNull()
    expect(screen.queryByLabelText('ETA Delta Seconds')).toBeNull()
    expect(screen.queryByLabelText('Started At (unix)')).toBeNull()

    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[1], { target: { value: '45' } })
    fireEvent.change(screen.getByLabelText('Update Status'), { target: { value: 'finalizing' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByText(/Applied live update:/)).toBeTruthy()
    })
  })

  it('reflects segments.progress payload in the debug panel and raw frame inspector', async () => {
    render(<ProgressBarTestPage />)

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        ids: { segmentId: 'seg-123', jobId: 'job-123', chapterId: 'chap-123', projectId: 'proj-123' },
        payload: {
          status: 'running',
          progress: 0.85,
          activeSegmentId: 'seg-123',
          activeSegmentProgress: 0.45,
          etaSeconds: 120,
          reasonCode: 'segment_progress_tick',
        },
      })
    })

    await waitFor(() => {
      // Active source should be socket
      expect(screen.getByText('Socket event')).toBeTruthy()

      // The raw frame inspector (textarea) should show the frame JSON
      const textarea = screen.getByTestId('raw-frame-inspector') as HTMLTextAreaElement
      expect(textarea.value).toContain('segments.progress')
      expect(textarea.value).toContain('seg-123')
      expect(textarea.value).toContain('0.45')

      // Grid fields are present
      expect(screen.getAllByText('seg-123').length).toBeGreaterThan(0)
      expect(screen.getAllByText('job-123').length).toBeGreaterThan(0)
      expect(screen.getAllByText('0.45').length).toBeGreaterThan(0)
    })
  })

  it('distinguishes launch-config state from socket-fed segment state', async () => {
    render(<ProgressBarTestPage />)

    // Initially should be Launch Config
    expect(screen.getByText('Launch config')).toBeTruthy()

    // Send socket update
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        payload: {
          status: 'running',
          progress: 0.85,
        },
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Socket event')).toBeTruthy()
    })

    // Send manual update
    fireEvent.change(screen.getAllByLabelText('ETA Seconds')[1], { target: { value: '45' } })
    fireEvent.click(screen.getByText('Send Update'))

    await waitFor(() => {
      expect(screen.getByText('Manual update')).toBeTruthy()
    })
  })

  it('uses the segment progress contract on the preview page without confidence-scaling live targets', async () => {
    render(<ProgressBarTestPage />)

    expect(screen.getByTestId('dev-progress-bar-preview')).toHaveTextContent('25%')
    expect(screen.queryByText(/ETA:/)).toBeNull()

    fireEvent.click(screen.getByText('+10%'))

    await waitFor(() => {
      expect(screen.getByTestId('dev-progress-bar-preview')).toHaveTextContent('35%')
    })
  })

  it('proves unrelated topics do not update DevProgressBar state and show in ignored topics list', async () => {
    render(<ProgressBarTestPage />)

    // Initially active source is launch config
    expect(screen.getByText('Launch config')).toBeTruthy()

    // Verify ignored topics indicators are explicitly shown
    expect(screen.getByText('queue.items (Ignored)')).toBeTruthy()
    expect(screen.getByText('chapters.progress (Ignored)')).toBeTruthy()
    expect(screen.getByText('tts.logs (Ignored)')).toBeTruthy()

    // Send unrelated topics
    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'queue.items',
        eventKind: 'queue_item_status',
        payload: { status: 'running' }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Launch config')).toBeTruthy()
      expect(screen.getByText('Last ignored event:')).toBeTruthy()
      expect(screen.getByTestId('last-ignored-event-topic').textContent).toBe('queue.items')
    })

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'chapters.progress',
        eventKind: 'chapter_progress',
        payload: { status: 'running' }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Launch config')).toBeTruthy()
      expect(screen.getByTestId('last-ignored-event-topic').textContent).toBe('chapters.progress')
    })

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'tts.logs',
        eventKind: 'tts_log',
        payload: { line: 'some tts log' }
      })
    })

    await waitFor(() => {
      expect(screen.getByText('Launch config')).toBeTruthy()
      expect(screen.getByTestId('last-ignored-event-topic').textContent).toBe('tts.logs')
    })
  })

  it('proves the preview bar renders with data-testid="dev-progress-bar-preview"', async () => {
    render(<ProgressBarTestPage />)
    expect(screen.getByTestId('dev-progress-bar-preview')).toBeInTheDocument()
  })
})
